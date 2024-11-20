import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class Secret extends pulumi.ComponentResource {
	secret: aws.secretsmanager.Secret;

	constructor(opts: Options) {
		const { name } = buildComponentName({
			resourceType: AwsResourceTypes.secret,
			...opts,
		});
		super(AwsResourceTypes.secret, name, {}, opts.pulumiOpts);

		this.secret = new aws.secretsmanager.Secret(name, opts.secretOpts);
	}
}

type Options = BaseComponentInput & {
	secretOpts: aws.secretsmanager.SecretArgs;
};
