import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types";
import { LambdaFunction, Options as LambdaFnOptions } from "./lambda";

export interface LambdaFunctionArgs {
	name: string;
	handler: string;
	roleArn: pulumi.Input<string>;
	vpcConfig: aws.types.input.lambda.FunctionVpcConfig;
	apiGateway: aws.apigatewayv2.Api;
}

export class QueuedLambdaFunction extends pulumi.ComponentResource {
	public readonly lambda: LambdaFunction;
	public readonly eventSourceMapping: aws.lambda.EventSourceMapping;

	constructor(opts: Options) {
		const { name: lambdaName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.queuedLambda,
		});

		super(AwsResourceTypes.queuedLambda, lambdaName, {}, opts.pulumiOpts);

		this.lambda = new LambdaFunction(opts);

		const { name: queueName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.sqs,
		});
		const queue = new aws.sqs.Queue(queueName, {
			visibilityTimeoutSeconds: 300,
		});

		const { name: sourceMapping } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.eventSourceMapping,
		});

		this.eventSourceMapping = new aws.lambda.EventSourceMapping(sourceMapping, {
			eventSourceArn: queue.arn,
			functionName: this.lambda.lambda.name,
			batchSize: 10,
			enabled: true,
		});

		this.registerOutputs();
	}
}

type Options = LambdaFnOptions;
