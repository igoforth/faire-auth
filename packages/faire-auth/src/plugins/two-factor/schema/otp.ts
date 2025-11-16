import * as z from "zod";

export const sendTwoFactorOTPSchema = z.object({
	/**
	 * if true, the device will be trusted
	 * for 30 days. It'll be refreshed on
	 * every sign in request within this time.
	 */
	trustDevice: z.boolean().optional().openapi({
		description:
			"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
	}),
});

export const verifyTwoFactorOTPSchema = z.object({
	code: z
		.string()
		.openapi({ description: 'The otp code to verify. Eg: "012345"' }),
	/**
	 * if true, the device will be trusted
	 * for 30 days. It'll be refreshed on
	 * every sign in request within this time.
	 */
	trustDevice: z.boolean().optional().openapi({
		description:
			"If true, the device will be trusted for 30 days. It'll be refreshed on every sign in request within this time. Eg: true",
	}),
});
