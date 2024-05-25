import { randomUUID } from "node:crypto";
import * as aws from "@pulumi/aws";
import { local } from "@pulumi/command";
import * as postgresql from "@pulumi/postgresql";
import * as pulumi from "@pulumi/pulumi";
import { SharedNameOptions, buildComponentName } from "src/helpers";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { PostgresqlResourceTypes } from "src/shared-types/postgresql-resource-types";

export class RdsPrismaPostgresDb extends pulumi.ComponentResource {
	db: aws.rds.Instance;
	rdsSubnetGroup: aws.rds.SubnetGroup;
	roles: Array<{ originalName: string; role: postgresql.Role }> = [];

	constructor(opts: RdsPrismaOptions) {
		const { name: rdsName, sharedNameOpts } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.databaseInstance,
		});

		super(AwsResourceTypes.databaseInstance, rdsName, {}, opts.pulumiOpts);

		const { rds, rdsSubnetGroup } = this.createRdsInstance(opts, rdsName);
		this.db = rds;
		this.rdsSubnetGroup = rdsSubnetGroup;

		const secretObject = this.getRdsMasterSecret(this.db);

		const pgProvider = new postgresql.Provider(
			"pg-provider",
			{
				host: this.db.address,
				port: 5432,
				username: secretObject.apply((secret) => secret.username),
				password: secretObject.apply((secret) => secret.password),
				database: opts.databaseName,
				sslmode: "require",
				superuser: false,
			},
			{ dependsOn: [this.db] },
		);

		const migrationCommand = this.runDbMigration(
			opts,
			secretObject,
			pgProvider,
			this.db,
		);

		this.roles = opts.roles.map((role) =>
			this.addRoleToDatabase(role, {
				sharedNameOpts,
				pgProvider,
				migrationCommand,
				db: this.db,
			}),
		);

		this.registerOutputs();
	}

	private createSecurityGroup = (opts: RdsPrismaOptions) => {
		const rdsSecurityGroupName = buildResourceName({
			...opts,
			name: `${opts.name}-rds`,
			type: AwsResourceTypes.securityGroup,
		});

		if (opts.publiclyAccessible)
			return this.securityGroupAllowingPublicTraffic(
				rdsSecurityGroupName,
				opts,
			);

		return this.securityGroupAllowingInternalTraffic(
			rdsSecurityGroupName,
			opts,
		);
	};

	private securityGroupAllowingPublicTraffic = (
		name: string,
		opts: RdsPrismaOptions,
	) => {
		return new aws.ec2.SecurityGroup(name, {
			vpcId: opts.vpcId,
			description: "Allow traffic from the internet",
			ingress: [
				{
					protocol: "tcp",
					fromPort: 5432,
					toPort: 5432,
					cidrBlocks: ["0.0.0.0/0"],
				},
			],
		});
	};

	private securityGroupAllowingInternalTraffic = (
		name: string,
		opts: RdsPrismaOptions,
	) => {
		return new aws.ec2.SecurityGroup(name, {
			vpcId: opts.vpcId,
			description: "Allow traffic from within subnet and Fargate",
			ingress: [
				{
					protocol: "tcp",
					fromPort: 5432,
					toPort: 5432,
					securityGroups: opts.securityGroupIds,
				},
			],
		});
	};

	private createRdsInstance = (opts: RdsPrismaOptions, rdsName: string) => {
		const subnetGroupName = buildResourceName({
			...opts,
			type: AwsResourceTypes.subnetGroup,
		});

		const rdsSecurityGroup = this.createSecurityGroup(opts);

		const rdsSubnetGroup = new aws.rds.SubnetGroup(subnetGroupName, {
			subnetIds: opts.subnetIds,
		});

		const rds = new aws.rds.Instance(rdsName, {
			...opts.originalRdsOpts,
			allocatedStorage: 20,
			maxAllocatedStorage: 100,
			dbName: opts.databaseName,
			identifier: rdsName,
			engine: "postgres",
			username: "postgres",
			engineVersion: "16.1",
			instanceClass: aws.rds.InstanceType.T3_Micro,
			availabilityZone: opts.availabilityZone,
			manageMasterUserPassword: true,
			publiclyAccessible: opts.publiclyAccessible,
			iamDatabaseAuthenticationEnabled: true,
			dbSubnetGroupName: rdsSubnetGroup.name,
			vpcSecurityGroupIds: [rdsSecurityGroup.id],
		});

		return { rds, rdsSubnetGroup };
	};

	private getRdsMasterSecret = (db: aws.rds.Instance) => {
		const masterSecretString = db.masterUserSecrets.apply((secret) => {
			const masterSecret = aws.secretsmanager.getSecretVersion({
				secretId: secret[0].secretArn,
			});

			return masterSecret.then((secret) => secret.secretString);
		});

		const secretObject: ParsedSecret = pulumi.jsonParse(
			masterSecretString,
		) as ParsedSecret;

		return secretObject;
	};

	private runDbMigration = (
		opts: RdsPrismaOptions,
		secretObject: pulumi.Output<{ username: string; password: string }>,
		pgProvider: postgresql.Provider,
		db: aws.rds.Instance,
	) => {
		const migrationScriptCommand = pulumi.interpolate`bash ${
			opts.migrationScriptPath || ""
		} 'postgresql://${secretObject.apply(
			(secret) => secret.username,
		)}:${secretObject.apply((secret) => encodeURIComponent(secret.password))}@${
			db.endpoint
		}/${opts.databaseName}'`;

		return new local.Command(
			"postgres-migration-command",
			{
				create: migrationScriptCommand,
				triggers: [randomUUID()],
			},
			{ dependsOn: pgProvider },
		);
	};

	private addRoleToDatabase = (role: Role, roleParams: RoleParams) => {
		const { name: baseRoleName, grants } = role;

		const fullRoleName = buildResourceName({
			...roleParams.sharedNameOpts,
			name: baseRoleName,
			type: PostgresqlResourceTypes.role,
		});

		const newRole = new postgresql.Role(
			fullRoleName,
			{
				login: true,
				name: baseRoleName,
				// as using rds AWS IAM authentication, the password is irrelevant and postgres will not accept login with
				// the password
			},
			{
				provider: roleParams.pgProvider,
				dependsOn: [roleParams.migrationCommand],
			},
		);

		grants.map(
			(grant) =>
				new postgresql.Grant(
					`${fullRoleName}-grant-${grant.grantName}`,
					{
						...grant,
						database: roleParams.db.dbName,
						role: baseRoleName,
					},
					{
						dependsOn: [roleParams.migrationCommand, newRole],
						provider: roleParams.pgProvider,
					},
				),
		);

		this.addIamGrantToRole(roleParams, baseRoleName, newRole);

		return {
			role: newRole,
			originalName: baseRoleName,
		};
	};

	/**
	 * Adds the AWS RDS IAM role to this role, which enables it to access the database with iam auth rather than
	 * username / password (more secure)
	 */
	private addIamGrantToRole(
		roleParams: RoleParams,
		baseRoleName: string,
		role: postgresql.Role,
	) {
		const roleGrantName = buildResourceName({
			...roleParams.sharedNameOpts,
			name: `${baseRoleName}-aws-iam`,
			type: PostgresqlResourceTypes.roleGrant,
		});

		new postgresql.GrantRole(
			roleGrantName,
			{
				grantRole: "rds_iam",
				role: baseRoleName,
			},
			{
				provider: roleParams.pgProvider,
				dependsOn: [roleParams.migrationCommand, role],
			},
		);
	}
}

type RoleParams = {
	sharedNameOpts: SharedNameOptions;
	pgProvider: postgresql.Provider;
	migrationCommand: local.Command;
	db: aws.rds.Instance;
};

type GrantArgs = Omit<postgresql.GrantArgs, "role"> & {
	grantName: pulumi.Input<string>;
};

type Role = {
	name: string;
	grants: GrantArgs[];
};

type ParsedSecret = pulumi.Output<{ username: string; password: string }>;

export type RdsPrismaOptions = BaseComponentInput & {
	originalRdsOpts?: aws.rds.InstanceArgs;
	databaseName: pulumi.Input<string>;
	availabilityZone: pulumi.Input<string>;
	migrationScriptPath?: string;
	publiclyAccessible?: boolean;
	subnetIds: pulumi.Input<pulumi.Input<string>[]>;
	vpcId: pulumi.Input<string>;
	roles: Role[];
	securityGroupIds: pulumi.Input<pulumi.Input<string>[]>;
};
