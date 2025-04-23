import * as pulumi from "@pulumi/pulumi";
import * as fusionauth from "pulumi-fusionauth";
import { buildComponentName } from "src/helpers";
import { BaseComponentInput } from "src/shared-types/component-input";
import { FusionAuthResourceTypes } from "./fusion-auth-resources";

export interface UserInput {
	email: string;
	password: string;
	roles?: string[]; // Roles to assign to this user for the application
}

export interface FusionAuthComponentArgs extends BaseComponentInput {
	applicationName: string;
	users: UserInput[];
	apiKey: string; // FusionAuth API key for admin operations
	host: string; // FusionAuth host URL
	roles?: string[]; // Roles to create for the application
	tenantId: string; // Tenant ID for the application
}

export class FusionAuthComponent extends pulumi.ComponentResource {
	public readonly application: fusionauth.FusionAuthApplication;
	public readonly applicationId: pulumi.Output<string>;
	public readonly users: fusionauth.FusionAuthUser[];
	public readonly userRegistrations: fusionauth.FusionAuthRegistration[];
	public readonly roles: fusionauth.FusionAuthApplicationRole[];

	constructor(opts: FusionAuthComponentArgs) {
		const { name: fusionAuthName } = buildComponentName({
			...opts,
			resourceType: FusionAuthResourceTypes.instance,
		});

		super(
			FusionAuthResourceTypes.instance,
			fusionAuthName,
			{},
			opts.pulumiOpts,
		);

		// Set up FusionAuth provider
		const { name: providerName } = buildComponentName({
			...opts,
			name: `${opts.name}-provider`,
			resourceType: FusionAuthResourceTypes.provider,
		});

		const provider = new fusionauth.Provider(providerName, {
			apiKey: opts.apiKey,
			host: opts.host,
		});

		// Create the application
		const { application, applicationId } = this.createApplication(
			opts,
			provider,
		);
		this.application = application;
		this.applicationId = applicationId;

		// Create roles if provided
		const { roles } = this.createRoles(opts, provider);
		this.roles = roles;

		// Create users
		const { users, userRegistrations } = this.createUsers(
			opts,
			provider,
			applicationId,
		);
		this.users = users;
		this.userRegistrations = userRegistrations;

		this.registerOutputs();
	}

	private createApplication(
		opts: FusionAuthComponentArgs,
		provider: fusionauth.Provider,
	) {
		const { name: applicationName } = buildComponentName({
			...opts,
			name: opts.applicationName,
			resourceType: FusionAuthResourceTypes.application,
		});

		// Create a new application
		const application = new fusionauth.FusionAuthApplication(
			applicationName,
			{
				name: opts.applicationName,
				jwtConfiguration: {
					enabled: true,
					ttlSeconds: 3600, // 1 hour
					refreshTokenTtlMinutes: 60 * 24 * 7,
				},
				loginConfiguration: {
					requireAuthentication: false,
					allowTokenRefresh: true,
				},
				tenantId: opts.tenantId,
			},
			{ provider, parent: this },
		);

		const applicationId = application.id;

		return { application, applicationId };
	}

	private createRoles(
		opts: FusionAuthComponentArgs,
		provider: fusionauth.Provider,
	) {
		const roles: fusionauth.FusionAuthApplicationRole[] = [];

		if (opts.roles && opts.roles.length > 0) {
			opts.roles.forEach((roleName, index) => {
				const { name: roleResourceName } = buildComponentName({
					...opts,
					name: `${opts.name}-role-${index}`,
					resourceType: FusionAuthResourceTypes.role,
				});

				const role = new fusionauth.FusionAuthApplicationRole(
					roleResourceName,
					{
						name: roleName,
						applicationId: this.applicationId,
						isDefault: false,
					},
					{ provider, parent: this },
				);

				roles.push(role);
			});
		}

		return { roles };
	}

	private createUsers(
		opts: FusionAuthComponentArgs,
		provider: fusionauth.Provider,
		applicationId: pulumi.Output<string>,
	) {
		const users: fusionauth.FusionAuthUser[] = [];
		const userRegistrations: fusionauth.FusionAuthRegistration[] = [];

		opts.users.forEach((userInput, index) => {
			const { name: userName } = buildComponentName({
				...opts,
				name: `${opts.name}-user-${index}`,
				resourceType: FusionAuthResourceTypes.user,
			});

			// Create user
			const user = new fusionauth.FusionAuthUser(
				userName,
				{
					email: userInput.email,
					password: userInput.password,
				},
				{ provider, parent: this },
			);
			users.push(user);

			// Register user with application
			const { name: userRegName } = buildComponentName({
				...opts,
				name: `${opts.name}-user-registration-${index}`,
				resourceType: FusionAuthResourceTypes.userRegistration,
			});

			const userRegistration = new fusionauth.FusionAuthRegistration(
				userRegName,
				{
					userId: user.id,
					applicationId,
					// Add roles if specified for this user
					roles: userInput.roles || [],
				},
				{ provider, parent: this, dependsOn: [user] },
			);
			userRegistrations.push(userRegistration);
		});

		return { users, userRegistrations };
	}
}
