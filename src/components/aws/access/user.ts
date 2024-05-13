import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildProjectWideResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";

export class User extends pulumi.ComponentResource {
	user: aws.iam.User;
	accessKey: { id: pulumi.Output<string>; secret: pulumi.Output<string> };

	constructor(opts: Options) {
		const userName = `${opts.firstName}.${opts.surname}`;
		const userResourceName = buildProjectWideResourceName({
			type: AwsResourceTypes.user,
			name: userName,
		});

		super(AwsResourceTypes.user, userResourceName, {}, opts.pulumiOpts);

		this.user = new aws.iam.User(userResourceName, {
			name: userName,
		});

		const userLoginProfileName = buildProjectWideResourceName({
			type: AwsResourceTypes.userLoginProfile,
			name: userName,
		});

		new aws.iam.UserLoginProfile(userLoginProfileName, {
			user: this.user.name,
			pgpKey: opts.pgpKey,
			passwordResetRequired: true,
		});

		new aws.iam.UserGroupMembership(`${userResourceName}-membership`, {
			user: this.user.name,
			groups: opts.userGroupNames,
		});

		const accessKey = new aws.iam.AccessKey(`${userResourceName}-accesskey`, {
			user: this.user.name,
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
	firstName: string;
	surname: string;
	userGroupNames: pulumi.Input<string>[];
	pgpKey: string;
};
