import { looseUserSchema } from "@faire-auth/core/db";
import {
	callbackURLSchema,
	emailSchema,
	passwordSchema,
} from "@faire-auth/core/factory";
import * as z from "zod";

export const updateUserSchema = looseUserSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	emailVerified: true,
	email: true,
});

export const changePasswordSchema = z.object({
	/**
	 * The new password to set
	 */
	newPassword: passwordSchema.openapi({
		description: "The new password to set",
	}),
	/**
	 * The current password of the user
	 */
	currentPassword: passwordSchema.openapi({
		description: "The current password",
	}),
	/**
	 * revoke all sessions that are not the
	 * current one logged in by the user
	 */
	revokeOtherSessions: z
		.boolean()
		.optional()
		.openapi({ description: "Revoke all other sessions" }),
});

export const setPasswordSchema = z.object({ newPassword: passwordSchema });

export const deleteUserSchema = z.object({
	/**
	 * The callback URL to redirect to after the user is deleted
	 * this is only used on delete user callback
	 */
	callbackURL: callbackURLSchema(true).openapi({
		description: "The callback URL to redirect to after the user is deleted",
	}),
	/**
	 * The password of the user. If the password isn't provided, session freshness
	 * will be checked.
	 */
	password: passwordSchema.optional().openapi({
		description:
			"The password of the user. If the password isn't provided, session freshness will be checked.",
	}),
	/**
	 * The token to delete the user. If the token is provided, the user will be deleted
	 */
	token: z.string().optional().openapi({
		description:
			"The token to delete the user. If the token is provided, the user will be deleted",
	}),
});

export const deleteUserCallbackQuerySchema = z.object({
	token: z.string().openapi({ param: { in: "query", name: "token" } }),
	callbackURL: callbackURLSchema(true).openapi({
		param: { in: "query", name: "callbackURL" },
	}),
});

export const changeEmailSchema = z.object({
	newEmail: emailSchema.openapi({ description: "The new email to set" }),
	callbackURL: callbackURLSchema(true).openapi({
		description: "The URL to redirect to after email verification",
	}),
});
