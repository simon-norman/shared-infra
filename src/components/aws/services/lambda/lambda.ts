import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsRegion, AwsResourceTypes } from "src/shared-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { EnvVariable, SecretInput } from "src/shared-types/environment-vars";

export interface LambdaFunctionArgs {
	name: string;
	handler: string;
	roleArn: pulumi.Input<string>;
	vpcConfig: aws.types.input.lambda.FunctionVpcConfig;
	apiGateway: aws.apigatewayv2.Api;
}

export class LambdaFunction extends pulumi.ComponentResource {
	public readonly lambda: aws.lambda.Function;
	public readonly role: aws.iam.Role;

	constructor(opts: Options) {
		const { name: lambdaName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.lambda,
		});

		super(AwsResourceTypes.lambda, lambdaName, {}, opts.pulumiOpts);

		const { lambdaRole } = this.createLambdaRole(opts);
		this.role = lambdaRole;

		const { lambda } = this.createLambda(opts, lambdaRole, lambdaName);
		this.lambda = lambda;

		this.registerOutputs();
	}

	private createLambdaRole(opts: Options) {
		const { name: lambdaRoleName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.role,
		});
		const lambdaRole = new aws.iam.Role(lambdaRoleName, {
			assumeRolePolicy: {
				Version: "2012-10-17",
				Statement: [
					{
						Action: "sts:AssumeRole",
						Principal: {
							Service: "lambda.amazonaws.com",
						},
						Effect: "Allow",
					},
				],
			},
		});

		const { name: executionPolicyName } = buildComponentName({
			...opts,
			name: `${opts.name}-execution`,
			resourceType: AwsResourceTypes.policyAttachment,
		});
		new aws.iam.RolePolicyAttachment(executionPolicyName, {
			role: lambdaRole.name,
			policyArn: aws.iam.ManagedPolicies.AWSLambdaBasicExecutionRole,
		});

		const { name: vpcAccessPolicyName } = buildComponentName({
			...opts,
			name: `${opts.name}-vpc-access`,
			resourceType: AwsResourceTypes.policyAttachment,
		});
		new aws.iam.RolePolicyAttachment(vpcAccessPolicyName, {
			role: lambdaRole.name,
			policyArn: aws.iam.ManagedPolicies.AWSLambdaVPCAccessExecutionRole,
		});

		this.addSecretsAccessPermissions(opts, lambdaRole);

		return { lambdaRole };
	}

	private addSecretsAccessPermissions(opts: Options, lambdaRole: aws.iam.Role) {
		const serviceSecretArn = aws.secretsmanager
			.getSecret({
				name: `${opts.name}-${opts.environment}/doppler`,
			})
			.then((secret) => secret.arn);

		const secretsLambdaCanRead: Array<string | Promise<string>> = [
			serviceSecretArn,
		];

		const secretsReadPolicyStatement: aws.iam.PolicyStatement[] = [
			{
				Effect: "Allow",
				Action: [
					"secretsmanager:GetSecretValue",
					"secretsmanager:DescribeSecret",
				],
				Resource: secretsLambdaCanRead,
			},
		];

		const { name: readSecretsPolicyName } = buildComponentName({
			...opts,
			name: `${opts.name}-read-secrets`,
			resourceType: AwsResourceTypes.rolePolicy,
		});

		const readSecretsPolicy = new aws.iam.Policy(readSecretsPolicyName, {
			description:
				"Policy to allow Lambda to read secrets from Secrets Manager",
			policy: pulumi.output({
				Version: "2012-10-17",
				Statement: secretsReadPolicyStatement,
			}),
		});

		const { name: readSecretsPolicyAttachName } = buildComponentName({
			...opts,
			name: `${opts.name}-read-secrets`,
			resourceType: AwsResourceTypes.policyAttachment,
		});

		new aws.iam.RolePolicyAttachment(readSecretsPolicyAttachName, {
			role: lambdaRole.name,
			policyArn: readSecretsPolicy.arn,
		});
	}

	private createLambda(
		opts: Options,
		lambdaRole: aws.iam.Role,
		lambdaName: string,
	) {
		const secretsLambdaExtensionArn = pulumi.interpolate`arn:aws:lambda:${
			aws.config.region
		}:${
			lambdaRegionLayerAccountIds[aws.config.region as AwsRegion]
		}:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11`;

		const lambda = new aws.lambda.Function(lambdaName, {
			code: new pulumi.asset.FileArchive(opts.zipFilePath),
			role: lambdaRole.arn,
			timeout: 20,
			memorySize: 256,
			handler: opts.handler,
			runtime: aws.lambda.Runtime.NodeJS20dX,
			environment: {
				variables:
					opts.serviceEnvironmentVariables?.reduce<EnvVariableAsObject>(
						(acc, envVar) => {
							acc[envVar.name] = envVar.value;
							return acc;
						},
						{
							NODE_ENV: opts.environment,
							NODE_OPTIONS: "--enable-source-maps",
							...(opts.datadog && {
								DD_TRACE_ENABLED: "true",
								DD_SERVICE: opts.name,
								DD_VERSION: opts.datadog.version,
								DD_LAMBDA_HANDLER: opts.handler,
							}),
						},
					),
			},
			vpcConfig: {
				subnetIds: opts.subnets,
				securityGroupIds: opts.securityGroups,
			},
			layers: [secretsLambdaExtensionArn],
		});

		return { lambda };
	}
}

export const lambdaRegionLayerAccountIds = {
	[AwsRegion.euWest2]: "133256977650",
};

type DatadogOpts = {
	version: string;
};

export type Options = BaseComponentInput & {
	subnets: pulumi.Input<pulumi.Input<string>[]>;
	securityGroups: pulumi.Input<pulumi.Input<string>[]>;
	serviceEnvironmentVariables?: EnvVariable[];
	serviceSecrets?: SecretInput[];
	handler?: string;
	zipFilePath: string;
	datadog?: DatadogOpts;
};

type EnvVariableAsObject = Record<string, pulumi.Input<string>>;
