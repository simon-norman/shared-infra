import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "../resource-name-builder";

export class NameServerRecord extends pulumi.ComponentResource {
	record: aws.route53.Record;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const recordName = buildResourceName({
			...sharedNameOpts,
			environment: sharedNameOpts.environment,
			type: ResourceTypes.dnsRecord,
		});

		super(
			awsResourceType(ResourceTypes.dnsRecord),
			recordName,
			{},
			opts.pulumiOpts,
		);

		const domainName = `${opts.environment}.simonnorman.online`;

		this.record = new aws.route53.Record(
			recordName,
			{
				name: domainName,
				type: "NS",
				ttl: 3600,
				records: opts.nameServers,
				zoneId: opts.hostedZoneId,
				...opts.originalZoneOpts,
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}

type Options = {
	originalZoneOpts?: aws.route53.RecordArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	nameServers: pulumi.Input<string[]>;
	hostedZoneId: pulumi.Input<string>;
};
