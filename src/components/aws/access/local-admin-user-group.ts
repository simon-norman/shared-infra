import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildProjectWideResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";

export class LocalAdminUserGroup extends pulumi.ComponentResource {
	group: aws.iam.Group;

	constructor(opts: Options) {
		const groupName = buildProjectWideResourceName({
			type: AwsResourceTypes.userGroup,
			name: "local-admin",
		});
		super(AwsResourceTypes.userGroup, groupName, {}, opts.pulumiOpts);

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

		const ecrAttachmentName = `${groupName}-ecr-access`;
		new aws.iam.GroupPolicyAttachment(ecrAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess",
			group: this.group.name,
		});

		const secretsManagerReadWrite = `${groupName}-secrets-access`;
		new aws.iam.GroupPolicyAttachment(secretsManagerReadWrite, {
			policyArn: "arn:aws:iam::aws:policy/SecretsManagerReadWrite",
			group: this.group.name,
		});

		const cloudwatchAttachmentName = `${groupName}-cloudwatch-access`;
		new aws.iam.GroupPolicyAttachment(cloudwatchAttachmentName, {
			policyArn: "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
			group: this.group.name,
		});

		const otherPermissionsPolicyName = `${groupName}-vpn-management-policy`;
		const otherPermsPolicy = new aws.iam.Policy(otherPermissionsPolicyName, {
			policy: {
				Version: "2012-10-17",
				Statement: [
					{
						Effect: "Allow",
						Action: [
							"ec2:CreateClientVpnEndpoint",
							"ec2:DeleteClientVpnEndpoint",
							"ec2:DescribeClientVpnEndpoints",
							"ec2:ModifyClientVpnEndpoint",
							"ec2:AuthorizeClientVpnIngress",
							"ec2:RevokeClientVpnIngress",
							"ec2:CreateClientVpnRoute",
							"ec2:DeleteClientVpnRoute",
							"ec2:DescribeClientVpnRoutes",
							"ec2:DescribeClientVpnTargetNetworks",
							"ec2:AssociateClientVpnTargetNetwork",
							"ec2:DisassociateClientVpnTargetNetwork",
							"ec2:CreateClientVpnAuthorizationRule",
							"ec2:DeleteClientVpnAuthorizationRule",
							"ec2:DescribeClientVpnAuthorizationRules",
						],
						Resource: "*",
					},
					{
						Effect: "Allow",
						Action: [
							"acm:DescribeCertificate",
							"acm:ListCertificates",
							"acm:DeleteCertificate",
							"acm:GetCertificate",
							"acm:ListTagsForCertificate",
							"acm:GetAccountConfiguration",
							"acm:RequestCertificate",
						],
						Resource: "*",
					},
					{
						Action: "ec2:*",
						Effect: "Allow",
						Resource: "*",
					},
					{
						Effect: "Allow",
						Action: [
							"lambda:ListLayerVersions",
							"lambda:ListLayers",
							"lambda:CreateFunction",
							"lambda:CreateEventSourceMapping",
							"lambda:ListEventSourceMappings",
							"lambda:DeleteEventSourceMapping",
							"sqs:CreateQueue",
							"sqs:DeleteQueue",
							"sqs:ListQueues",
							"sqs:ListQueueTags",
							"sqs:GetQueueAttributes",
							"sqs:SetQueueAttributes",
							"sqs:SendMessage",
							"sqs:ReceiveMessage",
							"sqs:DeleteMessage",
							"sqs:PurgeQueue",
							"lambda:GetLayerVersion",
						],
						Resource: "*",
					},
				],
			},
		});

		const otherPermsPolicyAttachmentName = `${groupName}-vpn-mgmt-attach`;
		new aws.iam.GroupPolicyAttachment(otherPermsPolicyAttachmentName, {
			policyArn: otherPermsPolicy.arn,
			group: this.group.name,
		});

		this.registerOutputs();
	}
}

type Options = {
	pulumiOpts?: pulumi.ComponentResourceOptions;
};
