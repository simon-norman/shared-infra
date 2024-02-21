import { Input } from "@pulumi/pulumi";

export const buildResourceName = (
	region: Input<string>,
	type: string,
	name: string,
) => {
	return `${region}:${type}:${name}`;
};

export const buildResourceType = (provider: string, name: string) => {
	return `${provider}:${name}`;
};
