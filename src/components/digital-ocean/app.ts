import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { digitalOceanResourceType } from "./resource-name-builder";

export class App extends pulumi.ComponentResource {
	app: digitalocean.App;

	constructor(opts: Options) {
		const appName = buildResourceName({
			region: opts.region,
			type: ResourceTypes.app,
			name: opts.appName,
			environment: opts.environment,
		});

		const finalAppOpts: digitalocean.AppArgs["spec"] = {
			region: opts.region,
			name: appName,
			...opts.originalOptions,
		};
		super(
			digitalOceanResourceType(ResourceTypes.app),
			appName,
			{},
			opts.pulumiOpts,
		);

		this.app = new digitalocean.App(
			appName,
			{ spec: finalAppOpts },
			{ parent: this },
		);

		this.registerOutputs();
	}
}

type Options = {
	originalOptions?: digitalocean.AppArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	region: string;
	appName: string;
	environment: string;
};
