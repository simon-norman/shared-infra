import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildProjectWideResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { awsResourceType } from "../resource-name-builder";

export class CrossAccountAccessRole extends pulumi.ComponentResource {
	role: aws.iam.Role;
	policy: aws.iam.Policy;

	constructor(opts: Options) {
		const roleName = buildProjectWideResourceName({
			type: AwsResourceTypes.role,
			name: opts.name,
		});
		super(
			awsResourceType(AwsResourceTypes.role),
			roleName,
			{},
			opts.pulumiOpts,
		);

		this.role = new aws.iam.Role(roleName, {
			name: roleName,
			assumeRolePolicy: pulumi.all(opts.trustedAccountIds).apply((accountIds) =>
				JSON.stringify({
					Version: "2012-10-17",
					Statement: [
						{
							Effect: "Allow",
							Principal: {
								AWS: accountIds.map((id) => `arn:aws:iam::${id}:root`),
							},
							Action: "sts:AssumeRole",
						},
					],
				}),
			),
		});

		const policyName = buildProjectWideResourceName({
			type: AwsResourceTypes.permissionsPolicy,
			name: opts.name,
		});

		this.policy = new aws.iam.Policy(policyName, {
			name: policyName,
			policy: opts.policy,
		});

		const policyAttachmentName = buildProjectWideResourceName({
			type: AwsResourceTypes.policyAttachment,
			name: opts.name,
		});

		new aws.iam.RolePolicyAttachment(policyAttachmentName, {
			role: this.role,
			policyArn: this.policy.arn,
		});

		this.registerOutputs();
	}
}

type Options = {
	pulumiOpts?: pulumi.ComponentResourceOptions;
	policy: aws.iam.PolicyDocument;
	name: string;
	trustedAccountIds: string[];
};
