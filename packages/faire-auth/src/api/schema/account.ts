import { callbackURLSchema } from "@faire-auth/core/factory";
import * as z from "zod";
import {
	socialProviderList,
	type SocialProvider,
} from "../../social-providers";

export const socialProviderListEnum = z
	.enum(socialProviderList)
	// .or(z.string()) as z.ZodType<({} & string) | SocialProviderList[number]>
	.or(z.string()) as z.ZodType<SocialProvider, SocialProvider>;

export const linkAccountSchema = z.object({
	/**
	 * Callback URL to redirect to after the user has signed in.
	 */
	callbackURL: callbackURLSchema(true).openapi({
		description: "The URL to redirect to after the user has signed in",
	}),
	/**
	 * OAuth2 provider to use
	 */
	provider: socialProviderListEnum,
	/**
	 * ID Token for direct authentication without redirect
	 */
	idToken: z
		.object({
			token: z.string(),
			nonce: z.string().optional(),
			accessToken: z.string().optional(),
			refreshToken: z.string().optional(),
			scopes: z.array(z.string().min(1)).optional(),
		})
		.optional(),
	/**
	 * Additional scopes to request when linking the account.
	 * This is useful for requesting additional permissions when
	 * linking a social account compared to the initial authentication.
	 */
	scopes: z.array(z.string().min(1)).optional().openapi({
		description: "Additional scopes to request when linking the account",
	}),
	/**
	 * The URL to redirect to if there is an error during the link process.
	 */
	errorCallbackURL: callbackURLSchema(true).openapi({
		description:
			"The URL to redirect to if there is an error during the link process",
	}),
});

export const unlinkAccountSchema = z.object({
	providerId: z.string(),
	accountId: z.string().optional(),
});

export const getAccessTokenSchema = z.object({
	providerId: z
		.string()
		.openapi({ description: "The provider ID for the OAuth provider" }),
	accountId: z.string().optional().openapi({
		description: "The account ID associated with the refresh token",
	}),
	userId: z
		.string()
		.optional()
		.openapi({ description: "The user ID associated with the account" }),
});

export const refreshAccessTokenSchema = z.object({
	providerId: z
		.string()
		.openapi({ description: "The provider ID for the OAuth provider" }),
	accountId: z.string().optional().openapi({
		description: "The account ID associated with the refresh token",
	}),
	userId: z
		.string()
		.optional()
		.openapi({ description: "The user ID associated with the account" }),
});

export const getAccountInfoSchema = z.object({
	accountId: z.string().openapi({
		description:
			"The provider given account id for which to get the account info",
	}),
});
