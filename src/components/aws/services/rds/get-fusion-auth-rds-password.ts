import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export const fusionAuthSecretName = "fusion-auth-rds-secret/doppler";

export const getFusionAuthRdsPassword = () => {
	const secret = aws.secretsmanager.getSecretVersion({
		secretId: fusionAuthSecretName,
	});

	const datadogSecretString = secret.then((secret) => secret.secretString);
	const secretObject = pulumi.jsonParse(datadogSecretString) as pulumi.Output<
		Record<string, string>
	>;

	return {
		password: secretObject.password,
	};
};
