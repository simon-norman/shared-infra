import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types";
import { LambdaFunction, Options as LambdaFnOptions } from "./lambda";

export class ScheduledLambda extends pulumi.ComponentResource {
	public readonly lambda: LambdaFunction;
	public readonly schedules: ScheduleResources[];

	constructor(private readonly opts: Options) {
		const { name: lambdaName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.scheduledLambda,
		});

		super(AwsResourceTypes.scheduledLambda, lambdaName, {}, opts.pulumiOpts);

		const lambda = this.createLambda();
		this.lambda = lambda;

		this.schedules = opts.schedules.map((schedule, index) => {
			const eventRule = this.createEventRule(schedule, index, opts);

			const lambdaPermission = this.createLambdaPermission(
				{
					lambdaArn: lambda.lambda.arn,
					lambdaName: lambda.lambda.name,
					ruleArn: eventRule.arn,
					index,
				},
				opts,
			);

			const eventTarget = this.createEventTarget(
				{
					ruleId: eventRule.name,
					lambdaArn: lambda.lambda.arn,
					detail: schedule.detail,
					retryConfig: schedule.retryConfig,
				},
				opts,
			);

			return {
				eventRule,
				lambdaPermission,
				eventTarget,
			};
		});

		this.registerOutputs();

		this.registerOutputs();
	}

	private createLambda = (): LambdaFunction => {
		return new LambdaFunction(this.opts);
	};

	private createEventRule = (
		schedule: Schedule,
		index: number,
		opts: Options,
	): aws.cloudwatch.EventRule => {
		const { name: ruleName } = buildComponentName({
			...this.opts,
			name: `${opts.name}-${index}`,
			resourceType: AwsResourceTypes.eventRule,
		});

		return new aws.cloudwatch.EventRule(ruleName, {
			name: ruleName,
			description: `Schedule ${index} for ${this.opts.name}`,
			scheduleExpression: this.getScheduleExpression(schedule),
		});
	};

	private createLambdaPermission = (
		params: LambdaPermissionParams,
		opts: Options,
	): aws.lambda.Permission => {
		const { name: permissionName } = buildComponentName({
			...opts,
			name: `${opts.name}-eventbridge-${params.index}`,
			resourceType: AwsResourceTypes.lambdaPermission,
		});

		return new aws.lambda.Permission(permissionName, {
			action: "lambda:InvokeFunction",
			function: params.lambdaName,
			principal: "events.amazonaws.com",
			sourceArn: params.ruleArn,
		});
	};

	private createEventTarget = (
		params: EventTargetParams,
		opts: Options,
	): aws.cloudwatch.EventTarget => {
		const { name: targetName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.eventTarget,
		});

		return new aws.cloudwatch.EventTarget(targetName, {
			rule: params.ruleId,
			arn: params.lambdaArn,
			input: params.detail ? JSON.stringify(params.detail) : undefined,
			retryPolicy: {
				maximumEventAgeInSeconds:
					params.retryConfig?.maximumEventAgeInSeconds ?? 3600,
				maximumRetryAttempts: params.retryConfig?.maximumRetryAttempts ?? 2,
			},
		});
	};

	private getScheduleExpression = (schedule: Schedule): string => {
		if (schedule.type === "rate") {
			const { value, unit } = schedule;
			return `rate(${value} ${unit})`;
		}

		if (schedule.type === "cron") {
			return `cron(${schedule.expression})`;
		}

		throw new Error("Invalid schedule type");
	};
}

type RateUnit = "minute" | "minutes" | "hour" | "hours" | "day" | "days";

type RetryConfig = {
	maximumRetryAttempts?: number;
	maximumEventAgeInSeconds?: number;
};

type RateSchedule = {
	type: "rate";
	value: number;
	unit: RateUnit;
	detail?: Record<string, unknown>;
	retryConfig?: RetryConfig;
};

type CronSchedule = {
	type: "cron";
	expression: string;
	detail?: Record<string, unknown>;
	retryConfig?: RetryConfig;
};

type Schedule = RateSchedule | CronSchedule;

type LambdaPermissionParams = {
	lambdaArn: pulumi.Input<string>;
	lambdaName: pulumi.Input<string>;
	ruleArn: pulumi.Input<string>;
	index: number;
};

type EventTargetParams = {
	ruleId: pulumi.Input<string>;
	lambdaArn: pulumi.Input<string>;
	detail?: Record<string, unknown>;
	retryConfig?: RetryConfig;
};

type ScheduleResources = {
	eventRule: aws.cloudwatch.EventRule;
	eventTarget: aws.cloudwatch.EventTarget;
	lambdaPermission: aws.lambda.Permission;
};

export interface Options extends LambdaFnOptions {
	schedules: Schedule[];
}
