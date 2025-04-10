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
	// public readonly securityGroup: aws.ec2.SecurityGroup;
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

		// this.securityGroup = this.createSecurityGroup(opts);
		this.instanceProfile = instanceProfile;
		const userData = this.getEc2InstanceInitScript();
		this.instance = this.createInstance(serverName, userData, opts);

		// Add API Gateway with direct connection to EC2
		const { apiUrl, api, integration } = this.createDirectApiGateway(opts);

		// Export the API URL as a public property
		this.apiUrl = apiUrl;

		// Create a route for the API Gateway
		this.createRoute({
			apiId: api.id,
			integrationId: integration.id,
		});

		// Create a stage for the API Gateway
		const stage = this.createStage({
			apiId: api.id,
		});

		// Create a domain name for the API Gateway
		const domainName = this.createDomainName();

		// Create a DNS record for the domain name
		this.createDnsRecord({
			targetDomainName: domainName.domainNameConfiguration.targetDomainName,
			targetHostedZoneId: domainName.domainNameConfiguration.hostedZoneId,
		});

		// Create an API mapping to connect the domain name to the API Gateway
		this.createApiMapping({
			domainNameId: domainName.id,
			apiId: api.id,
			stageId: stage.id, // Add the missing stageId parameter
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
				// vpcSecurityGroupIds: [this.securityGroup.id],
				iamInstanceProfile: this.instanceProfile.name,
				userData: userData,
				subnetId: opts.subnetId,
				userDataReplaceOnChange: true,
				tags: { Name: `${name}-instance` },
			},
			{ parent: this },
		);
	}

	// Add this method to your FusionAuthServer class
	private createDirectApiGateway(opts: FusionAuthServerOptions): {
		api: aws.apigatewayv2.Api;
		deployment: aws.apigateway.Deployment;
		apiUrl: pulumi.Output<string>;
		integration: aws.apigatewayv2.Integration;
	} {
		// Create HTTP API Gateway (v2) instead of REST API Gateway
		const apiName = buildResourceName({
			...opts,
			name: "fusion-auth-api",
			type: AwsResourceTypes.apiGateway,
		});

		const api = new aws.apigatewayv2.Api(
			apiName,
			{
				protocolType: "HTTP",
				description: "API Gateway for FusionAuth",
			},
			{ parent: this },
		);

		// Create the integration directly
		const integration = this.createIntegration({ apiId: api.id });

		// Deploy the API - Note: With HTTP APIs, this is handled differently
		const deploymentName = buildResourceName({
			...opts,
			name: "fusion-auth-deployment",
			type: AwsResourceTypes.apiGatewayDeployment,
		});

		// For backwards compatibility, we'll keep the deployment reference
		const deployment = new aws.apigateway.Deployment(
			deploymentName,
			{
				restApi: api.id.apply((id) => id),
				description: "Production deployment for FusionAuth API",
			},
			{ parent: this, dependsOn: [integration] },
		);

		// Construct the API URL
		const apiUrl = api.apiEndpoint.apply((endpoint) => `${endpoint}/`);

		return { api, deployment, apiUrl, integration };
	}

	private createIntegration = (
		params: IntegrationParams,
	): aws.apigatewayv2.Integration => {
		const { name: integrationName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGatewayIntegration,
		});

		return new aws.apigatewayv2.Integration(integrationName, {
			apiId: params.apiId,
			integrationType: "HTTP_PROXY",
			integrationUri: pulumi.interpolate`http://${this.instance.publicIp}:9011/{proxy}`,
			integrationMethod: "ANY",
			payloadFormatVersion: "1.0",
			requestParameters: {
				"integration.request.path.proxy": "$request.path.proxy",
			},
		});
	};

	private createDomainName = (): aws.apigatewayv2.DomainName => {
		const { name: domainName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGatewayDomainName,
		});
		const hostname = buildHostName({ ...this.opts });

		return new aws.apigatewayv2.DomainName(domainName, {
			domainName: hostname,
			domainNameConfiguration: {
				certificateArn: this.opts.certificateArn,
				endpointType: "REGIONAL",
				securityPolicy: "TLS_1_2",
			},
		});
	};

	private createRoute = (params: RouteParams): aws.apigatewayv2.Route => {
		const { name: routeName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGatewayRoute,
		});

		return new aws.apigatewayv2.Route(routeName, {
			apiId: params.apiId,
			routeKey: "ANY /{proxy+}",
			target: pulumi.interpolate`integrations/${params.integrationId}`,
		});
	};

	private createStage = (params: StageParams): aws.apigatewayv2.Stage => {
		const { name: stageName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGatewayStage,
		});

		return new aws.apigatewayv2.Stage(stageName, {
			apiId: params.apiId,
			name: "$default",
			autoDeploy: true,
		});
	};

	private createApiMapping = (
		params: ApiMappingParams,
	): aws.apigatewayv2.ApiMapping => {
		const { name: apiMappingName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGatewayMapping,
		});

		return new aws.apigatewayv2.ApiMapping(apiMappingName, {
			apiId: params.apiId,
			domainName: params.domainNameId,
			stage: params.stageId,
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

type ApiMappingParams = {
	apiId: pulumi.Input<string>;
	domainNameId: pulumi.Input<string>;
	stageId: pulumi.Input<string>; // This was missing in the original call
};

type StageParams = {
	apiId: pulumi.Input<string>;
};

type RouteParams = {
	apiId: pulumi.Input<string>;
	integrationId: pulumi.Input<string>;
};

type IntegrationParams = {
	apiId: pulumi.Input<string>;
};
