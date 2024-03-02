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
			name: "local-admin",
			environment: opts.environment,
		});
		super(
			awsResourceType(ResourceTypes.userGroup),
			groupName,
			{},
			opts.pulumiOpts,
		);

		this.group = new aws.iam.Group(groupName, {});

		const vpcAttachmentName = `${groupName}-vpc-access`;
		new aws.iam.GroupPolicyAttachment(vpcAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/AmazonVPCFullAccess",
			group: this.group.name,
		});

		const iamAttachmentName = `${groupName}-iam-access`;
		new aws.iam.GroupPolicyAttachment(iamAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/IAMFullAccess",
			group: this.group.name,
		});

		const ecsAttachmentName = `${groupName}-ecs-access`;
		new aws.iam.GroupPolicyAttachment(ecsAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/AmazonECS_FullAccess",
			group: this.group.name,
		});

		const rdsAttachmentName = `${groupName}-rds-access`;
		new aws.iam.GroupPolicyAttachment(rdsAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/AmazonRDSFullAccess",
			group: this.group.name,
		});

		this.registerOutputs();
	}
}

type Options = {
	pulumiOpts?: pulumi.ComponentResourceOptions;
	environment: string;
};
