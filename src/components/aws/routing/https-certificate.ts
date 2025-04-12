import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildComponentName } from "src/helpers";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { AwsResourceTypes } from "src/shared-types/aws-resource-types";
import { BaseComponentInput } from "src/shared-types/component-input";

export class HttpsCertificate extends pulumi.ComponentResource {
	certificate: aws.acm.Certificate;
	certificateArn: pulumi.Output<string>;

	constructor(opts: HttpsCertOptions) {
		const resourceType = AwsResourceTypes.httpsCertificate;
		const { name } = buildComponentName({
			...opts,
			resourceType,
		});
		super(resourceType, name, {}, opts.pulumiOpts);

		const domainName = `*.${opts.environment}.simonnorman.org`;

		this.certificate = new aws.acm.Certificate(
			name,
			{
				domainName: domainName,
				validationMethod: "DNS",
				...opts.originalCertificateOpts,
			},
			{ parent: this },
		);

		const dnsRecordName = buildResourceName({
			environment: opts.environment,
			region: opts.region,
			type: AwsResourceTypes.dnsRecord,
			name: "cert-validation",
		});

		const certValidation = new aws.route53.Record(dnsRecordName, {
			name: this.certificate.domainValidationOptions[0].resourceRecordName,
			records: [
				this.certificate.domainValidationOptions[0].resourceRecordValue,
			],
			ttl: 60,
			type: this.certificate.domainValidationOptions[0].resourceRecordType,
			zoneId: opts.route53ZoneId,
		});

		const certCertificateValidation = new aws.acm.CertificateValidation(
			"cert-validation-check",
			{
				certificateArn: this.certificate.arn,
				validationRecordFqdns: [certValidation.fqdn],
			},
		);

		this.certificateArn = certCertificateValidation.certificateArn;

		this.registerOutputs();
	}
}

type HttpsCertOptions = BaseComponentInput & {
	originalCertificateOpts?: aws.acm.CertificateArgs;
	route53ZoneId: pulumi.Input<string>;
};
