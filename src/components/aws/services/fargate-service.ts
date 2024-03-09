import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import {
	buildHostName,
	buildResourceName,
} from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "../resource-name-builder";

export class FargateService extends pulumi.ComponentResource {
	service: awsx.ecs.FargateService;
	targetGroup: aws.lb.TargetGroup;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const fargateServiceName = buildResourceName({
			...sharedNameOpts,
			type: ResourceTypes.fargateService,
		});

		super(
			awsResourceType(ResourceTypes.fargateService),
			fargateServiceName,
			{},
			opts.pulumiOpts,
		);

		const targetGroupName = buildResourceName({
			...sharedNameOpts,
			type: ResourceTypes.targetGroup,
		});

		this.targetGroup = new aws.lb.TargetGroup(targetGroupName, {
			healthCheck: {
				enabled: true,
				unhealthyThreshold: 5,
				path: "/health",
			},
			vpcId: opts.vpcId,
			port: opts.servicePort,
			deregistrationDelay: 120,
			protocol: "http",
			name: targetGroupName,
			loadBalancingAlgorithmType: "leastOutstandingRequests",
		});

		const listenerRuleName = buildResourceName({
			...sharedNameOpts,
			type: ResourceTypes.lbListenerRule,
		});

		const hostname = buildHostName(sharedNameOpts);

		new aws.lb.ListenerRule(listenerRuleName, {
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
			type: ResourceTypes.taskDefinition,
		});

		const serviceContainerName = buildResourceName({
			...sharedNameOpts,
			type: ResourceTypes.serviceContainer,
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
				taskDefinitionArgs: {
					cpu: settings.cpu,
					memory: settings.memory,
					family: taskDefinitionName,
					containers: {
						[serviceContainerName]: {
							name: serviceContainerName,
							image: opts.serviceImageUrn,
							portMappings: [
								{
									containerPort: opts.servicePort,
									hostPort: opts.servicePort,
								},
							],
						},
					},
				},
				...opts.originalFargateServiceOpts,
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}

// default settings for prod - 2 instances
// 1 container is always the default in general
// set cpu and memory
// in what ways configurable?
// well can override everything of course
// could have settings for service task definition - should always be that
// but there is only one task definition anyway
// settings for service container
// and then could provide settings for other containers
// instance count can be independent
// container-level cpu and memory for service container configurable
// likewise task-level
// set default scheduling for non-prod, but allow overrides - so parameters for that
//

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
	clusterArn: string;
	serviceImageUrn: string;
	loadBalancerArn: string;
	vpcId: string;
	desiredCount?: number;
	cpu?: string;
	memory?: string;
	servicePort: number;
	httpsCertificateArn: string;
	listenerArn: pulumi.Input<string>;
};
