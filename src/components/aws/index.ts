import { CiCdUserGroup } from "./access/ci-cd-user-group";
import { CrossAccountAccessRole } from "./access/cross-account-access-role";
import { FusionAuthServer } from "./access/fusion-auth-server";
import { LocalAdminUserGroup } from "./access/local-admin-user-group";
import { Secret } from "./access/secret";
import { SecurityGroupInboundNoneOutboundAll } from "./access/security-group-inbound-none-outbound-all";
import { SecurityGroupInboundPrivateOutboundAll } from "./access/security-group-inbound-private-outbound-all";
import { SecurityGroupInboundPublicTlsOutboundAll } from "./access/security-group-inbound-public-outbound-all";
import { ServiceUser } from "./access/service-user";
import { User } from "./access/user";
import { DatadogDatabaseMonitoringAgent } from "./database/datadog-database-monitoring-agent";
import { RdsPrismaPostgresDb } from "./database/rds-prisma-postgres-db";
import { EnvironmentHostedZone } from "./routing/dns/environment-hosted-zone";
import { MasterHostedZone } from "./routing/dns/master-hosted-zone";
import { MasterNameServerRecord } from "./routing/dns/name-server-record";
import { ApplicationLoadBalancer } from "./routing/gateway/application-load-balancer";
import { HttpsCertificate } from "./routing/https-certificate";
import { Vpc } from "./routing/vpc";
import { Vpn } from "./routing/vpn";
import { EcrRepoImage } from "./services/containers/ecr-repo-image";
import { Ec2Cluster } from "./services/containers/ecs-cluster";
import { PublicFargateService } from "./services/containers/public-fargate-service";
import { ApiGatewayLambdaFunction } from "./services/lambda/api-lambda";
import { ScheduledLambda } from "./services/lambda/cron-lambda";
import { LambdaFunction } from "./services/lambda/lambda";
import { QueuedLambdaFunction } from "./services/lambda/queued-lambda";

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
	Secret,
	DatadogDatabaseMonitoringAgent,
	ApiGatewayLambdaFunction,
	ScheduledLambda,
	FusionAuthServer,
};
