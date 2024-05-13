import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { SharedNameOptions, buildComponentName } from "src/helpers";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";
import { SecurityGroupInboundNoneOutboundAll } from "../access/security-group-inbound-none-outbound-all";

export class Vpn extends pulumi.ComponentResource {
	samlVpnEndpoint: aws.ec2clientvpn.Endpoint;
	samlVpnAuthRule: aws.ec2clientvpn.AuthorizationRule;
	endpointSecurityGroup: SecurityGroupInboundNoneOutboundAll;
	certVpnEndpoint: aws.ec2clientvpn.Endpoint;
	certVpnAuthRule: aws.ec2clientvpn.AuthorizationRule;
	ecsForConnectivityCheck: aws.ec2.Instance;

	constructor(opts: Options) {
		const resourceType = AwsResourceTypes.vpn;
		const { name, sharedNameOpts } = buildComponentName({
			...opts,
			resourceType,
		});
		super(resourceType, name, {}, opts.pulumiOpts);

		this.endpointSecurityGroup = new SecurityGroupInboundNoneOutboundAll({
			...sharedNameOpts,
			vpcId: opts.vpc.vpcId,
		});

		const { vpnAuthRule: samlVpnAuthRule, vpnEndpoint: samlVpnEndpoint } =
			this.addEndpoint(opts, sharedNameOpts, {
				subtype: "saml",
				description: "SAML single sign-on VPN endpoint for remoting into VPC",
				endpointSecurityGroup: this.endpointSecurityGroup,
				authOptions: {
					type: "federated-authentication",
					samlProviderArn:
						"arn:aws:iam::211125444328:saml-provider/organisation-sso-provider",
				},
			});

		this.samlVpnEndpoint = samlVpnEndpoint;
		this.samlVpnAuthRule = samlVpnAuthRule;

		const { vpnAuthRule, vpnEndpoint } = this.addEndpoint(
			opts,
			sharedNameOpts,
			{
				subtype: "cert",
				description: "Two way SSL VPN endpoint for remoting into VPC",
				endpointSecurityGroup: this.endpointSecurityGroup,
				authOptions: {
					type: "certificate-authentication",
					rootCertificateChainArn: opts.sslVpnEndpointClientCertificateArn,
				},
			},
		);

		this.certVpnEndpoint = vpnEndpoint;
		this.certVpnAuthRule = vpnAuthRule;

		const { ecsForConnectivityCheck } = this.addEc2InstanceForConnectionChecks(
			opts,
			sharedNameOpts,
		);

		this.ecsForConnectivityCheck = ecsForConnectivityCheck;

		this.registerOutputs();
	}

	private addEndpoint(
		componentOpts: Options,
		sharedNameOpts: SharedNameOptions,
		endpointOpts: EndpointOptions,
	) {
		const certEndpointName = buildResourceName({
			...sharedNameOpts,
			name: `${componentOpts.name}-${endpointOpts.subtype}`,
			type: AwsResourceTypes.vpnEndpoint,
		});

		const vpnEndpoint = new aws.ec2clientvpn.Endpoint(certEndpointName, {
			description: endpointOpts.description,
			serverCertificateArn: componentOpts.sslVpnEndpointServerCertificateArn,
			clientCidrBlock: "192.168.0.0/22",
			authenticationOptions: [endpointOpts.authOptions],
			connectionLogOptions: {
				enabled: false,
			},
			splitTunnel: true,
			vpcId: componentOpts.vpc.vpc.id,
			securityGroupIds: [endpointOpts.endpointSecurityGroup.securityGroup.id],
		});

		const vpnAuthRuleName = buildResourceName({
			...sharedNameOpts,
			name: `${componentOpts.name}-${endpointOpts.subtype}`,
			type: AwsResourceTypes.vpnAuthRule,
		});

		const vpnAuthRule = new aws.ec2clientvpn.AuthorizationRule(
			vpnAuthRuleName,
			{
				clientVpnEndpointId: vpnEndpoint.id,
				targetNetworkCidr: componentOpts.vpc.vpc.cidrBlock,
				authorizeAllGroups: true,
			},
		);

		componentOpts.vpc.privateSubnetIds.apply((subnetIds) =>
			subnetIds.map((subnetId) => {
				const networkAssociationName = buildResourceName({
					...sharedNameOpts,
					name: `${componentOpts.name}-${subnetId}-${endpointOpts.subtype}`,
					type: AwsResourceTypes.networkAssociation,
				});

				return new aws.ec2clientvpn.NetworkAssociation(networkAssociationName, {
					clientVpnEndpointId: vpnEndpoint.id,
					subnetId,
				});
			}),
		);

		return { vpnEndpoint, vpnAuthRule };
	}

	private addEc2InstanceForConnectionChecks(
		componentOpts: Options,
		sharedNameOpts: SharedNameOptions,
	) {
		const ami = aws.ec2.getAmi({
			owners: ["amazon"],
			mostRecent: true,
			filters: [{ name: "name", values: ["amzn2-ami-hvm-*-x86_64-ebs"] }],
		});

		const ec2SecurityGroupName = buildResourceName({
			...sharedNameOpts,
			name: `${componentOpts.name}-ec2`,
			type: AwsResourceTypes.securityGroup,
		});

		const ec2SecurityGroup = new aws.ec2.SecurityGroup(ec2SecurityGroupName, {
			description: "Allow internal VPC traffic",
			vpcId: componentOpts.vpc.vpcId,
			ingress: [
				{
					protocol: "-1",
					fromPort: 0,
					toPort: 0,
					cidrBlocks: [componentOpts.vpc.vpc.cidrBlock],
				},
			],
		});

		const ec2InstanceName = buildResourceName({
			...sharedNameOpts,
			name: `${componentOpts.name}-vpncheck`,
			type: AwsResourceTypes.ec2,
		});

		const ecsForConnectivityCheck = new aws.ec2.Instance(ec2InstanceName, {
			instanceType: "t3.nano",
			ami: ami.then((ami) => ami.id),
			subnetId: componentOpts.vpc.isolatedSubnetIds[0],
			vpcSecurityGroupIds: [ec2SecurityGroup.id],
		});

		return { ecsForConnectivityCheck };
	}
}

type EndpointOptions = {
	description: string;
	endpointSecurityGroup: SecurityGroupInboundNoneOutboundAll;
	authOptions: aws.types.input.ec2clientvpn.EndpointAuthenticationOption;
	subtype: string;
};

type Options = BaseComponentInput & {
	samlVpnEndpointServerCertificateArn: pulumi.Input<string>;
	sslVpnEndpointServerCertificateArn: pulumi.Input<string>;
	sslVpnEndpointClientCertificateArn: pulumi.Input<string>;
	vpc: awsx.ec2.Vpc;
};
