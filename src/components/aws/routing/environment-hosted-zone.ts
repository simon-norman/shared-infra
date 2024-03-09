import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "../resource-name-builder";
import { MasterNameServerRecord } from "./name-server-record";

export class EnvironmentHostedZone extends pulumi.ComponentResource {
	zone: aws.route53.Zone;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const zoneName = buildResourceName({
			...sharedNameOpts,
			environment: sharedNameOpts.environment,
			type: ResourceTypes.route53Zone,
		});

		super(
			awsResourceType(ResourceTypes.route53Zone),
			zoneName,
			{},
			opts.pulumiOpts,
		);

		const domainName = `${opts.environment}.simonnorman.online`;

		this.zone = new aws.route53.Zone(
			zoneName,
			{
				name: domainName,
				...opts.originalZoneOpts,
			},
			{ parent: this },
		);

		new MasterNameServerRecord({
			subdomainEnvironment: opts.environment,
			region: opts.region,
			hostedZoneId: opts.masterZoneId,
			name: opts.name,
			nameServers: this.zone.nameServers,
		});

		this.registerOutputs();
	}
}

type Options = {
	originalZoneOpts?: aws.route53.ZoneArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	masterZoneId: pulumi.Input<string>;
};
