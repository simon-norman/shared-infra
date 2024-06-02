import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class EcrRepoImage extends pulumi.ComponentResource {
	image: awsx.ecr.Image;
	ecrRepo: awsx.ecr.Repository;

	constructor(opts: Options) {
		const { name: imageRepoName } = buildComponentName({
			...opts,
			resourceType: AwsResourceTypes.imageRepository,
		});

		super(AwsResourceTypes.imageRepository, imageRepoName, {}, opts.pulumiOpts);

		const { image, ecrRepo } = this.uploadDockerImage(opts);
		this.image = image;
		this.ecrRepo = ecrRepo;

		this.registerOutputs();
	}

	private uploadDockerImage = (opts: Options) => {
		const ecrRepoName = buildResourceName({
			...opts,
			type: AwsResourceTypes.imageRepository,
		});

		const imageAgeLimitInDays = 3;
		const ecrRepo = new awsx.ecr.Repository(ecrRepoName, {
			name: ecrRepoName,
			forceDelete: true,
			lifecyclePolicy: {
				rules: [
					{
						description: `Remove untagged images after ${imageAgeLimitInDays}`,
						tagStatus: "untagged",
						maximumAgeLimit: imageAgeLimitInDays,
					},
				],
			},
		});

		const imageName = buildResourceName({
			...opts,
			type: AwsResourceTypes.image,
		});

		const image = new awsx.ecr.Image(imageName, {
			repositoryUrl: ecrRepo.url,
			context: opts.serviceDockerContext,
			dockerfile: opts.serviceDockerfilePath,
			target: opts.serviceDockerfileTarget,
			// @ts-expect-error - parameter is in pulumi docs but missing in types - https://www.pulumi.com/registry/packages/awsx/api-docs/ecr/image/#imagetag_nodejs
			imageTag: `${opts.name}:latest`,
			platform: "linux/amd64",
			args: {
				ENV: opts.environment,
			},
		});

		return { image, ecrRepo };
	};
}

export type Options = BaseComponentInput & {
	serviceDockerContext: string;
	serviceDockerfilePath: string;
	serviceDockerfileTarget: string;
};
