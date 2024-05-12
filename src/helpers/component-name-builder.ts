import { ResourceType, buildResourceName } from "src/helpers";

export type SharedNameOptions = {
	region: string;
	name: string;
	environment: string;
};

export type RegionNameOptions = SharedNameOptions & {
	resourceType: ResourceType;
};

export const buildComponentName = (opts: RegionNameOptions) => {
	const sharedNameOpts = {
		region: opts.region,
		name: opts.name,
		environment: opts.environment,
	};

	const name = buildResourceName({
		...sharedNameOpts,
		type: opts.resourceType,
	});

	return { name, sharedNameOpts };
};
