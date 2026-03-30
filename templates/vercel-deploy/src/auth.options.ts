import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { defineOptions } from "faire-auth";
import { drizzleAdapter } from "faire-auth/adapters/drizzle";
import * as schema from "./schema";

const isCLI = process.env.IS_FAIRE_AUTH_CLI_ACCESS === "true";

let baseURL: string;
if (isCLI) {
	// this is for @faire-auth/cli drizzle schema generation to work
	// but baseURL CANNOT be set to this in production
	baseURL = "https://localhost:3000";
} else {
	if (!process.env.FAIRE_AUTH_URL)
		throw new Error(
			"Failed to get FAIRE_AUTH_URL from process environment. Set FAIRE_AUTH_URL in your Vercel project environment variables.",
		);
	baseURL = process.env.FAIRE_AUTH_URL;
}

// Lazy-init: libsql eagerly validates the URL, so skip during CLI schema generation
const db = isCLI
	? drizzle({ schema, connection: { url: "file:local.db" } })
	: drizzle(
			createClient({
				url: process.env.TURSO_DATABASE_URL!,
				authToken: process.env.TURSO_AUTH_TOKEN!,
			}),
			{ schema },
		);

// This config is used by @faire-auth/cli to generate the database schema
export const options = defineOptions({
	baseURL,
	secret: process.env.FAIRE_AUTH_SECRET!,
	database: drizzleAdapter(db, {
		provider: "sqlite",
		usePlural: false,
	}),
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
