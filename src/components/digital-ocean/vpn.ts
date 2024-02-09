import * as pulumi from "@pulumi/pulumi"
import * as digitalocean from "@pulumi/digitalocean";
import { digitalOceanResourceType } from "./resource-name-builder";
import { buildResourceName } from "src/helpers/resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
    vpc: digitalocean.Vpc

    constructor(name: string, vpcOpts?: digitalocean.VpcArgs, opts?: pulumi.ComponentResourceOptions) {
        const region = vpcOpts?.region ?? "lon1"
        super(digitalOceanResourceType("vpc"), buildResourceName(region, name), {}, opts);

        this.vpc = new digitalocean.Vpc(name, {
            region: "lon1",
            ...vpcOpts
        }, { parent: this });

        this.registerOutputs();
    }
}
