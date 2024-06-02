import * as pulumi from "@pulumi/pulumi";

export type EnvVariable = {
	name: string;
	value: pulumi.Input<string>;
};

export type SecretInput = {
	name: pulumi.Input<string>;
	valueFrom: pulumi.Input<string>;
};
