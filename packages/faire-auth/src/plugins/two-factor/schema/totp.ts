import * as z from "zod";

export const generateTOTPSchema = z.object({
	secret: z
		.string()
		.openapi({ description: "The secret to generate the TOTP code" }),
});

export const generateTOTPResponseSchema = z.string();

export const getTOTPURISchema = z.object({
	password: z.string().openapi({ description: "User password" }),
});

export const getTOTPURIResponseSchema = z.url();

export const verifyTOTPSchema = z.object({
	code: z
		.string()
		.openapi({ description: 'The otp code to verify. Eg: "012345"' }),
	/**
	 * if true, the device will be trusted
	 * for 30 days. It'll be refreshed on
	 * every sign in request within this time.
	 */
	trustDevice: z
		.boolean()
		.openapi({
			description:
				"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
		})
		.optional(),
});
