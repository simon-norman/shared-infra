import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { awsResourceType } from "../resource-name-builder";

export class SecurityGroupInboundNoneOutboundAll extends pulumi.ComponentResource {
	securityGroup: aws.ec2.SecurityGroup;

	constructor(opts: Options) {
		const securityGroupName = buildResourceName({
			region: opts.region,
			type: AwsResourceTypes.securityGroup,
			name: opts.name,
			environment: opts.environment,
		});
		super(
			awsResourceType(AwsResourceTypes.securityGroup),
			securityGroupName,
			{},
			opts.pulumiOpts,
		);

		this.securityGroup = new aws.ec2.SecurityGroup(
			securityGroupName,
			{
				name: securityGroupName,
				vpcId: opts.vpcId,
				description: "Allow http traffic from another security group",
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

		new aws.vpc.SecurityGroupIngressRule(
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

type Options = {
	originalSecurityGroupRules?: aws.ec2.SecurityGroupArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	vpcId: pulumi.Input<string>;
};
