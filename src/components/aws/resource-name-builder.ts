import {
	buildResourceName,
	buildResourceTypeName,
} from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";

export const awsResourceType = (type: ResourceTypes) => {
	return buildResourceTypeName("aws", type);
};

export const buildRepositoryName = (
	region: string,
	imageName: string,
	environment: string,
) => {
	return buildResourceName({
		region,
		type: ResourceTypes.imageRepository,
		name: imageName,
		environment,
	});
};
