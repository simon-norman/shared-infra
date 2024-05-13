import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class ApplicationLoadBalancer extends pulumi.ComponentResource {
	loadBalancer: awsx.lb.ApplicationLoadBalancer;
	listener: aws.lb.Listener;

	constructor(opts: Options) {
		const { name: loadBalancerName, sharedNameOpts } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.loadBalancer,
		});

		super(AwsResourceTypes.loadBalancer, loadBalancerName, {}, opts.pulumiOpts);

		this.loadBalancer = new awsx.lb.ApplicationLoadBalancer(
			loadBalancerName,
			{
				name: loadBalancerName,
				subnetIds: opts.subnetIds,
				securityGroups: [opts.securityGroup],
				internal: opts.isInternal,
				ipAddressType: "ipv4",
				...opts.originalApplicationLoadBalancerOpts,
			},
			{ parent: this },
		);

		const listenerName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.lbListener,
		});

		this.listener = new aws.lb.Listener(listenerName, {
			loadBalancerArn: this.loadBalancer.loadBalancer.arn,
			protocol: "HTTPS",
			port: 443,
			sslPolicy: "ELBSecurityPolicy-TLS-1-2-Ext-2018-06",
			certificateArn: opts.httpsCertificateArn,
			defaultActions: [
				{
					type: "fixed-response",
					fixedResponse: {
						contentType: "text/plain",
						messageBody: "Sorry, we could not find what you were looking for",
						statusCode: "404",
					},
				},
			],
		});

		this.registerOutputs();
	}
}

type Options = BaseComponentInput & {
	originalApplicationLoadBalancerOpts?: awsx.lb.ApplicationLoadBalancerArgs;
	subnetIds: pulumi.Input<pulumi.Input<string>[]>;
	securityGroup: pulumi.Input<string>;
	isInternal: boolean;
	httpsCertificateArn: pulumi.Input<string>;
};
