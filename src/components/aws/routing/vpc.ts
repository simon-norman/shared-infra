import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { awsResourceType } from "../resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
	vpc: awsx.ec2.Vpc;

	constructor(opts: Options) {
		// default is 3 availability zones, purely so that not all the IP addresses from the VPC are used up
		// and there is scope to use more availability zones (start with just 2 to begin with)
		const numberOfAvailabilityZones =
			opts.originalVpcOpts?.numberOfAvailabilityZones ?? 3;

		const vpcName = buildResourceName({
			region: opts.region,
			type: AwsResourceTypes.vpc,
			name: opts.name,
			environment: opts.environment,
		});
		super(awsResourceType(AwsResourceTypes.vpc), vpcName, {}, opts.pulumiOpts);

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
