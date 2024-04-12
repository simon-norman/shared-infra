import * as postgres from "@pulumi/postgresql";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { PostgresqlResourceTypes } from "src/shared-types/postgresql-resource-types";

export class PostgresDatabase extends pulumi.ComponentResource {
	db: postgres.Database;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const dbName = buildResourceName({
			...sharedNameOpts,
			type: PostgresqlResourceTypes.database,
		});

		super(PostgresqlResourceTypes.database, dbName, {}, opts.pulumiOpts);

		this.db = new postgres.Database(dbName, {
			...opts.originalPostgresArgs,
			name: dbName,
		});

		this.registerOutputs();
	}
}

type Options = {
	originalPostgresArgs?: postgres.DatabaseArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
};
