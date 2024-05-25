import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export interface LambdaFunctionArgs {
    name: string;
    handler: string;
    roleArn: pulumi.Input<string>;
    vpcConfig: aws.types.input.lambda.FunctionVpcConfig;
    apiGateway: aws.apigatewayv2.Api;
}

export class LambdaFunction extends pulumi.ComponentResource {
    public readonly lambda: aws.lambda.Function;
    public readonly integration: aws.apigatewayv2.Integration;

    constructor(name: string, args: LambdaFunctionArgs, opts?: pulumi.ComponentResourceOptions) {
        super("custom:resource:LambdaFunction", name, {}, opts);

        this.lambda = new aws.lambda.Function(`${name}-lambda`, {
            runtime: aws.lambda.,
            code: new pulumi.asset.AssetArchive({
                ".": new pulumi.asset.FileArchive("./app"), // Directory with Lambda code
            }),
            handler: args.handler,
            role: args.roleArn,
            vpcConfig: args.vpcConfig,
        }, { parent: this });

        this.integration = new aws.apigatewayv2.Integration(`${name}-integration`, {
            apiId: args.apiGateway.id,
            integrationType: "AWS_PROXY",
            integrationUri: this.lambda.arn,
            integrationMethod: "POST",
        }, { parent: this });

        new aws.apigatewayv2.Route(`${name}-route`, {
            apiId: args.apiGateway.id,
            routeKey: "ANY /{proxy+}",
            target: pulumi.interpolate`integrations/${this.integration.id}`,
        }, { parent: this });

        new aws.apigatewayv2.Stage(`${name}-stage`, {
            apiId: args.apiGateway.id,
            name: "$default",
            autoDeploy: true,
        }, { parent: this });

        this.registerOutputs({
            lambda: this.lambda,
            integration: this.integration,
        });
    }
}