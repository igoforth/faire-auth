declare global {
	interface Env {
		FAIRE_AUTH_SECRET: string;
		TURSO_CONNECTION_URL: string;
		TURSO_AUTH_TOKEN: string;
		GITHUB_CLIENT_ID?: string;
		GITHUB_CLIENT_SECRET?: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
	}
}

declare namespace NodeJS {
	interface ProcessEnv extends Env {}
}

export {};
