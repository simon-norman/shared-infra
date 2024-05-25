import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { MasterNameServerRecord } from "./name-server-record";

export class EnvironmentHostedZone extends pulumi.ComponentResource {
	zone: aws.route53.Zone;

	constructor(opts: Options) {
		const resourceType = AwsResourceTypes.route53Zone;
		const { name: zoneName } = buildComponentName({
			...opts,
			resourceType,
		});
		super(resourceType, zoneName, {}, opts.pulumiOpts);

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

type Options = BaseComponentInput & {
	originalZoneOpts?: aws.route53.ZoneArgs;
	masterZoneId: pulumi.Input<string>;
};
