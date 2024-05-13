import { randomUUID } from "node:crypto";
import * as aws from "@pulumi/aws";
import { local } from "@pulumi/command";
import * as postgresql from "@pulumi/postgresql";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { PostgresqlResourceTypes } from "src/shared-types/postgresql-resource-types";

export class RdsPrismaPostgresDb extends pulumi.ComponentResource {
	db: aws.rds.Instance;
	rdsSubnetGroup: aws.rds.SubnetGroup;
	roles: Array<{ originalName: string; role: postgresql.Role }> = [];

	constructor(opts: Options) {
		const { name: rdsName, sharedNameOpts } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.databaseInstance,
		});

		super(AwsResourceTypes.databaseInstance, rdsName, {}, opts.pulumiOpts);

		const subnetGroupName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.subnetGroup,
		});

		const rdsSecurityGroupName = buildResourceName({
			...sharedNameOpts,
			name: `${sharedNameOpts.name}-rds`,
			type: AwsResourceTypes.securityGroup,
		});

		const rdsSecurityGroup = new aws.ec2.SecurityGroup(rdsSecurityGroupName, {
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

		this.rdsSubnetGroup = new aws.rds.SubnetGroup(subnetGroupName, {
			subnetIds: opts.subnetIds,
		});

		this.db = new aws.rds.Instance(rdsName, {
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
			iamDatabaseAuthenticationEnabled: true,
			dbSubnetGroupName: this.rdsSubnetGroup.name,
			vpcSecurityGroupIds: [rdsSecurityGroup.id],
		});

		const masterSecretString = this.db.masterUserSecrets.apply((secret) => {
			const masterSecret = aws.secretsmanager.getSecretVersion({
				secretId: secret[0].secretArn,
			});

			return masterSecret.then((secret) => secret.secretString);
		});

		const secretObject = pulumi.jsonParse(masterSecretString);

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

		const migrationScriptCommand = pulumi.interpolate`bash ${
			opts.migrationScriptPath || ""
		} 'postgresql://${secretObject.apply(
			(secret) => secret.username,
		)}:${secretObject.apply((secret) => secret.password)}@${this.db.endpoint}/${
			opts.databaseName
		}'`;

		const migrationCommand = new local.Command(
			"postgres-migration-command",
			{
				create: migrationScriptCommand,
				triggers: [randomUUID()],
			},
			{ dependsOn: pgProvider },
		);

		this.roles = opts.roles.map(({ name: roleName, grants }) => {
			const newRoleName = buildResourceName({
				...sharedNameOpts,
				name: roleName,
				type: PostgresqlResourceTypes.role,
			});

			const role = new postgresql.Role(
				newRoleName,
				{
					login: true,
					name: newRoleName,
					// as using rds AWS IAM authentication, the password is irrelevant and postgres will not accept login with
					// the password
					password: "",
				},
				{ provider: pgProvider, dependsOn: [migrationCommand] },
			);

			grants.map(
				(grant) =>
					new postgresql.Grant(
						`${newRoleName}-grant-${grant.grantName}`,
						{
							...grant,
							database: this.db.dbName,
							role: newRoleName,
						},
						{ dependsOn: [migrationCommand], provider: pgProvider },
					),
			);

			const roleGrantName = buildResourceName({
				...sharedNameOpts,
				name: `${roleName}-aws-iam`,
				type: PostgresqlResourceTypes.roleGrant,
			});

			new postgresql.GrantRole(
				roleGrantName,
				{
					grantRole: "rds_iam",
					role: newRoleName,
				},
				{ provider: pgProvider, dependsOn: [migrationCommand] },
			);

			return {
				role,
				originalName: roleName,
			};
		});

		this.registerOutputs();
	}
}

type GrantArgs = Omit<postgresql.GrantArgs, "role"> & {
	grantName: pulumi.Input<string>;
};

type Role = {
	name: string;
	grants: GrantArgs[];
};

type Options = BaseComponentInput & {
	originalRdsOpts?: aws.rds.InstanceArgs;
	databaseName: pulumi.Input<string>;
	availabilityZone: pulumi.Input<string>;
	migrationScriptPath?: string;
	subnetIds: pulumi.Input<pulumi.Input<string>[]>;
	vpcId: pulumi.Input<string>;
	roles: Role[];
	securityGroupIds: pulumi.Input<pulumi.Input<string>[]>;
};
