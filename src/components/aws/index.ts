import { LocalAdminUserGroup } from "./access/local-admin-user-group";
import { SecurityGroupInboundPublicTlsOutboundAll } from "./access/security-group-inbound-public-outbound-all";
import { User } from "./access/user";
import { EcsCluster } from "./ecs-cluster";
import { ApplicationLoadBalancer } from "./routing/application-load-balancer";
import { Vpc } from "./routing/vpc";

export const aws = {
	Vpc,
	LocalAdminUserGroup,
	User,
	ApplicationLoadBalancer,
	SecurityGroupInboundPublicTlsOutboundAll,
	EcsCluster,
};
