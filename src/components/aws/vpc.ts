import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "./resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
	vpc: awsx.ec2.Vpc;

	constructor(opts: Options) {
		const numberOfAvailabilityZones =
			opts.originalVpcOpts?.numberOfAvailabilityZones ?? 1;

		const vpcName = buildResourceName({
			region: opts.region,
			type: ResourceTypes.vpc,
			name: opts.name,
			environment: opts.environment,
		});
		super(awsResourceType(ResourceTypes.vpc), vpcName, {}, opts.pulumiOpts);

		this.vpc = new awsx.ec2.Vpc(
			vpcName,
			{
				...opts.originalVpcOpts,
				numberOfAvailabilityZones,
				subnetStrategy: "Auto",
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}

type Options = {
	originalVpcOpts?: awsx.ec2.VpcArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
};
