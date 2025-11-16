import * as z from "zod";

export const callbackSchema = z
	.object({
		code: z.string(),
		error: z.string(),
		device_id: z.string(),
		error_description: z.string(),
		state: z.string(),
		user: z.string(),
	})
	.partial();

export const oauthCallbackParamsSchema = z.object({
	id: z.string().openapi({
		param: { name: "id", in: "path" },
		description: "OAuth provider ID",
	}),
});

export const oauthCallbackQuerySchema = callbackSchema;
