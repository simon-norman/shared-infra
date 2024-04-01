import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
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
			// @ts-expect-error - parameter is in pulumi docs but missing in types - https://www.pulumi.com/registry/packages/awsx/api-docs/ecr/image/#imagetag_nodejs
			imageTag: `${opts.name}:latest`,
			target: "release",
			platform: "linux/amd64",
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
	subnets: pulumi.Input<pulumi.Input<string>[]>;
	securityGroups: pulumi.Input<pulumi.Input<string>[]>;
};
