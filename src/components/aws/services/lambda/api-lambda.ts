import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName, buildHostName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types";
import { LambdaFunction, Options as LambdaFnOptions } from "./lambda";

export class ApiGatewayLambdaFunction extends pulumi.ComponentResource {
	public readonly lambda: LambdaFunction;
	public readonly api: aws.apigatewayv2.Api;
	public readonly integration: aws.apigatewayv2.Integration;
	public readonly route: aws.apigatewayv2.Route;
	public readonly stage: aws.apigatewayv2.Stage;
	public readonly domainName: aws.apigatewayv2.DomainName;
	public readonly apiMapping: aws.apigatewayv2.ApiMapping;
	public readonly dnsRecord: aws.route53.Record;

	constructor(private readonly opts: Options) {
		const { name: lambdaName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.apiGatewayLambda,
		});

		super(AwsResourceTypes.apiGatewayLambda, lambdaName, {}, opts.pulumiOpts);

		const lambda = this.createLambda();
		this.lambda = lambda;

		const api = this.createApi();
		this.api = api;

		const domainName = this.createDomainName();
		this.domainName = domainName;

		const integration = this.createIntegration({
			apiId: api.id,
			lambdaArn: lambda.lambda.arn,
		});
		this.integration = integration;

		const route = this.createRoute({
			apiId: api.id,
			integrationId: integration.id,
		});
		this.route = route;

		const stage = this.createStage({
			apiId: api.id,
		});
		this.stage = stage;

		const apiMapping = this.createApiMapping({
			apiId: api.id,
			domainNameId: domainName.id,
			stageId: stage.id,
		});
		this.apiMapping = apiMapping;

		this.createLambdaPermission({
			lambdaName: lambda.lambda.name,
			executionArn: api.executionArn,
		});

		const dnsRecord = this.createDnsRecord({
			targetDomainName: domainName.domainNameConfiguration.targetDomainName,
			targetHostedZoneId: domainName.domainNameConfiguration.hostedZoneId,
		});
		this.dnsRecord = dnsRecord;

		this.registerOutputs();
	}

	private createLambda = (): LambdaFunction => {
		return new LambdaFunction(this.opts);
	};

	private createApi = (): aws.apigatewayv2.Api => {
		const { name: apiName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGateway,
		});

		return new aws.apigatewayv2.Api(apiName, {
			protocolType: "HTTP",
			name: apiName,
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

	private createIntegration = (
		params: IntegrationParams,
	): aws.apigatewayv2.Integration => {
		const { name: integrationName } = buildComponentName({
			...this.opts,
			resourceType: AwsResourceTypes.apiGatewayIntegration,
		});

		return new aws.apigatewayv2.Integration(integrationName, {
			apiId: params.apiId,
			integrationType: "AWS_PROXY",
			integrationUri: params.lambdaArn,
			integrationMethod: "POST",
			payloadFormatVersion: "2.0",
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

	private createLambdaPermission = (
		params: LambdaPermissionParams,
	): aws.lambda.Permission => {
		const { name: permissionName } = buildComponentName({
			...this.opts,
			name: `${this.opts.name}-apigw-permission`,
			resourceType: AwsResourceTypes.lambdaPermission,
		});

		return new aws.lambda.Permission(permissionName, {
			action: "lambda:InvokeFunction",
			function: params.lambdaName,
			principal: "apigateway.amazonaws.com",
			sourceArn: pulumi.interpolate`${params.executionArn}/*`,
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

type IntegrationParams = {
	apiId: pulumi.Input<string>;
	lambdaArn: pulumi.Input<string>;
};

type RouteParams = {
	apiId: pulumi.Input<string>;
	integrationId: pulumi.Input<string>;
};

type StageParams = {
	apiId: pulumi.Input<string>;
};

type ApiMappingParams = {
	apiId: pulumi.Input<string>;
	domainNameId: pulumi.Input<string>;
	stageId: pulumi.Input<string>;
};

type LambdaPermissionParams = {
	lambdaName: pulumi.Input<string>;
	executionArn: pulumi.Input<string>;
};

type DnsRecordParams = {
	targetDomainName: pulumi.Input<string>;
	targetHostedZoneId: pulumi.Input<string>;
};

export interface Options extends LambdaFnOptions {
	certificateArn: pulumi.Input<string>;
	hostedZoneId: pulumi.Input<string>;
}
