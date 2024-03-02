import { LocalAdminUserGroup } from "./access/local-admin-user-group";
import { User } from "./access/user";
import { ApplicationLoadBalancer } from "./application-load-balancer";
import { EcsCluster } from "./ecs-cluster";
import { SecurityGroupInboundPublicTlsOutboundAll } from "./security-group-inbound-public-outbound-all";
import { Vpc } from "./vpc";

export const aws = {
	Vpc,
	LocalAdminUserGroup,
	User,
	ApplicationLoadBalancer,
	SecurityGroupInboundPublicTlsOutboundAll,
	EcsCluster,
};
