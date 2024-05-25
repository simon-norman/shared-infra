import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { Vpn } from "./vpn";

export class Vpc extends pulumi.ComponentResource {
	vpc: awsx.ec2.Vpc;
	vpn?: Vpn;

	constructor(opts: Options) {
		const resourceType = AwsResourceTypes.vpc;
		const { name } = buildComponentName({
			...opts,
			resourceType,
		});
		super(resourceType, name, {}, opts.pulumiOpts);

		const vpcCidrBlock = "10.0.0.0/16";

		this.vpc = new awsx.ec2.Vpc(
			name,
			{
				...opts.originalVpcOpts,
				subnetStrategy: "Auto",
				cidrBlock: vpcCidrBlock,
				enableDnsHostnames: opts.allowDnsResolution,
				enableDnsSupport: opts.allowDnsResolution,
				numberOfAvailabilityZones: 2,
				natGateways: {
					strategy: awsx.ec2.NatGatewayStrategy.None,
				},
				subnetSpecs: [
					{ type: "Public", cidrMask: 20 },
					// { type: "Private", cidrMask: 20 },
					{ type: "Isolated", cidrMask: 20 },
				],
			},
			{ parent: this },
		);

		if (opts.vpn) {
			this.vpn = new Vpn({
				...opts,
				...opts.vpn,
				vpc: this.vpc,
				pulumiOpts: { dependsOn: [this.vpc] },
			});
		}

		this.registerOutputs();
	}
}

type Options = {
	originalVpcOpts?: awsx.ec2.VpcArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	allowDnsResolution?: boolean;
	vpn?: {
		samlVpnEndpointServerCertificateArn: pulumi.Input<string>;
		sslVpnEndpointServerCertificateArn: pulumi.Input<string>;
		sslVpnEndpointClientCertificateArn: pulumi.Input<string>;
	};
};
