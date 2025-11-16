import {
	callbackURLSchema,
	emailSchema,
	nameSchema,
	passwordSchema,
} from "@faire-auth/core/factory";
import * as z from "zod";

export const signUpEmailSchema = z.looseObject({
	/**
	 * Name of the user
	 */
	name: nameSchema,
	/**
	 * Email of the user
	 */
	email: emailSchema.openapi({ description: "The email of the user" }),
	/**
	 * Password of the user
	 */
	password: passwordSchema.openapi({
		description: "The password of the user",
	}),
	/**
	 * Image url for the user
	 */
	image: z
		.url()
		.nullish()
		.openapi({ description: "The profile image URL of the user" }),
	/**
	 * Callback URL to use as a redirect for email
	 * verification and for possible redirects
	 */
	callbackURL: callbackURLSchema(true).openapi({
		description: "The URL to use for email verification callback",
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
