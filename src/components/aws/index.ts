import { LocalAdminUserGroup } from "./access/local-admin-user-group";
import { SecurityGroupInboundPrivateOutboundAll } from "./access/security-group-inbound-private-outbound-all";
import { SecurityGroupInboundPublicTlsOutboundAll } from "./access/security-group-inbound-public-outbound-all";
import { User } from "./access/user";
import { ApplicationLoadBalancer } from "./routing/application-load-balancer";
import { EnvironmentHostedZone } from "./routing/environment-hosted-zone";
import { HttpsCertificate } from "./routing/https-certificate";
import { MasterHostedZone } from "./routing/master-hosted-zone";
import { MasterNameServerRecord } from "./routing/name-server-record";
import { Vpc } from "./routing/vpc";
import { Ec2Cluster } from "./services/ecs-cluster";
import { PublicFargateService } from "./services/public-fargate-service";

export const aws = {
	Vpc,
	LocalAdminUserGroup,
	User,
	ApplicationLoadBalancer,
	SecurityGroupInboundPublicTlsOutboundAll,
	SecurityGroupInboundPrivateOutboundAll,
	Ec2Cluster,
	HttpsCertificate,
	PublicFargateService,
	MasterNameServerRecord,
	MasterHostedZone,
	EnvironmentHostedZone,
};
