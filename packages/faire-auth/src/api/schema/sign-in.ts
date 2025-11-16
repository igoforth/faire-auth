import {
	callbackURLSchema,
	emailSchema,
	passwordSchema,
} from "@faire-auth/core/factory";
import * as z from "zod";
import { socialProviderListEnum } from "./account";

export const signInSocialSchema = z.object({
	/**
	 * Callback URL to redirect to after the user
	 * has signed in.
	 */
	callbackURL: callbackURLSchema(true).openapi({
		description: "Callback URL to redirect to after the user has signed in",
	}),
	/**
	 * callback url to redirect if the user is newly registered.
	 *
	 * useful if you have different routes for existing users and new users
	 */
	newUserCallbackURL: callbackURLSchema(true),
	/**
	 * Callback url to redirect to if an error happens
	 *
	 * If it's initiated from the client sdk this defaults to
	 * the current url.
	 */
	errorCallbackURL: callbackURLSchema(true).openapi({
		description: "Callback URL to redirect to if an error happens",
	}),
	/**
	 * OAuth2 provider to use
	 */
	provider: socialProviderListEnum,
	/**
	 * Disable automatic redirection to the provider
	 *
	 * This is useful if you want to handle the redirection
	 * yourself like in a popup or a different tab.
	 */
	disableRedirect: z.boolean().optional().openapi({
		description:
			"Disable automatic redirection to the provider. Useful for handling the redirection yourself",
	}),
	/**
	 * ID token from the provider
	 *
	 * This is used to sign in the user
	 * if the user is already signed in with the
	 * provider in the frontend.
	 *
	 * Only applicable if the provider supports
	 * it. Currently only `apple` and `google` is
	 * supported out of the box.
	 */
	idToken: z
		.optional(
			z.object({
				/**
				 * ID token from the provider
				 */
				token: z
					.string()
					.openapi({ description: "ID token from the provider" }),
				/**
				 * The nonce used to generate the token
				 */
				nonce: z
					.string()
					.optional()
					.openapi({ description: "Nonce used to generate the token" }),
				/**
				 * Access token from the provider
				 */
				accessToken: z
					.string()
					.optional()
					.openapi({ description: "Access token from the provider" }),
				/**
				 * Refresh token from the provider
				 */
				refreshToken: z
					.string()
					.optional()
					.openapi({ description: "Refresh token from the provider" }),
				/**
				 * Expiry date of the token
				 */
				expiresAt: z
					.number()
					.optional()
					.openapi({ description: "Expiry date of the token" }),
			}),
		)
		.openapi({
			description:
				"ID token from the provider to sign in the user with id token",
		}),
	scopes: z.array(z.string().min(1)).optional().openapi({
		description:
			"Array of scopes to request from the provider. This will override the default scopes passed.",
	}),
	/**
	 * Explicitly request sign-up
	 *
	 * Should be used to allow sign up when
	 * disableImplicitSignUp for this provider is
	 * true
	 */
	requestSignUp: z.boolean().optional().openapi({
		description:
			"Explicitly request sign-up. Useful when disableImplicitSignUp is true for this provider",
	}),
	/**
	 * The login hint to use for the authorization code request
	 */
	loginHint: z.string().optional().openapi({
		description: "The login hint to use for the authorization code request",
	}),
});

export const signInEmailSchema = z.object({
	/**
	 * Email of the user
	 */
	email: emailSchema.openapi({ description: "Email of the user" }),
	/**
	 * Password of the user
	 */
	password: passwordSchema.openapi({ description: "Password of the user" }),
	/**
	 * Callback URL to use as a redirect for email
	 * verification and for possible redirects
	 */
	callbackURL: callbackURLSchema(true).openapi({
		description: "Callback URL to use as a redirect for email verification",
	}),
	/**
	 * If this is false, the session will not be remembered
	 * @default true
	 */
	rememberMe: z.boolean().default(true).openapi({
		description:
			"If this is false, the session will not be remembered. Default is `true`.",
	}),
});
