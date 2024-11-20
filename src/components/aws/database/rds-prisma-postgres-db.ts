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
import { getRdsPostgresDatadogInitScript } from "./rds-postgres-datadog-script";

const engineVersion = "16.3";
const family = `postgres${engineVersion.split(".")[0]}`;

export const datadogSchemaAndRoleName = "datadog";
export const datadogDbPasswordSecretNamePrefix = "datadog-rds-secret-";

export class RdsPrismaPostgresDb extends pulumi.ComponentResource {
	db: aws.rds.Instance;
	rdsSubnetGroup: aws.rds.SubnetGroup;
	roles: Array<{ originalName: string; role: postgresql.Role }> = [];
	paramGroup: aws.rds.ParameterGroup;

	constructor(opts: RdsPrismaOptions) {
		const { name: rdsName, sharedNameOpts } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.databaseInstance,
		});

		super(AwsResourceTypes.databaseInstance, rdsName, {}, opts.pulumiOpts);

		const paramGroup = this.createParameterGroup(opts);
		this.paramGroup = paramGroup;

		const { rds, rdsSubnetGroup } = this.createRdsInstance(
			opts,
			rdsName,
			this.paramGroup,
		);
		this.db = rds;
		this.rdsSubnetGroup = rdsSubnetGroup;

		const secretObject = this.getRdsMasterSecret(this.db);

		const pgProvider = new postgresql.Provider(
			"pg-provider",
			{
				host: this.db.address,
				port: 5432,
				username: secretObject.apply((secret) => secret.username),
				password: secretObject.apply((secret) => {
					return secret.password;
				}),
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

		if (opts.datadog) {
			this.setupToEnableDatadog(
				opts,
				this.db,
				pgProvider,
				migrationCommand,
				secretObject,
			);
		}

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

	private createParameterGroup = (opts: RdsPrismaOptions) => {
		const paramGroupName = buildResourceName({
			...opts,
			type: AwsResourceTypes.rdsParamGroup,
		});

		const datadogParamGroupSettings = {
			shared_preload_libraries: "pg_stat_statements",
			track_activity_query_size: "4096",
			"pg_stat_statements.track": "ALL",
			"pg_stat_statements.max": "10000",
			"pg_stat_statements.track_utility": "off",
			track_io_timing: "on",
		};

		const paramGroup = new aws.rds.ParameterGroup(paramGroupName, {
			name: paramGroupName,
			family: family,
			parameters: Object.entries(datadogParamGroupSettings).map(
				([name, value]) => ({
					name: name,
					value: value,
					applyMethod: "pending-reboot", // Most of these parameters require a reboot
				}),
			),
		});

		return paramGroup;
	};

	private createRdsInstance = (
		opts: RdsPrismaOptions,
		rdsName: string,
		paramGroup: aws.rds.ParameterGroup,
	) => {
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
			engineVersion: "16.3",
			instanceClass: aws.rds.InstanceType.T3_Micro,
			availabilityZone: opts.availabilityZone,
			manageMasterUserPassword: true,
			publiclyAccessible: opts.publiclyAccessible,
			iamDatabaseAuthenticationEnabled: true,
			dbSubnetGroupName: rdsSubnetGroup.name,
			skipFinalSnapshot: false,
			vpcSecurityGroupIds: [rdsSecurityGroup.id],
			finalSnapshotIdentifier: `${rdsName}-final-snapshot`,
			parameterGroupName: paramGroup.name,
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

	private getDatadogRdsPassword = (opts: RdsPrismaOptions) => {
		const datadogSecret = aws.secretsmanager.getSecretVersion({
			secretId: `${datadogDbPasswordSecretNamePrefix}${opts.name}`,
		});

		const datadogSecretString = datadogSecret.then(
			(secret) => secret.secretString,
		);
		const secretObject: ParsedSecret = pulumi.jsonParse(
			datadogSecretString,
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
		} ${this.getDatabaseConnectionString(opts, secretObject, db)}`;

		return new local.Command(
			"postgres-migration-command",
			{
				create: migrationScriptCommand,
				triggers: [randomUUID()],
			},
			{ dependsOn: pgProvider },
		);
	};

	private getDatabaseConnectionString = (
		opts: RdsPrismaOptions,
		secretObject: pulumi.Output<{ username: string; password: string }>,
		db: aws.rds.Instance,
	) => {
		return pulumi.interpolate`postgresql://${secretObject.apply(
			(secret) => secret.username,
		)}:${secretObject.apply((secret) => encodeURIComponent(secret.password))}@${
			db.endpoint
		}/${opts.databaseName}`;
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
				password: role.password.apply((password) => password),
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

		return {
			role: newRole,
			originalName: baseRoleName,
		};
	};

	private setupToEnableDatadog = (
		opts: RdsPrismaOptions,
		db: aws.rds.Instance,
		pgProvider: postgresql.Provider,
		migrationCommand: local.Command,
		secretObject: pulumi.Output<{ username: string; password: string }>,
	) => {
		const baseRoleName = `datadog-${opts.name}`;
		const fullRoleName = buildResourceName({
			...opts,
			name: baseRoleName,
			type: PostgresqlResourceTypes.role,
		});

		const password = this.getDatadogRdsPassword(opts);

		const newRole = new postgresql.Role(
			fullRoleName,
			{
				login: true,
				name: baseRoleName,
				password: password.password,
			},
			{
				provider: pgProvider,
				// ensure that only created once db fully set up and migrated
				dependsOn: [migrationCommand],
			},
		);

		const dbConnectionString = this.getDatabaseConnectionString(
			opts,
			secretObject,
			db,
		);

		const datadogInitCommand = getRdsPostgresDatadogInitScript({
			dbConnectionString,
		});

		new local.Command(
			"postgres-datadog-init-command",
			{
				create: datadogInitCommand,
				triggers: [randomUUID()],
			},
			{ dependsOn: pgProvider },
		);

		return {
			role: newRole,
			originalName: baseRoleName,
		};
	};
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
	password: pulumi.Output<string>;
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
	datadog?: boolean;
};
