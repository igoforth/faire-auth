import type {
	FaireAuthPlugin as BaseFaireAuthPlugin,
	CustomIO,
	DTOTransformer,
	FieldAttribute,
	Prettify,
	RouteConfigToMiddleware,
	RouteHook,
	UnionToIntersection,
} from "@faire-auth/core/types";
import type { HonoRequest, MiddlewareHandler } from "hono";
import type { z } from "zod";
import type { AuthEndpoint } from "../api/factory/endpoint";
import type { FaireAuthPluginDBSchema } from "../db";
import type { ContextVars } from "./hono";
import type { FaireAuthOptions, Hooks, Middleware } from "./options";

export type AuthPluginSchema = {
	[table in string]: {
		fields: { [field in string]: FieldAttribute };
		disableMigration?: boolean;
		modelName?: string | undefined;
	};
};

export interface FaireAuthPlugin extends BaseFaireAuthPlugin<ContextVars<any>> {
	/**
	 * Custom routes provided by the plugin.
	 */
	routes?: Record<string, AuthEndpoint<any>>;
	/**
	 * Post-validation route hooks used in base or plugin routes.
	 */
	routeHooks?: Prettify<Hooks>;
	/**
	 * Plugin middleware used in base or plugin routes.
	 */
	middleware?: Prettify<Middleware>;
}

export type InferOptionSchema<S extends FaireAuthPluginDBSchema> =
	S extends Record<string, { fields: infer Fields }>
		? {
				[K in keyof S]?: {
					modelName?: string | undefined;
					fields?:
						| {
								[P in keyof Fields]?: string;
						  }
						| undefined;
				};
			}
		: never;

export type InferPluginErrorCodes<O extends FaireAuthOptions> =
	O["plugins"] extends (infer P)[]
		? UnionToIntersection<
				P extends FaireAuthPlugin
					? P["$ERROR_CODES"] extends Record<string, any>
						? P["$ERROR_CODES"]
						: {}
					: {}
			>
		: {};

export type InferPluginHooks<T extends readonly FaireAuthPlugin[]> =
	UnionToIntersection<
		T extends (infer P)[]
			? P extends { routes: infer R }
				? {
						[K in keyof R]?: R[K] extends AuthEndpoint<infer C>
							? RouteHook<C>
							: never;
					}
				: {}
			: {}
	>;

export type InferPluginMiddleware<T extends readonly FaireAuthPlugin[]> =
	UnionToIntersection<
		T extends (infer P)[]
			? P extends { routes: infer R }
				? {
						[K in keyof R]?: R[K] extends AuthEndpoint<infer C>
							? never extends RouteConfigToMiddleware<C>
								? MiddlewareHandler<ContextVars>
								: RouteConfigToMiddleware<C>
							: never;
					}
				: {}
			: {}
	>;

export type InferPluginDTO<T extends readonly FaireAuthPlugin[]> =
	UnionToIntersection<
		T extends (infer P)[]
			? P extends { schemas: infer R }
				? { [K in keyof R]?: DTOTransformer<z.output<R[K]>> }
				: {}
			: {}
	>;

export type InferPluginRateLimit<T extends readonly FaireAuthPlugin[]> = {
	customRules?: UnionToIntersection<
		T extends (infer P)[]
			? P extends { routes: infer R }
				? R extends Record<string, infer E>
					? E extends AuthEndpoint<infer C>
						? {
								[K in C as K["path"]]?:
									| {
											window: number;
											max: number;
									  }
									| false
									| ((request: HonoRequest<K["path"], CustomIO<K, "out">>) =>
											| { window: number; max: number }
											| false
											| Promise<
													| {
															window: number;
															max: number;
													  }
													| false
											  >);
							}
						: {}
					: {}
				: {}
			: {}
	>;
};
