import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { SecurityGroupInboundNoneOutboundAll } from "../access/security-group-inbound-none-outbound-all";
import { awsResourceType } from "../resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
	vpc: awsx.ec2.Vpc;
	vpnEndpoint: aws.ec2clientvpn.Endpoint;
	vpnAuthRule: aws.ec2clientvpn.AuthorizationRule;
	endpointSecurityGroup: SecurityGroupInboundNoneOutboundAll;

	constructor(opts: Options) {
		const sharedNameOpts = {
			region: opts.region,
			name: opts.name,
			environment: opts.environment,
		};

		const vpcName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.vpc,
		});
		super(
			awsResourceType(AwsResourceTypes.vpnEndpoint),
			vpcName,
			{},
			opts.pulumiOpts,
		);

		const vpcCidrBlock = "10.0.0.0/16";

		this.vpc = new awsx.ec2.Vpc(
			vpcName,
			{
				...opts.originalVpcOpts,
				subnetStrategy: "Auto",
				cidrBlock: vpcCidrBlock, // Default CIDR block for the whole VPC
				numberOfAvailabilityZones: 1,
				subnetSpecs: [
					{ type: "Public", cidrMask: 20 }, // Public subnet
					{ type: "Private", cidrMask: 20 }, // Private subnet
					{ type: "Isolated", cidrMask: 20 }, // Isolated subnet (no Internet access)
				],
			},
			{ parent: this },
		);

		const vpnEndpoint = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.vpnEndpoint,
		});

		this.endpointSecurityGroup = new SecurityGroupInboundNoneOutboundAll({
			...sharedNameOpts,
			vpcId: this.vpc.vpc.id,
		});

		this.vpnEndpoint = new aws.ec2clientvpn.Endpoint(vpnEndpoint, {
			description: "VPN endpoint for remoting into VPC",
			serverCertificateArn: opts.serverCertificateArn,
			clientCidrBlock: "192.168.0.0/22",
			authenticationOptions: [
				{
					type: "federated-authentication",
					samlProviderArn:
						"arn:aws:iam::211125444328:saml-provider/organisation-sso-provider",
					rootCertificateChainArn: opts.serverCertificateArn, // In a real-world scenario, this might be a different certificate
				},
			],
			connectionLogOptions: {
				enabled: false,
			},
			splitTunnel: true,
			vpcId: this.vpc.vpc.id,
			securityGroupIds: [this.endpointSecurityGroup.securityGroup.id],
		});

		const vpnAuthRuleName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.vpnAuthRule,
		});

		this.vpnAuthRule = new aws.ec2clientvpn.AuthorizationRule(vpnAuthRuleName, {
			clientVpnEndpointId: this.vpnEndpoint.id,
			targetNetworkCidr: vpcCidrBlock,
			accessGroupId: "26d20264-f0a1-7086-9289-9ed267f7dc92",
		});

		const networkAssociationName = buildResourceName({
			...sharedNameOpts,
			type: AwsResourceTypes.networkAssociation,
		});

		this.vpc.privateSubnetIds.apply((subnetIds) =>
			subnetIds.map((subnetId) => {
				new aws.ec2clientvpn.NetworkAssociation(networkAssociationName, {
					clientVpnEndpointId: this.vpnEndpoint.id,
					subnetId,
				});
			}),
		);

		this.registerOutputs();
	}
}

type Options = {
	originalVpcOpts?: awsx.ec2.VpcArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	serverCertificateArn: pulumi.Input<string>;
};
