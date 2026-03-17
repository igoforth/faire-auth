import type { Session, User } from "@faire-auth/core/db";
import type { LogLevel } from "@faire-auth/core/env";
import {
	createLogger,
	env,
	isDevelopment,
	isProduction,
	isTest,
} from "@faire-auth/core/env";
import { FaireAuthError } from "@faire-auth/core/error";
import { DEFAULT_SECRET } from "@faire-auth/core/static";
import type { AuthContext as BaseAuthContext } from "@faire-auth/core/types";
import { getKyselyDatabaseType } from "./adapters/kysely-adapter";
import { checkPassword, hashPassword, verifyPassword } from "./crypto";
import { createInternalAdapter, getMigrations } from "./db";
import { getAuthTables } from "./db/get-tables";
import { getAdapter } from "./db/utils";
import type { OAuthProvider } from "./oauth2";
import { socialProviders } from "./social-providers";
import { createTelemetry } from "./telemetry";
import type { ContextVars } from "./types";
import type { FaireAuthOptions } from "./types/options";
import type { FaireAuthPlugin } from "./types/plugin";
import { generateId as rawGenId } from "./utils";
import { createCookieCreator, getCookies } from "./utils/cookies";
import { defu } from "./utils/defu";
import { getBaseURL, getTrustedOrigins } from "./utils/url";

export type AuthContext<Options extends FaireAuthOptions = FaireAuthOptions> =
	BaseAuthContext<ContextVars, Options>;

const getInternalPlugins = <T extends FaireAuthOptions>(options: T) => {
	const plugins: FaireAuthPlugin[] = [];
	if (options.advanced?.crossSubDomainCookies?.enabled === true) {
		// TODO: add internal plugin
	}
	return plugins;
};

const loadSecret = (
	options: FaireAuthOptions,
	logger: Record<LogLevel, (message: string, ...args: any[]) => void>,
) => {
	const secret =
		options.secret ??
		env["FAIRE_AUTH_SECRET"] ??
		env["AUTH_SECRET"] ??
		DEFAULT_SECRET;

	if (secret === DEFAULT_SECRET)
		if (isProduction())
			logger.error(
				"You are using the default secret. Please set `FAIRE_AUTH_SECRET` in your environment variables or pass `secret` in your auth config.",
			);

	return secret;
};

const runPluginInit = (ctx: AuthContext, options: FaireAuthOptions) => {
	let context = ctx;
	const dbHooks: NonNullable<FaireAuthOptions["databaseHooks"]>[] = [];
	for (const plugin of options.plugins ?? []) {
		if (plugin.init) {
			const result = plugin.init(context);
			if (typeof result === "object") {
				if (result.options) {
					const { databaseHooks, ...restOpts } = result.options;
					if (result.options.databaseHooks)
						dbHooks.push(result.options.databaseHooks);
					options = defu(options, restOpts);
				}
				if (result.context)
					context = {
						...context,
						...(result.context as Partial<AuthContext>),
					};
			}
		}
	}
	// Add the global database hooks last
	if (options.databaseHooks) dbHooks.push(options.databaseHooks);
	context.internalAdapter = createInternalAdapter(
		ctx.adapter,
		options,
		context,
		dbHooks,
	);
	return [context, options] as const;
};

const initGenerateId = (
	options: FaireAuthOptions,
): AuthContext["generateId"] => {
	const advDbGenId = options.advanced?.database?.generateId;

	return ({ model, size }) => {
		if (typeof advDbGenId === "function")
			return advDbGenId({
				model,
				...(size != null ? { size } : {}),
			});

		return rawGenId(size);
	};
};

export const init = <O extends FaireAuthOptions>(options: O) => {
	const baseURL = getBaseURL(options.baseURL, options.basePath);
	if (baseURL == null && !isDevelopment() && !isTest())
		throw new Error("baseURL is required for auth context");

	const adapter = getAdapter(options);
	const internalPlugins = getInternalPlugins(options);
	const logger = createLogger(options.logger);
	const secret = loadSecret(options, logger);
	const generateId = initGenerateId(options);
	const secondaryStorage = options.secondaryStorage;
	const sessionConfig = {
		updateAge: options.session?.updateAge ?? 24 * 60 * 60, // 24 hours
		expiresIn: options.session?.expiresIn ?? 60 * 60 * 24 * 7, // 7 days
		freshAge: options.session?.freshAge ?? 60 * 60 * 24, // 24 hours
		cookieRefreshCache: (() => {
			const refreshCache = options.session?.cookieCache?.refreshCache;
			const maxAge = options.session?.cookieCache?.maxAge ?? 60 * 5;
			if (refreshCache === false || refreshCache === undefined)
				return false as false;

			if (refreshCache === true)
				// Default: refresh when 80% of maxAge is reached (20% remaining)
				return {
					enabled: true as true,
					updateAge: Math.floor(maxAge * 0.2),
				};

			return {
				enabled: true as true,
				updateAge:
					refreshCache.updateAge !== undefined
						? refreshCache.updateAge
						: Math.floor(maxAge * 0.2), // Default to 20% of maxAge
			};
		})(),
	};
	const rateLimit = {
		...options.rateLimit,
		enabled: options.rateLimit?.enabled ?? isProduction(),
		window: options.rateLimit?.window ?? 10,
		max: options.rateLimit?.max ?? 100,
		storage:
			options.rateLimit?.storage ??
			(options.secondaryStorage ? "secondary-storage" : "memory"),
	};

	options.secret = secret;
	options.baseURL = baseURL ? new URL(baseURL).origin : "";
	options.basePath ??= "/api/auth";
	options.plugins ??= [];
	options.plugins.push(...internalPlugins);

	const context = {
		appName: options.appName ?? "Faire Auth",
		socialProviders: Object.entries(options.socialProviders ?? {})
			.map(([key, value]) => {
				if (value == null) return null;
				if (value.enabled === false) return null;
				if (!value.clientId)
					logger.warn(
						`Social provider ${key} is missing clientId or clientSecret`,
					);
				if (!(key in socialProviders))
					throw new Error(`${key} does not exist in known social providers`);
				const provider = socialProviders[key as keyof typeof socialProviders](
					value as any,
				);
				if (value.disableImplicitSignUp)
					(provider as OAuthProvider).disableImplicitSignUp =
						value.disableImplicitSignUp;
				return provider as OAuthProvider | typeof provider;
			})
			.filter((x) => x !== null),
		tables: getAuthTables(options),
		trustedOrigins: getTrustedOrigins(options, { baseURL: baseURL! })
			.trustedOrigins,
		baseURL: baseURL!,
		sessionConfig,
		secret,
		authCookies: getCookies(options),
		logger,
		rateLimit,
		generateId,
		password: {
			hash: options.emailAndPassword?.password?.hash ?? hashPassword,
			verify: options.emailAndPassword?.password?.verify ?? verifyPassword,
			config: {
				minPasswordLength: options.emailAndPassword?.minPasswordLength ?? 8,
				maxPasswordLength: options.emailAndPassword?.maxPasswordLength ?? 128,
			},
			checkPassword,
		},
		newSession: null as { session: Session; user: User } | null,
		adapter,
		internalAdapter: createInternalAdapter(
			adapter,
			options,
			{
				logger,
				generateId,
				sessionConfig,
				...(secondaryStorage && {
					secondaryStorage,
				}),
			},
			options.databaseHooks ? [options.databaseHooks] : [],
		),
		createAuthCookie: createCookieCreator(options),
		runMigrations: async () => {
			// only run migrations if database is provided and it's not an adapter
			if (!options.database || "updateMany" in options.database)
				throw new FaireAuthError(
					"Database is not provided or it's an adapter. Migrations are only supported with a database instance.",
				);

			const { runMigrations } = await getMigrations(options);
			await runMigrations();
		},
		publishTelemetry: createTelemetry(options, {
			adapter: adapter.id,
			database:
				typeof options.database === "function"
					? "adapter"
					: getKyselyDatabaseType(options.database) || "unknown",
		}).publish,
		// skipCSRFCheck: !!options.advanced?.disableCSRFCheck,
		// skipOriginCheck:
		// 	options.advanced?.disableOriginCheck !== undefined
		// 		? options.advanced.disableOriginCheck
		// 		: isTest()
		// 			? true
		// 			: false,
		...(secondaryStorage && {
			secondaryStorage,
		}),
	} satisfies AuthContext;

	return runPluginInit(context, options);
};

// export const init = <O extends FaireAuthOptions>(options: O) => {
// 	const baseURL = getBaseURL(options.baseURL, options.basePath);
// 	if (baseURL == null && !isDevelopment() && !isTest())
// 		throw new Error("baseURL is required for auth context");

// 	const adapter = getAdapter(options);
// 	const internalPlugins = getInternalPlugins(options);
// 	const logger = createLogger(options.logger);
// 	const secret = loadSecret(options, logger);
// 	const generateId = initGenerateId(options);
// 	const secondaryStorage = options.secondaryStorage;
// 	const sessionConfig = {
// 		updateAge: options.session?.updateAge ?? 24 * 60 * 60, // 24 hours
// 		expiresIn: options.session?.expiresIn ?? 60 * 60 * 24 * 7, // 7 days
// 		freshAge: options.session?.freshAge ?? 60 * 60 * 24, // 24 hours
// 		cookieRefreshCache: (() => {
// 			const refreshCache = options.session?.cookieCache?.refreshCache;
// 			const maxAge = options.session?.cookieCache?.maxAge ?? 60 * 5;
// 			if (refreshCache === false || refreshCache === undefined)
// 				return false as false;

// 			if (refreshCache === true)
// 				// Default: refresh when 80% of maxAge is reached (20% remaining)
// 				return {
// 					enabled: true as true,
// 					updateAge: Math.floor(maxAge * 0.2),
// 				};

// 			return {
// 				enabled: true as true,
// 				updateAge:
// 					refreshCache.updateAge !== undefined
// 						? refreshCache.updateAge
// 						: Math.floor(maxAge * 0.2), // Default to 20% of maxAge
// 			};
// 		})(),
// 	};
// 	const rateLimit = {
// 		...options.rateLimit,
// 		enabled: options.rateLimit?.enabled ?? isProduction(),
// 		window: options.rateLimit?.window ?? 10,
// 		max: options.rateLimit?.max ?? 100,
// 		storage:
// 			options.rateLimit?.storage ??
// 			(options.secondaryStorage ? "secondary-storage" : "memory"),
// 	};

// 	const opts = {
// 		secret,
// 		baseURL: baseURL ? new URL(baseURL).origin : "",
// 		basePath: options.basePath ?? "/api/auth",
// 		plugins: options.plugins ?? [],
// 		...options,
// 	} as {
// 		[x: string]: unknown;
// 		secret: string;
// 		baseURL: string;
// 		basePath: string;
// 	} & O;
// 	opts.plugins!.concat(...internalPlugins);

// 	const context = {
// 		appName: opts.appName ?? "Faire Auth",
// 		socialProviders: Object.entries(opts.socialProviders ?? {})
// 			.map(([key, value]) => {
// 				if (value == null) return null;
// 				if (value.enabled === false) return null;
// 				if (!value.clientId)
// 					logger.warn(
// 						`Social provider ${key} is missing clientId or clientSecret`,
// 					);
// 				if (!(key in socialProviders))
// 					throw new Error(`${key} does not exist in known social providers`);
// 				const provider =
// 					socialProviders[key as keyof typeof socialProviders](value);
// 				if (value.disableImplicitSignUp)
// 					(provider as OAuthProvider).disableImplicitSignUp =
// 						value.disableImplicitSignUp;
// 				return provider as OAuthProvider | typeof provider;
// 			})
// 			.filter((x) => x !== null),
// 		tables: getAuthTables(opts),
// 		trustedOrigins: getTrustedOrigins(opts, { baseURL: baseURL! })
// 			.trustedOrigins,
// 		baseURL: baseURL!,
// 		sessionConfig,
// 		secret,
// 		authCookies: getCookies(opts),
// 		logger,
// 		rateLimit,
// 		generateId,
// 		password: {
// 			hash: opts.emailAndPassword?.password?.hash ?? hashPassword,
// 			verify: opts.emailAndPassword?.password?.verify ?? verifyPassword,
// 			config: {
// 				minPasswordLength: opts.emailAndPassword?.minPasswordLength ?? 8,
// 				maxPasswordLength: opts.emailAndPassword?.maxPasswordLength ?? 128,
// 			},
// 			checkPassword,
// 		},
// 		newSession: null as { session: Session; user: User } | null,
// 		adapter,
// 		internalAdapter: createInternalAdapter(
// 			adapter,
// 			opts,
// 			{
// 				logger,
// 				generateId,
// 				sessionConfig,
// 				...(secondaryStorage && {
// 					secondaryStorage,
// 				}),
// 			},
// 			opts.databaseHooks ? [opts.databaseHooks] : [],
// 		),
// 		createAuthCookie: createCookieGetter(opts),
// 		runMigrations: async () => {
// 			// only run migrations if database is provided and it's not an adapter
// 			if (!opts.database || "updateMany" in opts.database)
// 				throw new FaireAuthError(
// 					"Database is not provided or it's an adapter. Migrations are only supported with a database instance.",
// 				);

// 			const { runMigrations } = await getMigrations(opts);
// 			await runMigrations();
// 		},
// 		publishTelemetry: createTelemetry(opts, {
// 			adapter: adapter.id,
// 			database:
// 				typeof opts.database === "function"
// 					? "adapter"
// 					: getKyselyDatabaseType(opts.database) || "unknown",
// 		}).publish,
// 		// skipCSRFCheck: !!options.advanced?.disableCSRFCheck,
// 		// skipOriginCheck:
// 		// 	options.advanced?.disableOriginCheck !== undefined
// 		// 		? options.advanced.disableOriginCheck
// 		// 		: isTest()
// 		// 			? true
// 		// 			: false,
// 		...(secondaryStorage && {
// 			secondaryStorage,
// 		}),
// 	} satisfies AuthContext;

// 	return runPluginInit(context, opts);
// };
