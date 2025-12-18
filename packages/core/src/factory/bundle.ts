import type { ErrorHandler, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type {
	ConfigToSchema,
	ConvertPathType,
	DefaultHook,
	FromFn,
	InferInput,
	RouteConfigToEnv,
	RouteHook,
} from "../types/helper";
import type { AuthRouteConfig, RouteHandler } from "../types/hono";
import { hookFor } from "../utils/hono";
import type { Builder, Parser } from "../utils/request";
import { buildRequest, parseResponse } from "../utils/request";
import type { BuiltSchemas } from "../utils/schema";
import { OpenAPIHono } from "./app";
import { resolveConfig } from "./config";

/**
 * Represents a bundled route configuration including resolved config, route app, builder, and parser.
 */
export type Bundle<C extends AuthRouteConfig> = Readonly<{
	resolvedConfig: C;
	routeApp: OpenAPIHono<any, ConfigToSchema<C> & any>;
	builder: Builder;
	parser: Parser<C>;
}>;

/**
 * Builds a route bundle from the given configuration, handler, and options.
 */
export const buildRouteBundle = <C extends AuthRouteConfig>(
	config: C,
	resolvedHandler: RouteHandler<
		C,
		RouteConfigToEnv<C>,
		InferInput<C>,
		ConvertPathType<C["path"]>,
		true
	>,
	baseURL: string,
	options: {
		middleware?: Record<string, MiddlewareHandler | undefined>;
		routeHooks?: Record<string, FromFn<DefaultHook> | undefined>;
		plugins?:
			| {
					middleware?: Record<string, MiddlewareHandler | undefined>;
					routeHooks?: Record<string, FromFn<DefaultHook> | undefined>;
			  }[]
			| undefined;
	},
	builtSchemas: BuiltSchemas,
	hook: FromFn<RouteHook<C>> | undefined = undefined,
	logger: { warn: (...args: any[]) => any } = console,
): Bundle<C> => {
	const resolvedConfig = resolveConfig(config, options, builtSchemas);
	resolvedConfig.middleware = [
		async (ctx, next) => {
			ctx.set("config", resolvedConfig);
			await next();
			ctx.set("config", undefined);
		},
		...(resolvedConfig.middleware as MiddlewareHandler[]),
	];
	return {
		resolvedConfig,
		routeApp: new OpenAPIHono().openapi(
			resolvedConfig,
			resolvedHandler,
			hook ?? hookFor(config.operationId, options),
		) as any,
		builder: buildRequest(resolvedConfig, baseURL),
		parser: parseResponse(resolvedConfig, logger),
	};
};

/**
 * Creates a wrapper Hono app for the route app with middleware and error handler.
 *
 * @todo base path guaranteed by init() but not present here
 */
export const createRouteAppWrapper = <const T extends MiddlewareHandler[]>(
	routeApp: OpenAPIHono,
	middleware: T,
	errorHandler: ErrorHandler,
	basePath: string = "/api/auth",
) =>
	new Hono()
		.basePath(basePath)
		.use(...middleware)
		.onError(errorHandler)
		.route("/", routeApp);
