import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildCrossEnvironmentResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";

export class MasterHostedZone extends pulumi.ComponentResource {
	zone: aws.route53.Zone;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			region: opts.region,
		};

		const zoneName = buildCrossEnvironmentResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.route53Zone,
		});

		super(AwsResourceTypes.route53Zone, zoneName, {}, opts.pulumiOpts);

		const domainName = "simonnorman.org";

		this.zone = new aws.route53.Zone(
			zoneName,
			{
				name: domainName,
				...opts.originalZoneOpts,
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}

type Options = {
	originalZoneOpts?: aws.route53.ZoneArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	region: string;
};
