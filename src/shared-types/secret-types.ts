import * as pulumi from "@pulumi/pulumi";

export type ParsedSecretUsernamePassword = pulumi.Output<{
	username: string;
	password: string;
}>;
