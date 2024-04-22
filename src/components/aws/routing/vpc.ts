import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { SecurityGroupInboundNoneOutboundAll } from "../access/security-group-inbound-none-outbound-all";
import { awsResourceType } from "../resource-name-builder";

export class Vpc extends pulumi.ComponentResource {
	vpc: awsx.ec2.Vpc;
	samlVpnEndpoint: aws.ec2clientvpn.Endpoint;
	samlVpnAuthRule: aws.ec2clientvpn.AuthorizationRule;
	endpointSecurityGroup: SecurityGroupInboundNoneOutboundAll;
	certVpnEndpoint: aws.ec2clientvpn.Endpoint;
	certVpnAuthRule: aws.ec2clientvpn.AuthorizationRule;
	ecsForConnectivityCheck: aws.ec2.Instance;

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
				cidrBlock: vpcCidrBlock,
				numberOfAvailabilityZones: 2,
				subnetSpecs: [
					{ type: "Public", cidrMask: 20 }, // Public subnet
					{ type: "Private", cidrMask: 20 }, // Private subnet
					{ type: "Isolated", cidrMask: 20 }, // Isolated subnet (no Internet access)
				],
			},
			{ parent: this },
		);

		const samlEndpointName = buildResourceName({
			...sharedNameOpts,
			name: `${opts.name}-saml`,
			type: AwsResourceTypes.vpnEndpoint,
		});

		this.endpointSecurityGroup = new SecurityGroupInboundNoneOutboundAll({
			...sharedNameOpts,
			vpcId: this.vpc.vpc.id,
		});

		this.samlVpnEndpoint = new aws.ec2clientvpn.Endpoint(samlEndpointName, {
			description: "SAML single sign-on VPN endpoint for remoting into VPC",
			serverCertificateArn: opts.samlVpnEndpointServerCertificateArn,
			clientCidrBlock: "192.168.0.0/22",
			authenticationOptions: [
				{
					type: "federated-authentication",
					samlProviderArn:
						"arn:aws:iam::211125444328:saml-provider/organisation-sso-provider",
				},
			],
			connectionLogOptions: {
				enabled: false,
			},
			splitTunnel: true,
			vpcId: this.vpc.vpc.id,
			securityGroupIds: [this.endpointSecurityGroup.securityGroup.id],
		});

		const samlVpnAuthRuleName = buildResourceName({
			...sharedNameOpts,
			name: `${opts.name}-saml`,
			type: AwsResourceTypes.vpnAuthRule,
		});

		this.samlVpnAuthRule = new aws.ec2clientvpn.AuthorizationRule(
			samlVpnAuthRuleName,
			{
				clientVpnEndpointId: this.samlVpnEndpoint.id,
				targetNetworkCidr: vpcCidrBlock,
				accessGroupId: "26d20264-f0a1-7086-9289-9ed267f7dc92",
			},
		);

		this.vpc.privateSubnetIds.apply((subnetIds) =>
			subnetIds.map((subnetId) => {
				const networkAssociationName = buildResourceName({
					...sharedNameOpts,
					name: `${opts.name}-${subnetId}-saml`,
					type: AwsResourceTypes.networkAssociation,
				});

				return new aws.ec2clientvpn.NetworkAssociation(networkAssociationName, {
					clientVpnEndpointId: this.samlVpnEndpoint.id,
					subnetId,
				});
			}),
		);

		const certEndpointName = buildResourceName({
			...sharedNameOpts,
			name: `${opts.name}-cert`,
			type: AwsResourceTypes.vpnEndpoint,
		});

		this.certVpnEndpoint = new aws.ec2clientvpn.Endpoint(certEndpointName, {
			description: "Two way SSL VPN endpoint for remoting into VPC",
			serverCertificateArn: opts.sslVpnEndpointServerCertificateArn,
			clientCidrBlock: "192.168.0.0/22",
			authenticationOptions: [
				{
					type: "certificate-authentication",
					rootCertificateChainArn: opts.sslVpnEndpointClientCertificateArn,
				},
			],
			connectionLogOptions: {
				enabled: false,
			},
			splitTunnel: true,
			vpcId: this.vpc.vpc.id,
			securityGroupIds: [this.endpointSecurityGroup.securityGroup.id],
		});

		const certVpnAuthRuleName = buildResourceName({
			...sharedNameOpts,
			name: `${opts.name}-cert`,
			type: AwsResourceTypes.vpnAuthRule,
		});

		this.certVpnAuthRule = new aws.ec2clientvpn.AuthorizationRule(
			certVpnAuthRuleName,
			{
				clientVpnEndpointId: this.certVpnEndpoint.id,
				targetNetworkCidr: vpcCidrBlock,
				authorizeAllGroups: true,
			},
		);

		this.vpc.privateSubnetIds.apply((subnetIds) =>
			subnetIds.map((subnetId) => {
				const networkAssociationName = buildResourceName({
					...sharedNameOpts,
					name: `${opts.name}-${subnetId}-cert`,
					type: AwsResourceTypes.networkAssociation,
				});

				return new aws.ec2clientvpn.NetworkAssociation(networkAssociationName, {
					clientVpnEndpointId: this.certVpnEndpoint.id,
					subnetId,
				});
			}),
		);

		const ami = aws.ec2.getAmi({
			owners: ["amazon"],
			mostRecent: true,
			filters: [{ name: "name", values: ["amzn2-ami-hvm-*-x86_64-ebs"] }],
		});

		const ec2SecurityGroupName = buildResourceName({
			...sharedNameOpts,
			name: `${opts.name}-ec2`,
			type: AwsResourceTypes.securityGroup,
		});

		const ec2SecurityGroup = new aws.ec2.SecurityGroup(ec2SecurityGroupName, {
			description: "Allow internal VPC traffic",
			vpcId: this.vpc.vpcId,
			ingress: [
				{
					protocol: "-1",
					fromPort: 0,
					toPort: 0,
					cidrBlocks: [vpcCidrBlock],
				},
			],
		});

		const ec2InstanceName = buildResourceName({
			...sharedNameOpts,
			name: `${opts.name}-vpncheck`,
			type: AwsResourceTypes.ec2,
		});

		this.ecsForConnectivityCheck = new aws.ec2.Instance(ec2InstanceName, {
			instanceType: "t3.nano",
			ami: ami.then((ami) => ami.id),
			subnetId: this.vpc.isolatedSubnetIds[0],
			vpcSecurityGroupIds: [ec2SecurityGroup.id],
		});

		this.registerOutputs();
	}
}

type Options = {
	originalVpcOpts?: awsx.ec2.VpcArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	samlVpnEndpointServerCertificateArn: pulumi.Input<string>;
	sslVpnEndpointServerCertificateArn: pulumi.Input<string>;
	sslVpnEndpointClientCertificateArn: pulumi.Input<string>;
};
