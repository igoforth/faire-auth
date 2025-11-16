import { drizzle } from "drizzle-orm/libsql";
import { defineOptions } from "faire-auth";
import { drizzleAdapter } from "faire-auth/adapters/drizzle";
import * as schema from "./schema";

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
		drizzle({
			schema,
			connection: {
				url: process.env.TURSO_CONNECTION_URL!,
				authToken: process.env.TUROS_AUTH_TOKEN!,
			},
		}),
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
	advanced: {
		useSecureCookies: true,
		crossSubDomainCookies: {
			enabled: false,
		},
	},
});
