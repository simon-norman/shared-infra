import * as digitalocean from "@pulumi/digitalocean";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { digitalOceanResourceType } from "./resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
	vpc: digitalocean.Vpc;
	vpnServer: digitalocean.Droplet;

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

		const dropletSshKey = new digitalocean.SshKey("vpn-ssh-key", {
			publicKey: "<SSH_PUBLIC_KEY>", // Replace with your ssh public key
		});

		// User data to install and setup OpenVPN on the Droplet
		const userData = `#!/bin/bash
            apt-get update
            apt-get install -y openvpn
            # Additional setup commands for OpenVPN
        `;

		const vpnName = buildResourceName(
			region,
			"vpn-server",
			`vpn-gateway-${name}`,
		);
		this.vpnServer = new digitalocean.Droplet(
			vpnName,
			{
				size: "s-1vcpu-1gb",
				image: "ubuntu-20-04-x64",
				sshKeys: [dropletSshKey.id],
				region,
				userData: userData,
				tags: ["vpn-server", name],
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}
