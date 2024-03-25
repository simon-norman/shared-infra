import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { DigitalOceanResourceTypes } from "src/shared-types/digital-ocean-resource-types";
import { digitalOceanResourceType } from "./resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
	vpc: digitalocean.Vpc;

	constructor(opts: Options) {
		const vpcName = buildResourceName({
			region: opts.region,
			type: DigitalOceanResourceTypes.vpc,
			name: opts.name,
			environment: opts.environment,
		});
		super(
			digitalOceanResourceType(DigitalOceanResourceTypes.vpc),
			vpcName,
			{},
			opts.pulumiOpts,
		);

		this.vpc = new digitalocean.Vpc(
			vpcName,
			{
				region: opts.region,
				...opts.originalVpcOpts,
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}

type Options = {
	originalVpcOpts?: digitalocean.VpcArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	region: string;
	environment: string;
};
