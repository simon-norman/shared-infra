import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildCrossRegionResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "./resource-name-builder";

export class User extends pulumi.ComponentResource {
	user: aws.iam.User;
	accessKey: { id: pulumi.Output<string>; secret: pulumi.Output<string> };

	constructor(opts: Options) {
		const userName = `${opts.firstName}.${opts.surname}`;
		const userResourceName = buildCrossRegionResourceName({
			type: ResourceTypes.user,
			name: userName,
			environment: opts.environment,
		});
		super(
			awsResourceType(ResourceTypes.user),
			userResourceName,
			{},
			opts.pulumiOpts,
		);

		this.user = new aws.iam.User(userResourceName, {
			name: userName,
		});

		new aws.iam.UserGroupMembership(`${userResourceName}-membership`, {
			user: userName,
			groups: opts.userGroupNames,
		});

		const accessKey = new aws.iam.AccessKey(`${userResourceName}-accesskey`, {
			user: userName,
			pgpKey: opts.pgpKey,
		});

		this.accessKey = {
			id: pulumi.secret(accessKey.id),
			secret: accessKey.encryptedSecret,
		};

		this.registerOutputs();
	}
}

type Options = {
	pulumiOpts?: pulumi.ComponentResourceOptions;
	environment: string;
	firstName: string;
	surname: string;
	userGroupNames: pulumi.Input<string>[];
	pgpKey: string;
};
