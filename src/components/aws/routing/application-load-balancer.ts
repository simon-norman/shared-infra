import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "../resource-name-builder";

export class ApplicationLoadBalancer extends pulumi.ComponentResource {
	loadBalancer: awsx.lb.ApplicationLoadBalancer;
	listener: aws.lb.Listener;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const loadBalancerName = buildResourceName({
			...sharedNameOpts,
			type: ResourceTypes.loadBalancer,
		});

		super(
			awsResourceType(ResourceTypes.loadBalancer),
			loadBalancerName,
			{},
			opts.pulumiOpts,
		);

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
			type: ResourceTypes.lbListener,
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

type Options = {
	originalApplicationLoadBalancerOpts?: awsx.lb.ApplicationLoadBalancerArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	subnetIds: pulumi.Input<pulumi.Input<string>[]>;
	securityGroup: pulumi.Input<string>;
	isInternal: boolean;
	httpsCertificateArn: pulumi.Input<string>;
};
