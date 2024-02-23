import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { digitalOceanResourceType } from "./resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
	vpc: digitalocean.Vpc;

	constructor(
		name: string,
		vpcOpts?: digitalocean.VpcArgs,
		opts?: pulumi.ComponentResourceOptions,
	) {
		const region = vpcOpts?.region ?? "lon1";
		const vpcName = buildResourceName(region, "vpc", name);
		super(digitalOceanResourceType("vpc"), vpcName, {}, opts);

		this.vpc = new digitalocean.Vpc(
			vpcName,
			{
				region,
				...vpcOpts,
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}
