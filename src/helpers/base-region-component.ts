import * as pulumi from "@pulumi/pulumi";
import { RegionNameOptions, buildComponentName } from ".";

export class BaseRegionComponent extends pulumi.ComponentResource {
	constructor(opts: RegionComponentOptions) {
		const { name } = buildComponentName(opts);
		super(opts.resourceType, name, {}, opts.pulumiOpts);
	}
}

export type RegionComponentOptions = RegionNameOptions & {
	pulumiOpts?: pulumi.ComponentResourceOptions;
};
