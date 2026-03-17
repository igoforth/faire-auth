import type {
	Definitions as BaseDefinitions,
	Routes as BaseRoutes,
	SCHEMAS,
} from "@faire-auth/core/static";
import type {
	AuthRouteConfig,
	FaireAuthOptions as BaseFaireAuthOptions,
	FaireAuthRateLimitOptions as BaseFaireAuthRateLimitOptions,
	DefaultHook,
	DTOTransformer,
	FromFn,
	LiteralStringUnion,
	RouteConfigToMiddleware,
	RouteConfigToRequest,
	RouteHook,
} from "@faire-auth/core/types";
import type { HonoRequest, MiddlewareHandler } from "hono";
import type { z } from "zod";
import type { Config } from "../api/types";
import type { ContextVars } from "./hono";
import type { FaireAuthPlugin } from "./plugin";

export type Hooks = {
	[K in LiteralStringUnion<BaseRoutes>]?: FromFn<
		K extends BaseRoutes ? RouteHook<Config<K>> : DefaultHook
	> extends (...args: infer A) => infer R
		? (...args: A) => R | void
		: never;
};

export type DTO = {
	[K in LiteralStringUnion<BaseDefinitions>]?: K extends BaseDefinitions
		? (typeof SCHEMAS)[K] extends { default: infer D }
			? DTOTransformer<z.output<D & z.ZodType>> extends (
					...args: infer A
				) => infer R
				? (...args: A) => R
				: never
			: never
		: (schema: any) => any | Promise<any>;
};

export type Middleware = {
	[K in LiteralStringUnion<BaseRoutes>]?: K extends BaseRoutes
		? RouteConfigToMiddleware<Config<K>> extends never
			? MiddlewareHandler
			: RouteConfigToMiddleware<Config<K>>
		: MiddlewareHandler;
};

export type CustomRules = {
	[K in LiteralStringUnion<Config<BaseRoutes>> as K extends AuthRouteConfig
		? K["path"]
		: string]?:
		| {
				/**
				 * The window to use for the custom rule.
				 */
				window: number;
				/**
				 * The maximum number of requests allowed within the window.
				 */
				max: number;
		  }
		| false
		| ((
				request: K extends AuthRouteConfig
					? RouteConfigToRequest<K>
					: HonoRequest,
		  ) =>
				| { window: number; max: number }
				| false
				| Promise<
						| {
								window: number;
								max: number;
						  }
						| false
				  >);
};

export interface FaireAuthRateLimitOptions
	extends BaseFaireAuthRateLimitOptions {
	/**
	 * Custom rate limit rules to apply to
	 * specific paths.
	 */
	customRules?: CustomRules | undefined;
}

export interface FaireAuthOptions extends BaseFaireAuthOptions<ContextVars> {
	/**
	 * Post-validation route hooks for base or plugin routes.
	 *
	 * Route hooks run after request validation but before the handler runs.
	 * They allow you to modify the request data, handle errors, or perform
	 * additional logic based on the validation result.
	 *
	 * @example
	 * ```ts
	 * routeHooks: {
	 *   // Transform successful sign-up requests to add custom data
	 *   signUpEmail: (result, ctx) => {
	 *     if (result.success && result.target === 'json') {
	 *       result.data.customField = 'custom value';
	 *     }
	 *   },
	 *   // Handle validation errors with custom responses
	 *   signInEmail: (result, ctx) => {
	 *     if (!result.success) {
	 *       return ctx.json({
	 *         error: 'Custom error message',
	 *         details: result.error.errors
	 *       }, 400);
	 *     }
	 *   }
	 * }
	 * ```
	 *
	 * The hook receives:
	 * - `result`: Either `{ success: true, target: string, data: any }` for successful validation
	 *   or `{ success: false, error: ZodError }` for validation failures
	 * - `ctx`: The request context with methods like `ctx.json()` to return responses
	 *
	 * Hooks can return a response or undefined to continue with the original.
	 */
	routeHooks?: Hooks;
	/**
	 * Custom middleware for base or plugin routes.
	 *
	 * Middleware functions run before route handlers and can perform
	 * authentication, authorization, request modification, or early response.
	 * They execute in the order they are defined and can pass control
	 * to the next middleware or route handler.
	 *
	 * @example
	 * ```ts
	 * middleware: {
	 *   // Add custom authentication to specific routes
	 *   signUpEmail: createMiddleware<{ isAdmin: boolean }>()(async (ctx, next) => {
	 *     const user = ctx.get('user');
	 *     if (!user?.isAdmin) {
	 *       return ctx.json({ error: 'Admin access required' }, 403);
	 *     }
	 *     ctx.set("isAdmin", true)
	 *     return await next();
	 *   }),
	 *
	 *   // Add request logging
	 *   getSession: createMiddleware()(async (ctx, next) => {
	 *     const logger = ctx.get("context").logger
	 *     logger.info(`${ctx.req.method} ${ctx.req.path}`);
	 *     const start = Date.now();
	 *     await next();
	 *     logger.info(`Response time: ${Date.now() - start}ms`);
	 *   })
	 * }
	 * ```
	 *
	 * Common middleware patterns:
	 * - Authentication: Check user sessions, API keys, or tokens
	 * - Authorization: Verify user permissions or roles
	 * - Request processing: Parse, validate, or transform request data
	 * - Response modification: Add headers, CORS, or caching
	 * - Error handling: Catch and format errors consistently
	 *
	 * The middleware receives the request context and `next()` function.
	 * Call `await next()` to continue to the next middleware or route handler.
	 * Return a Response to stop processing and send an immediate response.
	 */
	middleware?: Middleware;
	/**
	 * Data Transfer Object (DTO) transformers that automatically transform
	 * response objects across all routes.
	 *
	 * DTO transformers can be synchronous or asynchronous and are perfect for:
	 * - Sanitizing data according to your operational security policy
	 *   (removing passwords, internal IDs)
	 * - Adding computed properties or metadata
	 * - Formatting data for client consumption
	 * - Implementing data access patterns
	 *
	 * @example
	 * ```ts
	 * dto: {
	 *   // Transform user objects to remove sensitive data
	 *   user: (user) => ({
	 *     ...user,
	 *     id: undefined,
	 *     email: user.email.toLowerCase(),
	 *     displayName: user.name || 'Anonymous',
	 *     isActive: true,
	 *     memberSince: user.createdAt.toISOString().split('T')[0]
	 *   }),
	 *
	 *   // Add metadata to session responses
	 *   session: (session) => ({
	 *     ...session,
	 *     expiresIn: Math.floor((session.expiresAt - Date.now()) / 1000),
	 *     isFresh: session.createdAt > new Date(Date.now() - 60000)
	 *   }),
	 *
	 *   // Async transformation for complex operations
	 *   account: async (account) => {
	 *     const providerInfo = await getProviderDetails(account.providerId);
	 *     return {
	 *       ...account,
	 *       providerName: providerInfo.name,
	 *       providerIcon: providerInfo.icon,
	 *       lastUsedFormatted: formatLastUsed(account.updatedAt)
	 *     };
	 *   }
	 * }
	 * ```
	 *
	 * Key features:
	 * - **Automatic nesting**: Works with nested response structures
	 * - **Type safety**: Preserves TypeScript types through transformations
	 * - **Performance**: Only transforms data that actually gets sent to clients
	 *   and the API
	 * - **Consistency**: Ensures all responses follow the same data format
	 *
	 * Common use cases:
	 * - Remove internal properties (passwords, tokens, metadata)
	 * - Format dates, numbers, and other display values
	 * - Add computed properties or relationships
	 * - Implement field-level access control
	 * - Standardize API response formats
	 */
	dto?: DTO;
	/**
	 * List of Faire Auth plugins
	 */
	plugins?: FaireAuthPlugin[] | undefined;
}
