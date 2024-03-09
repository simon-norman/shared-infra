import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { buildResourceName } from "src/helpers/resource-name-builder";
import { ResourceTypes } from "src/shared-types/resource-types";
import { awsResourceType } from "../resource-name-builder";

export class HttpsCertificate extends pulumi.ComponentResource {
	certificate: aws.acm.Certificate;
	certificateArn: pulumi.Output<string>;

	constructor(opts: Options) {
		const sharedNameOpts = {
			name: opts.name,
			environment: opts.environment,
			region: opts.region,
		};

		const certificateName = buildResourceName({
			...sharedNameOpts,
			type: ResourceTypes.httpsCertificate,
		});

		super(
			awsResourceType(ResourceTypes.httpsCertificate),
			certificateName,
			{},
			opts.pulumiOpts,
		);

		const domainName = `*.${opts.environment}.simonnorman.online`;

		this.certificate = new aws.acm.Certificate(
			certificateName,
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
			type: ResourceTypes.dnsRecord,
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

type Options = {
	originalCertificateOpts?: aws.acm.CertificateArgs;
	pulumiOpts?: pulumi.ComponentResourceOptions;
	name: string;
	environment: string;
	region: string;
	route53ZoneId: string;
};
