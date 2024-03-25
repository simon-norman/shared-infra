import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { awsResourceType } from "../resource-name-builder";

export class Ec2Cluster extends pulumi.ComponentResource {
	cluster: aws.ecs.Cluster;

	constructor(opts: Options) {
		const clusterName = buildResourceName({
			region: opts.region,
			type: AwsResourceTypes.cluster,
			name: opts.name,
			environment: opts.environment,
		});
		super(
			awsResourceType(AwsResourceTypes.cluster),
			clusterName,
			{},
			opts.pulumiOpts,
		);

		this.cluster = new aws.ecs.Cluster(
			clusterName,
			{
				name: clusterName,
			},
			{ parent: this },
		);

		this.registerOutputs();
	}
}

type Options = {
	originalClusterOpts?: aws.ecs.ClusterArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
};
