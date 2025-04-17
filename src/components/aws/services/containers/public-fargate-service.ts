import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import {
	buildHostName,
	buildResourceName,
} from "src/helpers/resource-name-builder";
import { elbHostedZones } from "src/shared-types/aws-elb-hosted-zone";
import { AwsRegion } from "src/shared-types/aws-regions";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { EnvVariable, SecretInput } from "src/shared-types/environment-vars";
import { EcrRepoImage } from "./ecr-repo-image";

export class PublicFargateService extends pulumi.ComponentResource {
	service: awsx.ecs.FargateService;
	targetGroup: aws.lb.TargetGroup;
	listenerRule: aws.lb.ListenerRule;
	dnsARecord: aws.route53.Record;
	image: awsx.ecr.Image;
	ecrRepo: awsx.ecr.Repository;
	secretAccessPolicy: aws.iam.Policy;

	constructor(opts: Options) {
		const { name: fargateServiceName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.fargateService,
		});

		super(
			AwsResourceTypes.fargateService,
			fargateServiceName,
			{},
			opts.pulumiOpts,
		);

		const imageRepo = new EcrRepoImage(opts);
		this.image = imageRepo.image;
		this.ecrRepo = imageRepo.ecrRepo;

		const { targetGroup, listenerRule, hostname } =
			this.configureLoadBalancer(opts);

		this.targetGroup = targetGroup;
		this.listenerRule = listenerRule;

		const { policyArn, secretAccessPolicy } = this.createServiceRole(opts);
		this.secretAccessPolicy = secretAccessPolicy;

		const { service } = this.buildService(
			opts,
			fargateServiceName,
			targetGroup,
			policyArn,
			this.image,
		);
		this.service = service;

		const { dnsARecord } = this.addDnsToRouteToLoadBalancer(opts, hostname);
		this.dnsARecord = dnsARecord;

		this.registerOutputs();
	}

	private createServiceRole = (opts: Options) => {
		const serviceSecretArn = aws.secretsmanager
			.getSecret({
				name: `${opts.name}-${
					opts.baseEnvironment || opts.environment
				}/doppler`,
			})
			.then((secret) => secret.arn);

		const secretAccessPolicyName = buildResourceName({
			...opts,
			name: `${opts.name}-secrets`,
			type: AwsResourceTypes.permissionsPolicy,
		});

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

		const secretAccessPolicy = new aws.iam.Policy(secretAccessPolicyName, {
			description:
				"Policy that grants access to the application's secrets in AWS Secrets Manager",
			policy: {
				Version: "2012-10-17",
				Statement: policyStatements,
			},
		});

		const policyArn = secretAccessPolicy.arn.apply((value) => value);

		return { policyArn, secretAccessPolicy };
	};

	private configureLoadBalancer = (opts: Options) => {
		const targetGroupName = buildResourceName({
			...opts,
			type: AwsResourceTypes.targetGroup,
		});

		const targetGroup = new aws.lb.TargetGroup(
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
			...opts,
			type: AwsResourceTypes.lbListenerRule,
		});

		const hostname = buildHostName(opts);

		const listenerRule = new aws.lb.ListenerRule(listenerRuleName, {
			listenerArn: opts.listenerArn,
			actions: [
				{
					type: "forward",
					targetGroupArn: targetGroup.arn,
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

		return { listenerRule, targetGroup, hostname };
	};

	private buildService = (
		opts: Options,
		fargateServiceName: string,
		targetGroup: aws.lb.TargetGroup,
		policyArn: pulumi.Output<string>,
		image: awsx.ecr.Image,
	) => {
		const defaultSettings =
			opts.environment === "production"
				? defaultProdSettings()
				: defaultNonProdSettings();

		const settings = {
			...defaultSettings,
			...opts,
		};

		const taskDefinitionName = buildResourceName({
			...opts,
			type: AwsResourceTypes.taskDefinition,
		});

		const serviceContainerName = buildResourceName({
			...opts,
			type: AwsResourceTypes.serviceContainer,
		});

		const service = new awsx.ecs.FargateService(
			fargateServiceName,
			{
				name: fargateServiceName,
				cluster: opts.clusterArn,
				loadBalancers: [
					{
						targetGroupArn: targetGroup.arn,
						containerName: serviceContainerName,
						containerPort: opts.servicePort,
					},
				],
				networkConfiguration: {
					assignPublicIp: opts.assignPublicIp,
					subnets: opts.subnets,
					securityGroups: opts.securityGroups,
				},
				forceNewDeployment: true,
				desiredCount: settings.desiredCount,
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
							image: image.imageUri,
							environment: opts.serviceEnvironmentVariables,
							secrets: opts.serviceSecrets,
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

		return { service };
	};

	private addDnsToRouteToLoadBalancer = (opts: Options, hostname: string) => {
		const dnsARecordName = buildResourceName({
			...opts,
			type: AwsResourceTypes.dnsARecord,
		});

		const dnsARecord = new aws.route53.Record(
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

		return { dnsARecord };
	};
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

type Options = BaseComponentInput & {
	originalFargateServiceOpts?: awsx.ecs.FargateServiceArgs;
	clusterArn: pulumi.Input<string>;
	loadBalancerArn: pulumi.Input<string>;
	vpcId: pulumi.Input<string>;
	desiredCount?: number;
	cpu?: string;
	memory?: string;
	servicePort: number;
	subnets: pulumi.Input<pulumi.Input<string>[]>;
	securityGroups: pulumi.Input<pulumi.Input<string>[]>;
	assignPublicIp: boolean;
	listenerArn: pulumi.Input<string>;
	environmentHostedZoneId: pulumi.Input<string>;
	loadBalancerDnsName: pulumi.Input<string>;
	serviceDockerContext: string;
	serviceDockerfilePath: string;
	serviceDockerfileTarget: string;
	serviceEnvironmentVariables?: EnvVariable[];
	serviceSecrets?: SecretInput[];
};
