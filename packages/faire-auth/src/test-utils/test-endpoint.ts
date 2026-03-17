import { SCHEMAS, type Definitions } from "@faire-auth/core/static";
import type {
	AuthRouteConfig,
	RouteConfigToEnv,
	RouteHandler,
} from "@faire-auth/core/types";
import { buildSchemas } from "@faire-auth/core/utils";
import type { SetRequired } from "type-fest";
import type { z } from "zod";
import { createEndpoint, createAPI } from "../api/factory/endpoint";
import type { AuthContext } from "../init";
import { init } from "../init";
import type { ContextVars } from "../types/hono";
import type { FaireAuthOptions } from "../types/options";

export const createTestEndpoint = <
	C extends AuthRouteConfig,
	H extends (
		options: FaireAuthOptions,
	) => RouteHandler<C, RouteConfigToEnv<C> & ContextVars>,
	O extends SetRequired<FaireAuthOptions, "baseURL"> = { baseURL: string },
>(
	c: C,
	h: H,
	o?: {
		options?: O;
		builtSchemas?: Record<Definitions, z.ZodType>;
		context?: AuthContext;
	},
) => {
	const options = o?.options ?? ({} as O);
	const [context, opts] =
		o?.context && o?.options
			? ([o.context, o.options] as const)
			: init(options);
	const schemas = buildSchemas(SCHEMAS, opts);
	const api = { execute: createEndpoint(c, h as any)(opts) };
	const [config, handler] = api.execute.toArgs(schemas, context, {});
	return {
		config,
		handler,
		execute: createAPI(api).execute,
	};
};
