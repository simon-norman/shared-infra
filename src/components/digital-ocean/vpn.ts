import * as pulumi from "@pulumi/pulumi"
import * as digitalocean from "@pulumi/digitalocean";

class Vpn extends pulumi.ComponentResource {
    constructor(name: string, opts: pulumi.ComponentResourceOptions) {
        super("shared-infra:digital-ocean:Vpn", name, {}, opts);

        const defaultVpn = new digitalocean.Vpc(name, {
            ipRange: "10.10.10.0/24",
            region: "nyc3",
        }, { parent: this });


    

        this.registerOutputs();
    }
}

