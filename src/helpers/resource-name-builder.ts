import { Input } from "@pulumi/pulumi";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { CustomResourceTypes } from "src/shared-types/custom-resource-types";
import { DigitalOceanResourceTypes } from "src/shared-types/digital-ocean-resource-types";
import { PostgresqlResourceTypes } from "src/shared-types/postgresql-resource-types";

export type ResourceType =
	| AwsResourceTypes
	| DigitalOceanResourceTypes
	| PostgresqlResourceTypes
	| CustomResourceTypes;

type ResourceNameOpts = {
	region: Input<string>;
	environment: string;
	type: ResourceType;
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
	name: AwsResourceTypes | DigitalOceanResourceTypes,
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
