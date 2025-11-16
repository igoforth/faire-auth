import { drizzle } from "drizzle-orm/d1";
import { defineOptions } from "faire-auth";
import { drizzleAdapter } from "faire-auth/adapters/drizzle";
import { StrictRateLimit } from "faire-auth/db";
import * as schema from "./schema";
import { withD1, withEnv } from "./utils";

let baseURL;
if (process.env.IS_FAIRE_AUTH_CLI_ACCESS === "true") {
	// this is for @faire-auth/cli drizzle schema generation to work
	// but baseURL CANNOT be set to this in production
	baseURL = "https://localhost:3000";
} else {
	if (!process.env.FAIRE_AUTH_URL)
		throw new Error(
			"Failed to get FAIRE_AUTH_URL from process environment. Make sure you have the variable present in vars in your wrangler config file.",
		);
	baseURL = process.env.FAIRE_AUTH_URL;
}

// This config is used by @faire-auth/cli to generate the database schema
export const options = defineOptions({
	baseURL,
	secret: process.env.FAIRE_AUTH_SECRET!,
	database: drizzleAdapter(
		drizzle<typeof schema, D1Database>(withD1(), { schema }),
		{
			provider: "sqlite",
			usePlural: false,
		},
	),
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // 1 day
		cookieCache: {
			enabled: true,
			maxAge: 60 * 5, // 5 minutes
		},
	},
	socialProviders: {
		...(process.env.GITHUB_CLIENT_ID &&
			process.env.GITHUB_CLIENT_SECRET && {
				github: {
					enabled: true,
					clientId: process.env.GITHUB_CLIENT_ID!,
					clientSecret: process.env.GITHUB_CLIENT_SECRET!,
				},
			}),
		...(process.env.GOOGLE_CLIENT_ID &&
			process.env.GOOGLE_CLIENT_SECRET && {
				google: {
					enabled: true,
					clientId: process.env.GOOGLE_CLIENT_ID!,
					clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
				},
			}),
	},
	secondaryStorage: {
		get: async (key) => withEnv((env) => env.FAIRE_AUTH_CACHE.get(key, "text")),
		set: async (key, value, ttl) =>
			withEnv((env) =>
				ttl != null && ttl !== 0
					? env.FAIRE_AUTH_CACHE.put(key, value, {
							expirationTtl: ttl,
						})
					: env.FAIRE_AUTH_CACHE.put(key, value),
			),
		delete: async (key) => withEnv((env) => env.FAIRE_AUTH_CACHE.delete(key)),
	},
	rateLimit: {
		enabled: true,
		window: 10,
		max: 100,
		customStorage: {
			get: async (key) =>
				withEnv((env) =>
					env.RATE_LIMITER.limit({ key }).then(({ success }) =>
						success === true
							? ({
									key,
									count: 0,
									lastRequest: Date.now(),
								} satisfies StrictRateLimit)
							: ({
									key,
									count: 100,
									lastRequest: Date.now(),
								} satisfies StrictRateLimit),
					),
				),
			set: async () => {},
		},
	},
	advanced: {
		// Use KV for session cache
		useSecureCookies: true,
		crossSubDomainCookies: {
			enabled: false,
		},
	},
});
