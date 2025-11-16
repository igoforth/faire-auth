import {
	callbackURLSchema,
	emailSchema,
	passwordSchema,
} from "@faire-auth/core/factory";
import * as z from "zod";

export const requestPasswordResetSchema = z.object({
	/**
	 * The email address of the user to send the password reset email to.
	 */
	email: emailSchema.openapi({
		description:
			"The email address of the user to send the password reset email to",
	}),
	/**
	 * The URL to redirect the user to reset their password.
	 * If the token isn't valid or expired, it'll be redirected with a query parameter `?
	 * error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?
	 * token=VALID_TOKEN
	 */
	redirectTo: callbackURLSchema(true).openapi({
		description:
			"The URL to redirect the user to reset their password. If the token isn't valid or expired, it'll be redirected with a query parameter `?error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?token=VALID_TOKEN`",
	}),
});

export const requestPasswordResetCallbackParamsSchema = z.object({
	token: z.string().openapi({ param: { in: "path", name: "token" } }),
});

export const requestPasswordResetCallbackQuerySchema = z.object({
	callbackURL: callbackURLSchema().openapi({
		param: { in: "query", name: "callbackURL" },
		description: "The URL to redirect the user to reset their password",
	}),
});

export const resetPasswordSchema = z.object({
	newPassword: passwordSchema.openapi({
		description: "The new password to set",
	}),
	token: z
		.string()
		.optional()
		.openapi({ description: "The token to reset the password" }),
});

export const resetPasswordQuerySchema = z.object({
	token: z
		.string()
		.optional()
		.openapi({ param: { in: "query", name: "token" } }),
});
