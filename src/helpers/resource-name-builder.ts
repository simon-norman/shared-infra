import { Input } from "@pulumi/pulumi";
import { ResourceTypes } from "src/shared-types/resource-types";

type ResourceNameOpts = {
	region: Input<string>;
	environment: string;
	type: ResourceTypes;
	name: string;
};

export const buildProjectWideResourceName = ({
	type,
	name,
}: Omit<ResourceNameOpts, "region" | "environment">) => {
	return `${type}-${name}`;
};

export const buildCrossEnvironmentResourceName = ({
	type,
	name,
	region,
}: Omit<ResourceNameOpts, "environment">) => {
	return `${region}-${type}-${name}`;
};

export const buildCrossRegionResourceName = ({
	environment,
	type,
	name,
}: Omit<ResourceNameOpts, "region">) => {
	return `${environment}-${type}-${name}`;
};

export const buildResourceName = ({
	region,
	environment,
	type,
	name,
}: ResourceNameOpts) => {
	return `${environment}-${region}-${type}-${name}`;
};

export const buildResourceTypeName = (
	provider: string,
	name: ResourceTypes,
) => {
	return `${provider}-${name}`;
};

type HostnameOptions = {
	environment: string;
	name: string;
};

export const buildHostName = ({ environment, name }: HostnameOptions) => {
	return `${name}.${environment}.simonnorman.online`;
};
