import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class SecurityGroupInboundPrivateOutboundAll extends pulumi.ComponentResource {
	securityGroup: aws.ec2.SecurityGroup;

	constructor(opts: Options) {
		const { name: securityGroupName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.securityGroup,
		});

		super(
			AwsResourceTypes.securityGroup,
			securityGroupName,
			{},
			opts.pulumiOpts,
		);

		this.securityGroup = new aws.ec2.SecurityGroup(
			securityGroupName,
			{
				name: securityGroupName,
				vpcId: opts.vpcId,
				description:
					"Allow http traffic from another security group and allow all outbound traffic",
			},
			{ parent: this },
		);

		new aws.vpc.SecurityGroupIngressRule(
			`${securityGroupName}-ingress-rule-http-ipv4`,
			{
				securityGroupId: this.securityGroup.id,
				fromPort: 3000,
				ipProtocol: "tcp",
				toPort: 3000,
				referencedSecurityGroupId: opts.sourceSecurityGroupId,
			},
		);

		new aws.vpc.SecurityGroupEgressRule(
			`${securityGroupName}-egressrule-alltraffic-ipv4`,
			{
				securityGroupId: this.securityGroup.id,
				cidrIpv4: "0.0.0.0/0",
				ipProtocol: "-1",
			},
		);

		this.registerOutputs();
	}
}

type Options = BaseComponentInput & {
	originalSecurityGroupRules?: aws.ec2.SecurityGroupArgs;
	vpcId: pulumi.Input<string>;
	sourceSecurityGroupId: pulumi.Input<string>;
};
