let env: CloudflareEnv;

export const withEnv = async <T>(
	callback: (env: CloudflareEnv) => Promise<T>,
) =>
	callback(
		(env ??= await import("cloudflare:workers")
			.then(({ env }) => env as CloudflareEnv)
			.catch((e) => {
				throw new Error(
					"Faire Auth failed to resolve cloudflare:workers, are you in a worker environment?",
					{ cause: e },
				);
			})),
	);

export const withD1 = (): D1Database => ({
	prepare: (...args) => {
		if (!env)
			throw new Error(
				"D1 interface needs to be in a worker env to use D1Database.prepare()",
			);
		return env.FAIRE_AUTH_DB.prepare(...args);
	},
	batch: (...args) => withEnv((env) => env.FAIRE_AUTH_DB.batch(...args)),
	exec: (...args) => withEnv((env) => env.FAIRE_AUTH_DB.exec(...args)),
	withSession: (...args) => {
		if (!env)
			throw new Error(
				"D1 interface needs to be in a worker env to use D1Database.withSession()",
			);
		return env.FAIRE_AUTH_DB.withSession(...args);
	},
	dump: (...args) => withEnv((env) => env.FAIRE_AUTH_DB.dump(...args)),
});
