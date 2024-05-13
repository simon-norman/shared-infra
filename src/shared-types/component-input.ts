import * as pulumi from "@pulumi/pulumi";
import { SharedNameOptions } from "src/helpers";

export type BaseComponentInput = SharedNameOptions & {
	pulumiOpts?: pulumi.ComponentResourceOptions;
};
