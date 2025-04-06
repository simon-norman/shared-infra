import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName, buildResourceName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { RdsPrismaPostgresDb } from "../database/rds-prisma-postgres-db";
import { fusionAuthSecretName } from "../services/rds/get-fusion-auth-rds-password";

export class FusionAuthServerExt extends pulumi.ComponentResource {
	public readonly instance: aws.ec2.Instance;
	public readonly securityGroup: aws.ec2.SecurityGroup;
	public readonly db: RdsPrismaPostgresDb;
	public readonly instanceProfile: aws.iam.InstanceProfile;

	constructor(opts: FusionAuthServerOptions) {
		const { name: serverName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.fusionAuthServer,
		});

		super(AwsResourceTypes.fusionAuthServer, serverName, {}, opts.pulumiOpts);

		this.db = this.createDb(opts);

		const { instanceProfile, secret } =
			this.enableInstanceToFetchDatabasePassword(opts);

		this.securityGroup = this.createSecurityGroup(opts);
		this.instanceProfile = instanceProfile;
		const userData = this.getEc2InstanceInitScript(secret.arn);
		this.instance = this.createInstance(serverName, userData, opts);
	}

	private createSecurityGroup(opts: FusionAuthServerOptions) {
		const securityGroupName = buildResourceName({
			...opts,
			name: "fusion-auth-server",
			type: AwsResourceTypes.securityGroup,
		});

		return new aws.ec2.SecurityGroup(
			securityGroupName,
			{
				vpcId: opts.vpcId,
				ingress: [
					{
						protocol: "tcp",
						fromPort: 9011,
						toPort: 9011,
						cidrBlocks: ["0.0.0.0/0"],
					},
					{
						protocol: "tcp",
						fromPort: 9011,
						toPort: 9011,
						cidrBlocks: ["0.0.0.0/0"], // Or restrict to specific IPs
					},
				],
				egress: [
					{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
				],
			},
			{ parent: this },
		);
	}

	private enableInstanceToFetchDatabasePassword(opts: FusionAuthServerOptions) {
		const roleName = buildResourceName({
			...opts,
			name: "datadog-db-agent-role",
			type: AwsResourceTypes.role,
		});

		const role = new aws.iam.Role(
			roleName,
			{
				assumeRolePolicy: JSON.stringify({
					Version: "2012-10-17",
					Statement: [
						{
							Action: "sts:AssumeRole",
							Effect: "Allow",
							Principal: {
								Service: "ec2.amazonaws.com",
							},
						},
					],
				}),
			},
			{ parent: this },
		);

		const policyName = buildResourceName({
			...opts,
			name: "fusion-auth-server-policy",
			type: AwsResourceTypes.rolePolicy,
		});

		const fusionAuthSecret = aws.secretsmanager.getSecretOutput({
			name: fusionAuthSecretName,
		});

		new aws.iam.RolePolicy(
			policyName,
			{
				role: role.id,
				policy: {
					Version: "2012-10-17",
					Statement: [
						{
							Effect: "Allow",
							Action: ["secretsmanager:GetSecretValue"],
							Resource: [fusionAuthSecret.arn, this.db.masterSecretArn],
						},
					],
				},
			},
			{ parent: this },
		);

		const ssmPolicyName = buildResourceName({
			...opts,
			name: "ec2-ssm-agent",
			type: AwsResourceTypes.policyAttachment,
		});
		new aws.iam.RolePolicyAttachment(ssmPolicyName, {
			role: role.name,
			policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM",
		});

		// profile is actual mechanism to allow ec2 instance to assume role
		const instanceProfileName = buildResourceName({
			...opts,
			name: "fusion-auth-policy",
			type: AwsResourceTypes.rolePolicy,
		});

		const instanceProfile = new aws.iam.InstanceProfile(
			instanceProfileName,
			{
				role: role.name,
			},
			{ parent: this },
		);

		return { instanceProfile, secret: fusionAuthSecret };
	}

	private getEc2InstanceInitScript(databaseSecretArn: pulumi.Output<string>) {
		return pulumi.interpolate`#!/bin/bash

# Log startup script execution
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting user data script execution at $(date)"

# Install required packages
if ! command -v aws &> /dev/null; then
   yum install -y unzip
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   ./aws/install
   rm -f awscliv2.zip
   rm -rf aws/
fi

if ! command -v jq &> /dev/null; then
   yum install -y jq
fi

# Get secrets
echo "Fetching secrets..."
DATABASE_PASSWORD=$(aws secretsmanager get-secret-value --secret-id "${databaseSecretArn}" \
   --query 'SecretString' --output text | \
   jq -r '.PASSWORD')

if [ -z "$DATABASE_PASSWORD" ]; then
   echo "Failed to extract database password from secret"
   exit 1
fi

# Setup Datadog configuration
echo "Setting up Datadog configuration..."
mkdir -p /etc/datadog-agent/conf.d/postgres.d

# Install fusion auth
echo "Installing Fusion Auth..."
curl -o docker-compose.yml https://raw.githubusercontent.com/FusionAuth/fusionauth-containers/main/docker/fusionauth/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/FusionAuth/fusionauth-containers/main/docker/fusionauth/.env
DATABASE_PASSWORD=DATABASE_PASSWORD docker-compose up -d

echo "Completed user data script execution at $(date)"`;
	}

	private createInstance(
		name: string,
		userData: pulumi.Output<string>,
		opts: FusionAuthServerOptions,
	) {
		return new aws.ec2.Instance(
			`${name}-instance`,
			{
				ami: "ami-0b2ed2e3df8cf9080",
				instanceType: "t2.micro",
				vpcSecurityGroupIds: [this.securityGroup.id],
				iamInstanceProfile: this.instanceProfile.name,
				userData: userData,
				subnetId: opts.subnetId,
				userDataReplaceOnChange: true,
				tags: { Name: `${name}-instance` },
			},
			{ parent: this },
		);
	}

	private createDb(opts: FusionAuthServerOptions) {
		return new RdsPrismaPostgresDb({
			region: opts.region,
			name: "fusion-auth-db-instance",
			environment: opts.environment,
			vpcId: opts.vpcId,
			databaseName: "fusion_auth",
			availabilityZone: opts.database.availabilityZone,
			publiclyAccessible: true,
			securityGroupIds: [],
			subnetIds: opts.database.subnetIds,
			migrationScriptPath: "./migration-script.sh",
			datadog: true,
			roles: [
				{
					password: opts.fusionAuthPassword,
					name: "fusionauth",
					grants: [
						{
							grantName: "all-tables",
							database: "fusion_auth",
							objectType: "table",
							objects: [],
							privileges: ["ALL"],
							schema: "public",
						},
						{
							grantName: "all-sequences",
							database: "fusion_auth",
							objectType: "sequence",
							objects: [],
							privileges: ["ALL"],
							schema: "public",
						},
						{
							grantName: "all-functions",
							database: "fusion_auth",
							objectType: "function",
							objects: [],
							privileges: ["ALL"],
							schema: "public",
						},
						{
							grantName: "all-procedures",
							database: "fusion_auth",
							objectType: "procedure",
							objects: [],
							privileges: ["ALL"],
							schema: "public",
						},
						{
							grantName: "all-types",
							database: "fusion_auth",
							objectType: "type",
							objects: [],
							privileges: ["USAGE"],
							schema: "public",
						},
						{
							grantName: "all-schemas",
							database: "fusion_auth",
							objectType: "schema",
							objects: [],
							privileges: ["CREATE", "USAGE"],
							schema: "public",
						},
						{
							grantName: "database",
							database: "fusion_auth",
							objectType: "database",
							objects: [],
							privileges: ["ALL"],
						},
					],
				},
			],
		});
	}
}

export type FusionAuthServerOptions = BaseComponentInput & {
	vpcId: pulumi.Input<string>;
	subnetId: pulumi.Input<string>;
	fusionAuthPassword: pulumi.Input<string>;
	database: {
		availabilityZone: pulumi.Input<string>;
		subnetIds: pulumi.Input<pulumi.Input<string>[]>;
	};
};
