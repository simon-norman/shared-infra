import * as pulumi from "@pulumi/pulumi"
import * as digitalocean from "@pulumi/digitalocean";

export class Vpc extends pulumi.ComponentResource {
    vpc: digitalocean.Vpc

    constructor(name: string, vpcOpts?: digitalocean.VpcArgs, opts?: pulumi.ComponentResourceOptions) {
        super("shared-infra:digital-ocean:Vpn", name, {}, opts);

        this.vpc = new digitalocean.Vpc(name, {
            region: "lon1",
            ...vpcOpts
        }, { parent: this });

        this.registerOutputs();
    }
}
