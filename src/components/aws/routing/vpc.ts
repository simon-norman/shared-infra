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
				subnetStrategy: "Exact",
				cidrBlock: vpcCidrBlock,
				numberOfAvailabilityZones: 2,
				enableDnsHostnames: opts.allowDnsResolution,
				enableDnsSupport: opts.allowDnsResolution,
				natGateways: {
					strategy: awsx.ec2.NatGatewayStrategy.OnePerAz,
				},
				subnetSpecs: [
					{
						type: "Public",
						cidrBlocks: ["10.0.0.0/20", "10.0.128.0/20"],
						name: "public-A",
					},
					{
						type: "Private",
						cidrBlocks: ["10.0.16.0/20", "10.0.144.0/20"],
						name: "private-A",
					},
					{
						type: "Isolated",
						cidrBlocks: ["10.0.32.0/20", "10.0.160.0/20"],
						name: "isolated-A",
					},
					{
						type: "Unused",
						cidrBlocks: ["10.0.48.0/20", "10.0.176.0/20"],
					},
					{
						type: "Unused",
						cidrBlocks: ["10.0.64.0/20", "10.0.192.0/20"],
					},
					{
						type: "Unused",
						cidrBlocks: ["10.0.80.0/20", "10.0.208.0/20"],
					},
					{
						type: "Unused",
						cidrBlocks: ["10.0.96.0/20", "10.0.224.0/20"],
					},
					{
						type: "Unused",
						cidrBlocks: ["10.0.112.0/20", "10.0.240.0/20"],
					},
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
