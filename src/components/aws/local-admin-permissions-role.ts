// import * as aws from "@pulumi/aws";
// import * as pulumi from "@pulumi/pulumi";
// import { buildResourceName } from "src/helpers/resource-name-builder";
// import { ResourceTypes } from "src/shared-types/resource-types";
// import { awsResourceType } from "./resource-name-builder";

// export class LocalAdminPermissionsPolicy extends pulumi.ComponentResource {
// 	role: aws.iam.Role

// 	constructor(opts: Options) {
// 		const numberOfAvailabilityZones =
// 			opts.originalVpcOpts?.numberOfAvailabilityZones ?? 1;

// 		const vpcName = buildResourceName({
// 			region: opts.region,
// 			type: ResourceTypes.vpc,
// 			name: opts.name,
// 			environment: opts.environment,
// 		});
// 		super(awsResourceType(ResourceTypes.vpc), vpcName, {}, opts.pulumiOpts);

// 		this.role = new aws.iam.Role()

// 		this.registerOutputs();
// 	}
// }

// type Options = {
// 	originalVpcOpts?: awsx.ec2.VpcArgs;
// 	pulumiOpts?: pulumi.ComponentResourceOptions;
// 	name: string;
// 	environment: string;
// 	region: string;
// };
