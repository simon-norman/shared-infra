import { Output, interpolate } from "@pulumi/pulumi";
import { datadogSchemaAndRoleName } from "./rds-prisma-postgres-db";

type Params = {
	dbConnectionString: Output<string>;
};

export const getRdsPostgresDatadogInitScript = ({
	dbConnectionString,
}: Params) =>
	interpolate`
  psql ${dbConnectionString} << EOF
  ALTER ROLE ${datadogSchemaAndRoleName} INHERIT;
  CREATE SCHEMA IF NOT EXISTS ${datadogSchemaAndRoleName};
  GRANT USAGE ON SCHEMA ${datadogSchemaAndRoleName} TO ${datadogSchemaAndRoleName};
  GRANT USAGE ON SCHEMA public TO ${datadogSchemaAndRoleName};
  GRANT pg_monitor TO ${datadogSchemaAndRoleName};
  CREATE EXTENSION IF NOT EXISTS pg_stat_statements schema public;

  CREATE OR REPLACE FUNCTION ${datadogSchemaAndRoleName}.explain_statement(
   l_query TEXT,
   OUT explain JSON
  )
  RETURNS SETOF JSON AS
  $$
  DECLARE
  curs REFCURSOR;
  plan JSON;

  BEGIN
    OPEN curs FOR EXECUTE pg_catalog.concat('EXPLAIN (FORMAT JSON) ', l_query);
    FETCH curs INTO plan;
    CLOSE curs;
    RETURN QUERY SELECT plan;
  END;
  $$
  LANGUAGE 'plpgsql'
  RETURNS NULL ON NULL INPUT
  SECURITY DEFINER;
  EOF
`;
