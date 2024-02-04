import * as pulumi from "@pulumi/pulumi"
import * as digitalocean from "@pulumi/digitalocean";

export class Vpc extends pulumi.ComponentResource {
    vpc: digitalocean.Vpc

    constructor(name: string, opts?: pulumi.ComponentResourceOptions) {
        super("shared-infra:digital-ocean:Vpn", name, {}, opts);

        this.vpc = new digitalocean.Vpc(name, {
            region: "lon1",
        }, { parent: this });

        this.registerOutputs();
    }
}
