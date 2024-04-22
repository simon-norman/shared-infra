// import { spawnSync } from "child_process";
import { randomUUID } from "node:crypto";
import * as aws from "@pulumi/aws";
import * as postgresql from "@pulumi/postgresql";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { PostgresqlResourceTypes } from "src/shared-types/postgresql-resource-types";
import { awsResourceType } from "../resource-name-builder";

export class RdsPrismaPostgresDb extends pulumi.ComponentResource {
	db: aws.rds.Instance;
	rdsSubnetGroup: aws.rds.SubnetGroup;
	tempRole: postgresql.Role;
	roles: Array<{ originalName: string; role: postgresql.Role }> = [];

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const rdsName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.databaseInstance,
		});

		super(
			awsResourceType(AwsResourceTypes.loadBalancer),
			rdsName,
			{},
			opts.pulumiOpts,
		);

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

		const pgProvider = new postgresql.Provider("pg-provider", {
			host: this.db.address,
			port: 5432,
			username: secretObject.apply((secret) => secret.username),
			password: secretObject.apply((secret) => secret.password),
			database: opts.databaseName,
			sslmode: "require",
		});

		const tempRoleName = buildResourceName({
			...sharedNameOpts,
			type: PostgresqlResourceTypes.role,
		});

		const password = randomUUID();

		const now = new Date();
		const futureDate = new Date(now.getTime() + 30 * 60000);
		const futureDatePostgresFormat = futureDate
			.toISOString()
			.replace("T", " ")
			.replace("Z", "");

		this.tempRole = new postgresql.Role(
			tempRoleName,
			{
				login: true,
				name: `${tempRoleName}-${randomUUID()}`,
				password: password,
				validUntil: futureDatePostgresFormat,
			},
			{ provider: pgProvider },
		);

		// if (opts.migrationScriptPath) {
		// 	const postgresUrl = pulumi.interpolate`postgresql://${this.tempRole.name}:${password}@${this.db.endpoint}/${dbName}`;
		// 	postgresUrl.apply((url) => {
		// 		if (!opts.migrationScriptPath) return;
		// 		const result = spawnSync("bash", [opts.migrationScriptPath, url]);
		// 		if (result.error) throw new Error(`migration failed - ${result.error}`);
		// 	});
		// }

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
					password: password,
					validUntil: futureDatePostgresFormat,
				},
				{ provider: pgProvider },
			);

			grants.map(
				(grant) =>
					new postgresql.Grant(`${newRoleName}-${randomUUID()}`, {
						...grant,
						database: this.db.dbName,
						role: newRoleName,
					}),
			);

			const roleGrantName = buildResourceName({
				...sharedNameOpts,
				name: `${roleName}-iam`,
				type: PostgresqlResourceTypes.roleGrant,
			});

			new postgresql.GrantRole(roleGrantName, {
				grantRole: "rds_iam",
				role: newRoleName,
			});

			return {
				role,
				originalName: roleName,
			};
		});

		this.registerOutputs();
	}
}

type GrantArgs = Omit<postgresql.GrantArgs, "role">;

type Role = {
	name: string;
	grants: GrantArgs[];
};

type Options = {
	originalRdsOpts?: aws.rds.InstanceArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	databaseName: pulumi.Input<string>;
	environment: string;
	availabilityZone: pulumi.Input<string>;
	region: string;
	migrationScriptPath?: string;
	subnetIds: pulumi.Input<pulumi.Input<string>[]>;
	vpcId: pulumi.Input<string>;
	roles: Role[];
	securityGroupIds: pulumi.Input<pulumi.Input<string>[]>;
};
