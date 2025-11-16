import type { FaireAuthPluginDBSchema } from "@faire-auth/core/db";
import * as z from "zod";

export * from "./totp";
export * from "./otp";
export * from "./backup-codes";

// Database schema
export const schema = {
	user: {
		fields: {
			twoFactorEnabled: {
				type: "boolean",
				required: false,
				defaultValue: false,
				input: false,
			},
		},
	},
	twoFactor: {
		fields: {
			secret: { type: "string", required: true, returned: false },
			backupCodes: { type: "string", required: true, returned: false },
			userId: {
				type: "string",
				required: true,
				returned: false,
				references: { model: "user", field: "id" },
			},
		},
	},
} satisfies FaireAuthPluginDBSchema;

export const enableTwoFactorSchema = z.object({
	password: z.string().openapi({ description: "User password" }),
	issuer: z
		.string()
		.openapi({ description: "Custom issuer for the TOTP URI" })
		.optional(),
});

export const disableTwoFactorSchema = z.object({
	password: z.string().openapi({ description: "User password" }),
});

export const totpURISchema = z.object({
	totpURI: z.url().openapi({ description: "TOTP URI" }),
	backupCodes: z.array(z.string()).openapi({ description: "Backup codes" }),
});
