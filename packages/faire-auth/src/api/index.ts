import { OpenAPIHono } from "@faire-auth/core/factory";
import { SCHEMAS } from "@faire-auth/core/static";
import { buildSchemas } from "@faire-auth/core/utils";
import { Hono } from "hono";
import { RegExpRouter } from "hono/router/reg-exp-router";
import { contextStorage } from "../context/hono";
import type { AuthContext } from "../init";
import type { FaireAuthOptions } from "../types/options";
import { createEndpoints, createArgs } from "./endpoints";
import { initContextMiddleware } from "./middleware/context";
import { initHooksMiddleware } from "./middleware/hooks";
import { initInterceptMiddleware } from "./middleware/intercept";
import { initHandleDisabledMiddleware } from "./middleware/on-disabled";
import { initErrorHandler } from "./middleware/on-error";
import { initOriginCheckMiddleware } from "./middleware/origin-check";
import { initRateLimitMiddleware } from "./middleware/rate-limit";
import { setDefaultExecutionCtx } from "./middleware/set-execution-ctx";
import { setRenderer } from "./middleware/set-renderer";
import { createAPI } from "./factory/endpoint";

export type { InferAPI, InferApp, InferClient } from "./types";

export const router = <O extends FaireAuthOptions>(
	context: AuthContext,
	options: O,
) => {
	// appends .transform() for dto's
	const schemas = buildSchemas(SCHEMAS, options);

	// resolves any route hooks and calls endpoints with options
	const { endpoints, hooks } = createEndpoints(options);

	// sort into endpoints which should be exposed or not
	const { pub } = createArgs(endpoints, schemas, context, hooks);

	// just points to endpoints, but does some type black magic
	const api = createAPI(endpoints);

	// instantiate app
	// I know we can loop, but no need to reproduce types here
	let app = new OpenAPIHono(options)
		.openapi(...pub[0])
		.openapi(...pub[1])
		.openapi(...pub[2])
		.openapi(...pub[3])
		.openapi(...pub[4])
		.openapi(...pub[5])
		.openapi(...pub[6])
		.openapi(...pub[7])
		.openapi(...pub[8])
		.openapi(...pub[9])
		.openapi(...pub[10])
		.openapi(...pub[11])
		.openapi(...pub[12])
		.openapi(...pub[13])
		.openapi(...pub[14])
		.openapi(...pub[15])
		.openapi(...pub[16])
		.openapi(...pub[17])
		.openapi(...pub[18])
		.openapi(...pub[19])
		.openapi(...pub[20])
		.openapi(...pub[21])
		.openapi(...pub[22])
		.openapi(...pub[23])
		.openapi(...pub[24])
		.openapi(...pub[25])
		.openapi(...pub[26])
		.openapi(...pub[27])
		.openapi(...pub[28]);

	// we can freeze app inference at this point in time
	// bc later we can infer plugin routes and openapi additions
	// from options
	type App = typeof app;

	// add plugin routes
	pub
		.slice(29)
		.forEach((route) => (app = app.openapi(...(route as [any, any, any]))));

	return {
		api,
		app: new Hono({
			router: new RegExpRouter(),
			...options.hono?.init,
		})
			.basePath(options.basePath!)
			.use(
				// setup
				setDefaultExecutionCtx,
				setRenderer,
				initContextMiddleware(options, context, endpoints),
				contextStorage(),
				// onRequest
				initHandleDisabledMiddleware(options),
				initInterceptMiddleware(options),
				initRateLimitMiddleware(options, context.rateLimit),
				// hooks
				initOriginCheckMiddleware(options, context),
				initHooksMiddleware(options),
			)
			.onError(initErrorHandler(options))
			.route("/", app) as unknown as App,
	};
};
