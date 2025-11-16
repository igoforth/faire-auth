declare global {
	interface CloudflareEnv extends Env {
		FAIRE_AUTH_SECRET: string;
		GITHUB_CLIENT_ID?: string;
		GITHUB_CLIENT_SECRET?: string;
		GOOGLE_CLIENT_ID?: string;
		GOOGLE_CLIENT_SECRET?: string;
	}
}
type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string
		? EnvType[Binding]
		: string;
};
declare namespace NodeJS {
	interface ProcessEnv
		extends StringifyValues<
			Pick<
				CloudflareEnv,
				| "FAIRE_AUTH_SECRET"
				| "GITHUB_CLIENT_ID"
				| "GITHUB_CLIENT_SECRET"
				| "GOOGLE_CLIENT_ID"
				| "GOOGLE_CLIENT_SECRET"
			>
		> {}
}

export {};
