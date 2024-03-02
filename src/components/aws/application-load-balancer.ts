import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "./resource-name-builder";

export class ApplicationLoadBalancer extends pulumi.ComponentResource {
	loadBalancer: awsx.lb.ApplicationLoadBalancer;

	constructor(opts: Options) {
		const loadBalancerName = buildResourceName({
			region: opts.region,
			type: ResourceTypes.loadBalancer,
			name: opts.name,
			environment: opts.environment,
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
};
