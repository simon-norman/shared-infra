import { buildResourceType } from "src/helpers/resource-name-builder";

export const digitalOceanResourceType = (type: string) => {
	return buildResourceType("digital-ocean", type);
};
