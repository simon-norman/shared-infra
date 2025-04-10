import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import {
	buildComponentName,
	buildHostName,
	buildResourceName,
} from "src/helpers";
import { AwsResourceTypes } from "src/shared-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class FusionAuthServer extends pulumi.ComponentResource {
	public readonly instance: aws.ec2.Instance;
	public readonly instanceProfile: aws.iam.InstanceProfile;
	public readonly apiUrl: pulumi.Output<string>;
	public readonly opts: FusionAuthServerOptions;

	constructor(opts: FusionAuthServerOptions) {
		const { name: serverName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.fusionAuthServer,
		});

		super(AwsResourceTypes.fusionAuthServer, serverName, {}, opts.pulumiOpts);
		this.opts = opts;

		const { instanceProfile } =
			this.enableInstanceToFetchDatabasePassword(opts);

		this.instanceProfile = instanceProfile;
		const userData = this.getEc2InstanceInitScript();
		this.instance = this.createInstance(serverName, userData, opts);

		// Create a REST API Gateway (v1) instead of HTTP API (v2)
		// REST API has better support for proxy integrations
		const { apiUrl } = this.createRestApiGateway(opts);

		// Export the API URL as a public property
		this.apiUrl = apiUrl;

		// Create custom domain if needed
		const domainName = this.createDomainName();

		this.createDnsRecord({
			targetDomainName: domainName.domainName,
			targetHostedZoneId: opts.hostedZoneId as string,
		});
	}

	private enableInstanceToFetchDatabasePassword(opts: FusionAuthServerOptions) {
		const roleName = buildResourceName({
			...opts,
			name: "fusion-auth-server-role",
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

		const ssmPolicyName = buildResourceName({
			...opts,
			name: "ec2-ssm-agent",
			type: AwsResourceTypes.policyAttachment,
		});
		new aws.iam.RolePolicyAttachment(ssmPolicyName, {
			role: role.name,
			policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM",
		});

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

		return { instanceProfile };
	}

	private getEc2InstanceInitScript() {
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

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
   echo "Installing Docker..."
   yum update -y
   yum install -y docker
   systemctl start docker
   systemctl enable docker
   usermod -a -G docker ec2-user
fi

# Install Docker Compose if not already installed
if ! command -v docker-compose &> /dev/null; then
   echo "Installing Docker Compose..."
  sudo curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-Linux-x86_64 -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  docker-compose version
fi

# Install fusion auth
mkdir -p /home/ec2-user/fusionauth
cd /home/ec2-user/fusionauth
echo "Installing Fusion Auth..."
curl -o docker-compose.yml https://raw.githubusercontent.com/FusionAuth/fusionauth-containers/main/docker/fusionauth/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/FusionAuth/fusionauth-containers/main/docker/fusionauth/.env
docker-compose up -d

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
				instanceType: "t2.medium",
				iamInstanceProfile: this.instanceProfile.name,
				userData: userData,
				subnetId: opts.subnetId,
				userDataReplaceOnChange: true,
				tags: { Name: `${name}-instance` },
			},
			{ parent: this },
		);
	}

	private createRestApiGateway(opts: FusionAuthServerOptions): {
		api: aws.apigateway.RestApi;
		deployment: aws.apigateway.Deployment;
		apiUrl: pulumi.Output<string>;
	} {
		// Create API Gateway
		const apiName = buildResourceName({
			...opts,
			name: "fusion-auth-api",
			type: AwsResourceTypes.apiGateway,
		});

		const api = new aws.apigateway.RestApi(
			apiName,
			{
				description: "API Gateway for FusionAuth",
				endpointConfiguration: {
					types: "REGIONAL",
				},
			},
			{ parent: this },
		);

		// Create a resource with a greedy path parameter to capture all paths
		const resourceName = buildResourceName({
			...opts,
			name: "fusion-auth-resource",
			type: AwsResourceTypes.apiGateway,
		});

		const resource = new aws.apigateway.Resource(
			resourceName,
			{
				restApi: api.id,
				parentId: api.rootResourceId,
				pathPart: "{proxy+}",
			},
			{ parent: this },
		);

		const methodName = buildResourceName({
			...opts,
			name: "fusion-auth-method",
			type: AwsResourceTypes.apiGatewayMethod,
		});

		const method = new aws.apigateway.Method(
			methodName,
			{
				restApi: api.id,
				resourceId: resource.id,
				httpMethod: "ANY",
				authorization: "NONE",
				requestParameters: {
					"method.request.path.proxy": true,
				},
			},
			{ parent: this },
		);

		// Create direct HTTP integration with the EC2 public IP
		const integrationName = buildResourceName({
			...opts,
			name: "fusion-auth-integration",
			type: AwsResourceTypes.apiGatewayIntegration,
		});

		const integration = new aws.apigateway.Integration(
			integrationName,
			{
				restApi: api.id,
				resourceId: resource.id,
				httpMethod: method.httpMethod,
				integrationHttpMethod: "ANY",
				type: "HTTP_PROXY",
				uri: pulumi.interpolate`http://${this.instance.publicIp}:9011/{proxy}`,
				requestParameters: {
					"integration.request.path.proxy": "method.request.path.proxy",
				},
			},
			{ parent: this },
		);

		// Deploy the API
		const deploymentName = buildResourceName({
			...opts,
			name: "fusion-auth-deployment",
			type: AwsResourceTypes.apiGatewayDeployment,
		});

		const deployment = new aws.apigateway.Deployment(
			deploymentName,
			{
				restApi: api.id,
				stageName: "prod",
				description: "Production deployment for FusionAuth API",
			},
			{ parent: this, dependsOn: [integration] },
		);

		// Create API Gateway stage settings with logging
		const stageSettingsName = buildResourceName({
			...opts,
			name: "fusion-auth-stage",
			type: AwsResourceTypes.apiGateway,
		});

		new aws.apigateway.MethodSettings(
			stageSettingsName,
			{
				restApi: api.id,
				stageName: deployment.stageName as pulumi.Output<string>,
				methodPath: "*/*",
				settings: {
					metricsEnabled: false,
					loggingLevel: "OFF",
					dataTraceEnabled: false,
				},
			},
			{ parent: this },
		);

		// Construct the API URL
		const apiUrl = pulumi.interpolate`${deployment.invokeUrl}/`;

		return { api, deployment, apiUrl };
	}

	private createDomainName = (): aws.apigateway.DomainName => {
		const { name: domainName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGatewayDomainName,
		});
		const hostname = buildHostName({ ...this.opts });

		return new aws.apigateway.DomainName(domainName, {
			domainName: hostname,
			certificateArn: this.opts.certificateArn,
			endpointConfiguration: {
				types: "REGIONAL",
			},
			securityPolicy: "TLS_1_2",
		});
	};

	private createDnsRecord = (params: DnsRecordParams): aws.route53.Record => {
		const { name: recordName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.dnsARecord,
		});

		const hostname = buildHostName({ ...this.opts });

		return new aws.route53.Record(recordName, {
			name: hostname,
			type: "A",
			zoneId: this.opts.hostedZoneId,
			aliases: [
				{
					name: params.targetDomainName,
					zoneId: params.targetHostedZoneId,
					evaluateTargetHealth: true,
				},
			],
		});
	};
}

export type FusionAuthServerOptions = BaseComponentInput & {
	subnetId: pulumi.Input<string>;
	hostedZoneId: pulumi.Input<string>;
	certificateArn: pulumi.Input<string>;
};

type DnsRecordParams = {
	targetDomainName: pulumi.Input<string>;
	targetHostedZoneId: pulumi.Input<string>;
};
