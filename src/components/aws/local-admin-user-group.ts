import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildCrossRegionResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "./resource-name-builder";

export class LocalAdminUserGroup extends pulumi.ComponentResource {
	group: aws.iam.Group;

	constructor(opts: Options) {
		const groupName = buildCrossRegionResourceName({
			type: ResourceTypes.userGroup,
			name: "local-admin-user-group",
			environment: opts.environment,
		});
		super(awsResourceType(ResourceTypes.vpc), groupName, {}, opts.pulumiOpts);

		this.group = new aws.iam.Group(groupName, {});

		new aws.iam.GroupPolicyAttachment(`${groupName}-vpc`, {
			policyArn: "arn:aws:iam::aws:policy/AmazonVPCFullAccess",
			group: this.group.name,
		});

		this.registerOutputs();
	}
}

type Options = {
	pulumiOpts?: pulumi.ComponentResourceOptions;
	environment: string;
};
