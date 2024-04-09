import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildProjectWideResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { awsResourceType } from "../resource-name-builder";

export class CiCdUserGroup extends pulumi.ComponentResource {
	group: aws.iam.Group;

	constructor(opts: Options) {
		const groupName = buildProjectWideResourceName({
			type: AwsResourceTypes.userGroup,
			name: "ci-cd-user-group",
		});
		super(
			awsResourceType(AwsResourceTypes.userGroup),
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

		const albAttachmentName = `${groupName}-alb-access`;
		new aws.iam.GroupPolicyAttachment(albAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/ElasticLoadBalancingFullAccess",
			group: this.group.name,
		});

		const route53AttachmentName = `${groupName}-route53-access`;
		new aws.iam.GroupPolicyAttachment(route53AttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/AmazonRoute53FullAccess",
			group: this.group.name,
		});

		const acmAttachmentName = `${groupName}-acm-access`;
		new aws.iam.GroupPolicyAttachment(acmAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/AWSCertificateManagerFullAccess",
			group: this.group.name,
		});

		const ecrAttachmentName = `${groupName}-ecr-access`;
		new aws.iam.GroupPolicyAttachment(ecrAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess",
			group: this.group.name,
		});

		const cloudwatchAttachmentName = `${groupName}-cloudwatch-access`;
		new aws.iam.GroupPolicyAttachment(cloudwatchAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
			group: this.group.name,
		});

		const iamAttachmentName = `${groupName}-iam-access`;
		new aws.iam.GroupPolicyAttachment(iamAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/IAMReadOnlyAccess",
			group: this.group.name,
		});

		this.registerOutputs();
	}
}

type Options = {
	pulumiOpts?: pulumi.ComponentResourceOptions;
};
