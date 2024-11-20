import dedent from "dedent";

type Params = {
	functionName: string;
	region: string;
	datadogApiSecretArn: string;
	serviceName: string;
	environment: string;
	version: string;
	pathToSrc: string;
};

export const lambdaDatadogUpScript = ({
	functionName,
	region,
	datadogApiSecretArn,
	serviceName,
	environment,
	version,
	pathToSrc,
}: Params) =>
	dedent(`
  LAMBDA_FUNCTION_NAME=${functionName}
  LAMBDA_REGION=${region}
  DATADOG_API_SECRET_ARN=${datadogApiSecretArn}

  export DATADOG_SITE="datadoghq.eu"

  export DATADOG_API_KEY_SECRET_ARN=$DATADOG_API_SECRET_ARN

  datadog-ci sourcemaps upload ${pathToSrc} \
    --service=${serviceName} \
    --release-version=${version} \
    --minified-path-prefix=/var/task/

  datadog-ci lambda instrument -f $LAMBDA_FUNCTION_NAME -r $LAMBDA_REGION --service ${serviceName}  --env ${environment} --version ${version} -v 115 -e 65
`);
