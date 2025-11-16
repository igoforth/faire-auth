import * as z from "zod";

export const getSessionQuerySchema = z
	.object({
		/**
		 * If cookie cache is enabled, it will disable the cache
		 * and fetch the session from the database
		 */
		disableCookieCache: z
			.boolean()
			.or(z.string().transform((v) => v === "true"))
			.openapi({
				param: { in: "query", name: "disableCookieCache" },
				description: "Disable cookie cache and fetch session from database",
			}),
		disableRefresh: z
			.boolean()
			.or(z.string().transform((v) => v === "true"))
			.openapi({
				param: { in: "query", name: "disableRefresh" },
				description:
					"Disable session refresh. Useful for checking session status, without updating the session",
			}),
	})
	.partial();

export const revokeSessionSchema = z.object({
	token: z.string().openapi({ description: "The token to revoke" }),
});
