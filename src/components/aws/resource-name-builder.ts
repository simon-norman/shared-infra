import {
	buildResourceName,
	buildResourceTypeName,
} from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";

export const awsResourceType = (type: AwsResourceTypes) => {
	return buildResourceTypeName("aws", type);
};

export const buildRepositoryName = (
	region: string,
	imageName: string,
	environment: string,
) => {
	return buildResourceName({
		region,
		type: AwsResourceTypes.imageRepository,
		name: imageName,
		environment,
	});
};
