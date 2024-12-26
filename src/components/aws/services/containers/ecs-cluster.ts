import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class Ec2Cluster extends pulumi.ComponentResource {
	cluster: aws.ecs.Cluster;

	constructor(opts: Options) {
		const { name: clusterName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.cluster,
		});

		super(AwsResourceTypes.cluster, clusterName, {}, opts.pulumiOpts);

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

type Options = BaseComponentInput & {
	originalClusterOpts?: aws.ecs.ClusterArgs;
};
