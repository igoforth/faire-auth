import * as z from "zod";

export const verifyBackupCodeSchema = z.object({
	code: z
		.string()
		.openapi({ description: `A backup code to verify. Eg: "123456"` }),
	/**
	 * Disable setting the session cookie
	 */
	disableSession: z
		.boolean()
		.openapi({ description: "If true, the session cookie will not be set." })
		.optional(),
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

export const generateBackupCodesSchema = z.object({
	password: z.string().openapi({ description: "The users password." }),
});

export const viewBackupCodesSchema = z.object({
	userId: z.coerce.string().openapi({
		description: `The user ID to view all backup codes. Eg: "user-id"`,
	}),
});

export const backupCodesResponseSchema = z
	.array(z.string())
	.openapi({ description: "Array of generated backup codes in plain text" });
