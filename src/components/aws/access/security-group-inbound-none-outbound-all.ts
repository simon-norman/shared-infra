import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class SecurityGroupInboundNoneOutboundAll extends pulumi.ComponentResource {
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
				description: "No traffic in, allow all traffic out",
			},
			{ parent: this },
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
};
