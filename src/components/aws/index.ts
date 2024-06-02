import { CiCdUserGroup } from "./access/ci-cd-user-group";
import { CrossAccountAccessRole } from "./access/cross-account-access-role";
import { LocalAdminUserGroup } from "./access/local-admin-user-group";
import { SecurityGroupInboundNoneOutboundAll } from "./access/security-group-inbound-none-outbound-all";
import { SecurityGroupInboundPrivateOutboundAll } from "./access/security-group-inbound-private-outbound-all";
import { SecurityGroupInboundPublicTlsOutboundAll } from "./access/security-group-inbound-public-outbound-all";
import { ServiceUser } from "./access/service-user";
import { User } from "./access/user";
import { RdsPrismaPostgresDb } from "./database/rds-prisma-postgres-db";
import { ApplicationLoadBalancer } from "./routing/application-load-balancer";
import { EnvironmentHostedZone } from "./routing/environment-hosted-zone";
import { HttpsCertificate } from "./routing/https-certificate";
import { MasterHostedZone } from "./routing/master-hosted-zone";
import { MasterNameServerRecord } from "./routing/name-server-record";
import { Vpc } from "./routing/vpc";
import { Vpn } from "./routing/vpn";
import { EcrRepoImage } from "./services/ecr-repo-image";
import { Ec2Cluster } from "./services/ecs-cluster";
import { LambdaFunction } from "./services/lambda";
import { PublicFargateService } from "./services/public-fargate-service";
import { QueuedLambdaFunction } from "./services/queued-lambda";

export const aws = {
	Vpc,
	Vpn,
	CrossAccountAccessRole,
	LocalAdminUserGroup,
	User,
	CiCdUserGroup,
	ApplicationLoadBalancer,
	SecurityGroupInboundPublicTlsOutboundAll,
	SecurityGroupInboundPrivateOutboundAll,
	Ec2Cluster,
	HttpsCertificate,
	PublicFargateService,
	MasterNameServerRecord,
	MasterHostedZone,
	ServiceUser,
	EnvironmentHostedZone,
	RdsPrismaPostgresDb,
	EcrRepoImage,
	LambdaFunction,
	QueuedLambdaFunction,
	SecurityGroupInboundNoneOutboundAll,
};
