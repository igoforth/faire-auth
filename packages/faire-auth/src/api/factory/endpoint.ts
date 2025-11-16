import { logger } from "@faire-auth/core/env";
import type { Bundle } from "@faire-auth/core/factory";
import {
	buildRouteBundle,
	createRouteAppWrapper,
} from "@faire-auth/core/factory";
import type { Definitions, Routes } from "@faire-auth/core/static";
import type {
	AuthRouteConfig,
	ConvertPathType,
	CustomIO,
	ExecOpts,
	FromFn,
	InferInput,
	ProcessRouteConfig,
	RouteConfigToEnv,
	RouteHandler,
	RouteHook,
} from "@faire-auth/core/types";
import {
	isContextLike,
	isExecOpts,
	withOverlays,
} from "@faire-auth/core/utils";
import type { Context, Env, Hono } from "hono";
import type { z } from "zod";
import { contextStorage } from "../../context/hono";
import type { AuthContext } from "../../init";
import type { ContextVars, Execute } from "../../types/hono";
import type { FaireAuthOptions } from "../../types/options";
import LoggerAPI from "../../utils/logged";
import { getBaseURL } from "../../utils/url";
import { initContextMiddleware } from "../middleware/context";
import { initHooksMiddleware } from "../middleware/hooks";
import { initErrorHandler } from "../middleware/on-error";
import { serverApiMiddleware } from "../middleware/server-api";
import { setDefaultExecutionCtx } from "../middleware/set-execution-ctx";
import { setRenderer } from "../middleware/set-renderer";

/**
 * Represents the properties of an auth endpoint.
 * @template C - The route config type.
 * @template O - The options type.
 */
export interface AuthProperties<
	C extends AuthRouteConfig,
	O extends FaireAuthOptions,
> {
	_cfg: ProcessRouteConfig<C, O>;

	config: (
		builtSchemas: Record<Definitions, z.ZodType>,
	) => AuthProperties<C, O>["_cfg"];
	handler: (
		context: AuthContext,
		api: Record<Routes, (...args: any[]) => any>,
	) => RouteHandler<
		AuthProperties<C, O>["_cfg"],
		Env extends RouteConfigToEnv<C>
			? ContextVars
			: RouteConfigToEnv<C> & ContextVars
	>;
	execute: FromFn<Execute<AuthProperties<C, O>["_cfg"]>>;
}

/**
 * Represents an auth endpoint function.
 * @template C - The route config type.
 */
export interface AuthEndpoint<C extends AuthRouteConfig> {
	<O extends FaireAuthOptions = {}>(options: O): AuthProperties<C, O>;
}

/**
 * Factory function for creating auth endpoints.
 *
 * @todo Maybe some day the compiler will be strong enough we won't
 * need this explicit type annotation
 */
export interface AuthFactory {
	<
		C extends AuthRouteConfig,
		H extends (
			options: FaireAuthOptions,
		) => RouteHandler<
			C,
			RouteConfigToEnv<C>,
			InferInput<C>,
			ConvertPathType<C["path"]>,
			true
		>,
	>(
		config: C,
		handler: H,
		hook?: FromFn<RouteHook<C>>,
	): AuthEndpoint<C>;
}

// const endpointLRU = lruCache<string, AuthProperties<any>>({ maxSize: 1 })
/**
 * Creates an auth endpoint.
 * @template C - The route config type.
 * @param config - The route configuration.
 * @param handler - The route handler function.
 * @param hook - Optional route hook.
 * @returns The auth endpoint function.
 */
export const createEndpoint = <C extends AuthRouteConfig>(
	config: C,
	handler: (
		options: FaireAuthOptions,
	) => RouteHandler<
		C,
		Env extends RouteConfigToEnv<C>
			? ContextVars
			: RouteConfigToEnv<C> & ContextVars,
		InferInput<C>,
		ConvertPathType<C["path"]>,
		true
	>,
	hook?: FromFn<RouteHook<C>>,
): AuthEndpoint<C> => {
	let bundle: Bundle<C> | null = null;
	return (options) => {
		const resolvedHandler: RouteHandler<C, ContextVars> = handler(
			options,
		) as any;
		let localApp: Hono | null = null;
		return {
			_cfg: {} as never,
			config: (builtSchemas) => {
				// if (bundle) {
				//   logger.warn(`${rawConfig.operationId} config() already initialized`)
				//   return bundle.resolvedConfig
				// }
				if (!bundle)
					bundle = buildRouteBundle(
						config,
						resolvedHandler as any,
						getBaseURL(options.baseURL, options.basePath)!,
						options,
						builtSchemas,
						hook,
						logger,
					);
				return bundle.resolvedConfig;
			},
			handler: (context, api) => {
				if (!bundle)
					throw new Error(
						`${config.operationId} config() must be called before using handler()!`,
					);
				if (localApp) {
					context.logger.warn(
						`${config.operationId} handler() was called when already initialized`,
					);
					return resolvedHandler;
				}

				localApp = createRouteAppWrapper(
					bundle.routeApp,
					[
						serverApiMiddleware,
						setDefaultExecutionCtx,
						setRenderer,
						initContextMiddleware(options, context, api),
						contextStorage(),
						initHooksMiddleware(options),
					],
					initErrorHandler(options),
					options.basePath,
				);

				return resolvedHandler!;
			},
			execute: LoggerAPI.wrap(
				async (...args) => {
					if (!bundle)
						throw new Error(
							`${config.operationId} config() must be called before using execute()!`,
						);
					const [inputOrCtx, maybeCtx] = args;
					const {
						input,
						ctx,
						opts,
					}: {
						input: CustomIO<ProcessRouteConfig<C>, "in"> | undefined;
						ctx: Context<ContextVars, any, {}> | undefined;
						opts: ExecOpts<boolean, boolean> | undefined;
					} = isContextLike(inputOrCtx)
						? { input: undefined, ctx: inputOrCtx, opts: undefined }
						: isContextLike(maybeCtx)
							? { input: inputOrCtx, ctx: maybeCtx, opts: undefined }
							: isExecOpts(inputOrCtx)
								? { input: undefined, ctx: undefined, opts: inputOrCtx }
								: {
										input: inputOrCtx,
										ctx: undefined,
										opts: isExecOpts(maybeCtx) ? maybeCtx : undefined,
									};

					// when called via the client or via the api when ctx isn't passed
					if (ctx == null) {
						if (localApp == null)
							throw new Error(
								`${config.operationId} handler() must be called before using server-side execute()!`,
							);

						// called from server-side api, so we pass thru localApp
						// for scoping the user expects
						const res = localApp.fetch(
							new Request(...bundle.builder(input, opts?.headers)),
						);

						if (opts?.returnHeaders === true)
							return res instanceof Response
								? bundle.parser!(res).then((r) => ({
										headers: res.headers,
										response: r,
									}))
								: res.then((re) =>
										bundle!.parser!(re).then((r) => ({
											headers: re.headers,
											response: r,
										})),
									);

						if (opts?.asResponse === true) return res;
						return Promise.resolve(res).then((r) => bundle!.parser!(r));
					}
					// called intraroute, so we can just overlay existing context
					// this also skips hooks and route middleware, which may or may not
					// be desired. no point in running session middleware twice tho,
					// just secure the entrypoints

					// it still parses the response with zod, so dto's work
					// provided we check if the config is different
					const out = await resolvedHandler(
						withOverlays(ctx, input, config),
						async () => {
							throw new Error(
								"next() called in manual execution when response was expected",
							);
						},
					);
					return bundle.parser(out) as any;
				},
				config.operationId,
				"immediate",
			),
		};
	};
};
