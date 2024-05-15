import * as pulumi from "@pulumi/pulumi";

type StackRefNameOpts = {
	region: string;
	environment: string;
	name: string;
	productName: string;
};

export const getStackRef = ({
	environment,
	name,
	region,
	productName,
}: StackRefNameOpts) => {
	return new pulumi.StackReference(
		`simon-norman/${productName}-${region}-${name}/${environment}`,
	);
};
