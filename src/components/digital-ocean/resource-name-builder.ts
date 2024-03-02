import {
	buildResourceName,
	buildResourceTypeName,
} from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";

export const digitalOceanResourceType = (type: ResourceTypes) => {
	return buildResourceTypeName("digital-ocean", type);
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