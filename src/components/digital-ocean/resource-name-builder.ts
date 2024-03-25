import {
	buildResourceName,
	buildResourceTypeName,
} from "src/helpers/resource-name-builder";
import { DigitalOceanResourceTypes } from "src/shared-types/digital-ocean-resource-types";

export const digitalOceanResourceType = (type: DigitalOceanResourceTypes) => {
	return buildResourceTypeName("digital-ocean", type);
};

export const buildRepositoryName = (
	region: string,
	imageName: string,
	environment: string,
) => {
	return buildResourceName({
		region,
		type: DigitalOceanResourceTypes.imageRepository,
		name: imageName,
		environment,
	});
};
