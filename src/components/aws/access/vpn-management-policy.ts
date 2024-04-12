export const vpnManagementPolicy = {
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
	],
};
