import type { Context, Env } from "hono";
import type { Migration } from "kysely";
import type { z } from "zod";
import type { FaireAuthPluginDBSchema } from "../db";
import type { AuthContext } from "./context";
import type { ExK, LiteralString } from "./helper";
import type { HookHandler } from "./hono";
import type { FaireAuthOptions } from "./options";

type DeepPartial<T> = T extends Function
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;

export interface FaireAuthPlugin<E extends Env = any> {
	id: LiteralString;
	/**
	 * The init function is called when the plugin is initialized.
	 * You can return a new context or modify the existing context.
	 */
	init?:
		| ((ctx: AuthContext<E>) => {
				context?: DeepPartial<ExK<AuthContext<E>, "options">>;
				options?: Partial<FaireAuthOptions>;
		  } | void)
		| undefined;
	/**
	 * Zod schemas to allow users to create DTO of route returns.
	 */
	schemas?: Record<string, z.ZodType>;
	/**
	 * Handler called early for each request.
	 */
	onRequest?: (ctx: Context<E>) => Response | void;
	/**
	 * Handler called late for each response.
	 */
	onResponse?: (ctx: Context<E>) => Response | void;
	hooks?:
		| {
				before?: {
					matcher: (context: Context<E>) => boolean;
					handler: (options: FaireAuthOptions) => HookHandler<E>;
				}[];
				after?: {
					matcher: (context: Context<E>) => boolean;
					handler: (options: FaireAuthOptions) => HookHandler<E>;
				}[];
		  }
		| undefined;
	/**
	 * Schema the plugin needs
	 *
	 * This will also be used to migrate the database. If the fields are dynamic from the plugins
	 * configuration each time the configuration is changed a new migration will be created.
	 *
	 * NOTE: If you want to create migrations manually using
	 * migrations option or any other way you
	 * can disable migration per table basis.
	 *
	 * @example
	 * ```ts
	 * schema: {
	 * 	user: {
	 * 		fields: {
	 * 			email: {
	 * 				 type: "string",
	 * 			},
	 * 			emailVerified: {
	 * 				type: "boolean",
	 * 				defaultValue: false,
	 * 			},
	 * 		},
	 * 	}
	 * } as AuthPluginSchema
	 * ```
	 */
	schema?: FaireAuthPluginDBSchema | undefined;
	/**
	 * The migrations of the plugin. If you define schema that will automatically create
	 * migrations for you.
	 *
	 * ! Only uses this if you dont't want to use the schema option and you disabled migrations for
	 * the tables.
	 */
	migrations?: Record<string, Migration> | undefined;
	/**
	 * The options of the plugin
	 */
	options?: Record<string, any> | undefined;
	/**
	 * types to be inferred
	 */
	$Infer?: Record<string, any> | undefined;
	/**
	 * The rate limit rules to apply to specific paths.
	 */
	rateLimit?:
		| {
				window: number;
				max: number;
				pathMatcher: (path: string) => boolean;
		  }[]
		| undefined;
	/**
	 * The error codes returned by the plugin
	 */
	$ERROR_CODES?: Record<string, string> | undefined;
}
