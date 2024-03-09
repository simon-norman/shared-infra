import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "../resource-name-builder";

export class SecurityGroupInboundPublicTlsOutboundAll extends pulumi.ComponentResource {
	securityGroup: aws.ec2.SecurityGroup;

	constructor(opts: Options) {
		const securityGroupName = buildResourceName({
			region: opts.region,
			type: ResourceTypes.securityGroup,
			name: opts.name,
			environment: opts.environment,
		});
		super(
			awsResourceType(ResourceTypes.securityGroup),
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

type Options = {
	originalSecurityGroupRules?: aws.ec2.SecurityGroupArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	vpcId: pulumi.Input<string>;
};
