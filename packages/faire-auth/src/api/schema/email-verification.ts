import { callbackURLSchema, emailSchema } from "@faire-auth/core/factory";
import * as z from "zod";

export const sendVerificationEmailSchema = z.object({
	email: emailSchema.openapi({
		description: "The email to send the verification email to",
	}),
	callbackURL: callbackURLSchema(true).openapi({
		description: "The URL to use for email verification callback",
	}),
});

export const verifyEmailQuerySchema = z.object({
	token: z.string().openapi({ description: "The token to verify the email" }),
	callbackURL: callbackURLSchema(true).openapi({
		description: "The URL to redirect to after email verification",
	}),
});

export const verifyEmailTokenSchema = z.object({
	email: emailSchema,
	updateTo: z.string().optional(),
});
