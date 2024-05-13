import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { getAccountIdFromArn } from "src/helpers/get-account-id-arn";
import {
	buildHostName,
	buildResourceName,
} from "src/helpers/resource-name-builder";
import { elbHostedZones } from "src/shared-types/aws-elb-hosted-zone";
import { AwsRegion } from "src/shared-types/aws-regions";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

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
			resourceType: AwsResourceTypes.cluster,
		});

		super(
			AwsResourceTypes.fargateService,
			fargateServiceName,
			{},
			opts.pulumiOpts,
		);

		const { image, ecrRepo } = this.uploadDockerImage(opts);
		this.image = image;
		this.ecrRepo = ecrRepo;

		const { targetGroup, listenerRule, hostname } =
			this.configureLoadBalancer(opts);

		this.targetGroup = targetGroup;
		this.listenerRule = listenerRule;

		const awsAccountId = this.targetGroup.arn.apply(getAccountIdFromArn);

		const { policyArn, secretAccessPolicy } = this.createServiceRole(
			opts,
			awsAccountId,
		);
		this.secretAccessPolicy = secretAccessPolicy;

		const { service } = this.buildService(
			opts,
			fargateServiceName,
			targetGroup,
			policyArn,
			image,
		);
		this.service = service;

		const { dnsARecord } = this.addDnsToRouteToLoadBalancer(opts, hostname);
		this.dnsARecord = dnsARecord;

		this.registerOutputs();
	}

	private uploadDockerImage = (opts: Options) => {
		const ecrRepoName = buildResourceName({
			...opts,
			type: AwsResourceTypes.imageRepository,
		});

		const imageAgeLimitInDays = 3;
		const ecrRepo = new awsx.ecr.Repository(ecrRepoName, {
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
			...opts,
			type: AwsResourceTypes.image,
		});

		const image = new awsx.ecr.Image(imageName, {
			repositoryUrl: ecrRepo.url,
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

		return { image, ecrRepo };
	};

	private createServiceRole = (
		opts: Options,
		awsAccountId: pulumi.Output<string>,
	) => {
		const serviceSecretArn = aws.secretsmanager
			.getSecret({
				name: `${opts.name}-${opts.environment}/doppler`,
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

		if (opts.db) {
			policyStatements.push({
				Effect: "Allow",
				Action: "rds-db:connect",
				Resource: pulumi.interpolate`arn:aws:rds-db:${opts.region}:${awsAccountId}:dbuser:${opts.db.awsDbInstanceId}/${opts.db.dbRoleName}`,
			});
		}

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
							image: image.imageUri,
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
