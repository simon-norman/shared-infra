import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export const datadogDbPasswordSecretName = "datadog-rds-secret/doppler";

export const getDatadogRdsPassword = () => {
	const datadogSecret = aws.secretsmanager.getSecretVersion({
		secretId: datadogDbPasswordSecretName,
	});

	const datadogSecretString = datadogSecret.then(
		(secret) => secret.secretString,
	);
	const secretObject = pulumi.jsonParse(datadogSecretString) as pulumi.Output<
		Record<string, string>
	>;

	return {
		password: secretObject.password,
	};
};
