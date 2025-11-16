import { defineOptions, faireAuth } from "faire-auth";
import { expo } from "@faire-auth/expo";
import { Pool } from "pg";

export const options = defineOptions({
	database: new Pool({
		connectionString: process.env.DATABASE_URL,
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [expo()],
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
		},
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		},
	},
	trustedOrigins: ["exp://"],
});

export const auth = faireAuth(options);
export const App = auth.$Infer.App(options);
export const Api = auth.$Infer.Api(App);
export const handler = auth.handler;
export type App = typeof App;
