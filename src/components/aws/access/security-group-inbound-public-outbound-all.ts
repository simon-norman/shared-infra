import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class SecurityGroupInboundPublicTlsOutboundAll extends pulumi.ComponentResource {
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
					"Allow public TLS inbound traffic and all outbound traffic - mainly for publicly exposed load balancers",
			},
			{ parent: this },
		);

		new aws.vpc.SecurityGroupIngressRule(
			`${securityGroupName}-ingressrule-publictls-ipv4`,
			{
				securityGroupId: this.securityGroup.id,
				cidrIpv4: "0.0.0.0/0",
				fromPort: 443,
				ipProtocol: "tcp",
				toPort: 443,
			},
		);

		new aws.vpc.SecurityGroupIngressRule(
			`${securityGroupName}-ingressrule-publictls-ipv6`,
			{
				securityGroupId: this.securityGroup.id,
				cidrIpv6: "::/0",
				fromPort: 443,
				ipProtocol: "tcp",
				toPort: 443,
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

		new aws.vpc.SecurityGroupEgressRule(
			`${securityGroupName}-egressrule-alltraffic-ipv6`,
			{
				securityGroupId: this.securityGroup.id,
				cidrIpv6: "::/0",
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
