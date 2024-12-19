import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName, buildResourceName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { datadogDbPasswordSecretName } from "../services/rds/get-datadog-rds-password";

export class DatadogDatabaseMonitoringAgent extends pulumi.ComponentResource {
	public readonly instance: aws.ec2.Instance;
	public readonly securityGroup: aws.ec2.SecurityGroup;
	public readonly instanceProfile: aws.iam.InstanceProfile;

	constructor(opts: DatadogDatabaseMonitoringOptions) {
		const { name: rdsName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.datadogDbMonitoringAgent,
		});

		super(AwsResourceTypes.databaseInstance, rdsName, {}, opts.pulumiOpts);

		this.securityGroup = this.createSecurityGroup(opts);
		const { instanceProfile, secret } =
			this.enableInstanceToFetchDatabasePassword(opts);
		this.instanceProfile = instanceProfile;
		const userData = this.getEc2InstanceInitScript(opts, secret.arn);
		this.instance = this.createInstance(rdsName, userData, opts);
	}

	private createSecurityGroup(opts: DatadogDatabaseMonitoringOptions) {
		const securityGroupName = buildResourceName({
			...opts,
			name: "datadog-db-agent",
			type: AwsResourceTypes.securityGroup,
		});

		return new aws.ec2.SecurityGroup(
			securityGroupName,
			{
				vpcId: opts.vpcId,
				ingress: [
					{
						protocol: "tcp",
						fromPort: 22,
						toPort: 22,
						cidrBlocks: ["0.0.0.0/0"],
					},
				],
				egress: [
					{ protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
				],
			},
			{ parent: this },
		);
	}

	private enableInstanceToFetchDatabasePassword(
		opts: DatadogDatabaseMonitoringOptions,
	) {
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
			name: "datadog-db-agent-policy",
			type: AwsResourceTypes.rolePolicy,
		});

		const datadogDbPasswordSecret = aws.secretsmanager.getSecretOutput({
			name: datadogDbPasswordSecretName,
		});

		// so the ec2 instance can fetch the datadog api key (to send logs to datadog) and
		// the database password (to monitor the database)
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
							Resource: [
								datadogDbPasswordSecret.arn,
								opts.datadogApiKeySecretArn,
							],
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
			name: "datadog-db-agent-policy",
			type: AwsResourceTypes.rolePolicy,
		});

		const instanceProfile = new aws.iam.InstanceProfile(
			instanceProfileName,
			{
				role: role.name,
			},
			{ parent: this },
		);

		return { instanceProfile, secret: datadogDbPasswordSecret };
	}

	private getEc2InstanceInitScript(
		opts: DatadogDatabaseMonitoringOptions,
		databaseSecretArn: pulumi.Output<string>,
	) {
		const datadogConf = pulumi.output(opts.instances).apply((instances) => {
			const instancesYaml = instances
				.map(({ hostname, databaseName }) =>
					[
						"  - dbm: true",
						`    host: ${hostname}`,
						"    port: 5432",
						"    username: datadog",
						"    password: ${DATABASE_PASSWORD}",
						"    tags:",
						`      - dbinstanceidentifier:${databaseName}`,
					].join("\n"),
				)
				.join("\n");

			return `init_config:\ninstances:\n${instancesYaml}`;
		});

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

DATADOG_API_KEY=$(aws secretsmanager get-secret-value --secret-id ${opts.datadogApiKeySecretArn} \
   --query SecretString --output text)

if [ -z "$DATABASE_PASSWORD" ]; then
   echo "Failed to extract database password from secret"
   exit 1
fi

if [ -z "$DATADOG_API_KEY" ]; then
   echo "Failed to extract Datadog API key"
   exit 1
fi

# Setup Datadog configuration
echo "Setting up Datadog configuration..."
mkdir -p /etc/datadog-agent/conf.d/postgres.d

cat << EOF > /etc/datadog-agent/conf.d/postgres.d/conf.yaml
${datadogConf}
EOF

# Install Datadog agent
echo "Installing Datadog agent..."
DD_API_KEY="$DATADOG_API_KEY" DD_SITE="datadoghq.eu" bash -c "$(curl -L https://s3.amazonaws.com/dd-agent/scripts/install_script.sh)"

echo "Completed user data script execution at $(date)"`;
	}

	private createInstance(
		name: string,
		userData: pulumi.Output<string>,
		opts: DatadogDatabaseMonitoringOptions,
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
}

type DatabaseToMonitor = {
	hostname: pulumi.Output<string>;
	databaseName: string;
};

export type DatadogDatabaseMonitoringOptions = BaseComponentInput & {
	vpcId: pulumi.Input<string>;
	instances: DatabaseToMonitor[];
	datadogApiKeySecretArn: string;
	subnetId: pulumi.Input<string>;
};
