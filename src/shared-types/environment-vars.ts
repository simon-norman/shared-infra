import * as pulumi from "@pulumi/pulumi";

export type EnvVariable = {
	name: string;
	value: string;
};

export type SecretInput = {
	name: string;
	valueFrom: string;
};
