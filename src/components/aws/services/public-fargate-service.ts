import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { getAccountIdFromArn } from "src/helpers/get-account-id-arn";
import {
	buildHostName,
	buildResourceName,
} from "src/helpers/resource-name-builder";
import { elbHostedZones } from "src/shared-types/aws-elb-hosted-zone";
import { AwsRegion } from "src/shared-types/aws-regions";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { awsResourceType } from "../resource-name-builder";

export class PublicFargateService extends pulumi.ComponentResource {
	service: awsx.ecs.FargateService;
	targetGroup: aws.lb.TargetGroup;
	listenerRule: aws.lb.ListenerRule;
	dnsARecord: aws.route53.Record;
	image: awsx.ecr.Image;
	ecrRepo: awsx.ecr.Repository;
	secretAccessPolicy: aws.iam.Policy;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const fargateServiceName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.fargateService,
		});

		super(
			awsResourceType(AwsResourceTypes.fargateService),
			fargateServiceName,
			{},
			opts.pulumiOpts,
		);

		const ecrRepoName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.imageRepository,
		});

		const imageAgeLimitInDays = 3;
		this.ecrRepo = new awsx.ecr.Repository(ecrRepoName, {
			name: ecrRepoName,
			forceDelete: true,
			lifecyclePolicy: {
				rules: [
					{
						description: `Remove untagged images after ${imageAgeLimitInDays}`,
						tagStatus: "untagged",
						maximumAgeLimit: imageAgeLimitInDays,
					},
				],
			},
		});

		const imageName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.image,
		});
		this.image = new awsx.ecr.Image(imageName, {
			repositoryUrl: this.ecrRepo.url,
			context: opts.serviceDockerContext,
			dockerfile: opts.serviceDockerfilePath,
			target: opts.serviceDockerfileTarget,
			// @ts-expect-error - parameter is in pulumi docs but missing in types - https://www.pulumi.com/registry/packages/awsx/api-docs/ecr/image/#imagetag_nodejs
			imageTag: `${opts.name}:latest`,
			platform: "linux/amd64",
			args: {
				ENV: opts.environment,
			},
		});

		const targetGroupName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.targetGroup,
		});

		this.targetGroup = new aws.lb.TargetGroup(
			targetGroupName,
			{
				healthCheck: {
					enabled: true,
					unhealthyThreshold: 5,
					path: "/health",
				},
				vpcId: opts.vpcId,
				port: opts.servicePort,
				deregistrationDelay: 120,
				protocol: "HTTP",
				name: targetGroupName,
				targetType: "ip",
				loadBalancingAlgorithmType: "least_outstanding_requests",
			},
			{ deleteBeforeReplace: true },
		);

		const listenerRuleName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.lbListenerRule,
		});

		const hostname = buildHostName(sharedNameOpts);

		this.listenerRule = new aws.lb.ListenerRule(listenerRuleName, {
			listenerArn: opts.listenerArn,
			actions: [
				{
					type: "forward",
					targetGroupArn: this.targetGroup.arn,
				},
			],
			conditions: [
				{
					hostHeader: {
						values: [hostname],
					},
				},
			],
		});

		const serviceSecretArn = aws.secretsmanager
			.getSecret({
				name: `${opts.name}-${opts.environment}/doppler`,
			})
			.then((secret) => secret.arn);

		const secretAccessPolicyName = buildResourceName({
			...sharedNameOpts,
			name: `${opts.name}-secrets`,
			type: AwsResourceTypes.permissionsPolicy,
		});

		const accountId = this.targetGroup.arn.apply(getAccountIdFromArn);

		const policyStatements: aws.iam.PolicyStatement[] = [
			{
				Effect: "Allow",
				Action: [
					"secretsmanager:GetSecretValue",
					"secretsmanager:DescribeSecret",
				],
				Resource: serviceSecretArn,
			},
		];

		if (opts.db) {
			policyStatements.push({
				Effect: "Allow",
				Action: "rds-db:connect",
				Resource: pulumi.interpolate`arn:aws:rds-db:${opts.region}:${accountId}:dbuser:${opts.db.awsDbInstanceId}/${opts.db.dbRoleName}`,
			});
		}

		this.secretAccessPolicy = new aws.iam.Policy(secretAccessPolicyName, {
			description:
				"Policy that grants access to the application's secrets in AWS Secrets Manager",
			policy: {
				Version: "2012-10-17",
				Statement: policyStatements,
			},
		});

		const policyArn = this.secretAccessPolicy.arn.apply((value) => value);

		const defaultSettings =
			opts.environment === "production"
				? defaultProdSettings()
				: defaultNonProdSettings();

		const settings = {
			...defaultSettings,
			...opts,
		};

		const taskDefinitionName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.taskDefinition,
		});

		const serviceContainerName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.serviceContainer,
		});

		this.service = new awsx.ecs.FargateService(
			fargateServiceName,
			{
				name: fargateServiceName,
				cluster: opts.clusterArn,
				loadBalancers: [
					{
						targetGroupArn: this.targetGroup.arn,
						containerName: serviceContainerName,
						containerPort: opts.servicePort,
					},
				],
				forceNewDeployment: true,
				desiredCount: settings.desiredCount,
				networkConfiguration: {
					subnets: opts.subnets,
					securityGroups: opts.securityGroups,
				},
				taskDefinitionArgs: {
					cpu: settings.cpu,
					memory: settings.memory,
					family: taskDefinitionName,
					taskRole: {
						args: {
							managedPolicyArns: [policyArn],
						},
					},
					containers: {
						[serviceContainerName]: {
							name: serviceContainerName,
							image: this.image.imageUri,
							portMappings: [
								{
									containerPort: opts.servicePort,
								},
							],
						},
					},
				},
				...opts.originalFargateServiceOpts,
			},
			{ parent: this },
		);

		const dnsARecordName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.dnsARecord,
		});

		this.dnsARecord = new aws.route53.Record(
			dnsARecordName,
			{
				name: hostname,
				zoneId: opts.environmentHostedZoneId,
				type: "A",
				aliases: [
					{
						name: opts.loadBalancerDnsName,
						zoneId: elbHostedZones[opts.region as AwsRegion],
						evaluateTargetHealth: true,
					},
				],
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}

const defaultProdSettings = () => {
	return {
		desiredCount: 2,
		cpu: "512",
		memory: "1024",
	};
};

const defaultNonProdSettings = () => {
	return {
		desiredCount: 1,
		cpu: "256",
		memory: "512",
	};
};

type Options = {
	originalFargateServiceOpts?: awsx.ecs.FargateServiceArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	clusterArn: pulumi.Input<string>;
	loadBalancerArn: pulumi.Input<string>;
	vpcId: pulumi.Input<string>;
	desiredCount?: number;
	cpu?: string;
	memory?: string;
	servicePort: number;
	httpsCertificateArn: pulumi.Input<string>;
	listenerArn: pulumi.Input<string>;
	environmentHostedZoneId: pulumi.Input<string>;
	loadBalancerDnsName: pulumi.Input<string>;
	serviceDockerContext: string;
	serviceDockerfilePath: string;
	serviceDockerfileTarget: string;
	subnets: pulumi.Input<pulumi.Input<string>[]>;
	securityGroups: pulumi.Input<pulumi.Input<string>[]>;
	db?: {
		dbRoleName: pulumi.Input<string>;
		awsDbInstanceId: pulumi.Input<string>;
	};
};
