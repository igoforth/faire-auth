import type { ENV } from "@faire-auth/core/env";
import type {
	AuthRouteConfig,
	CustomIO,
	ExecOpts,
	ExecRet,
	Fn,
} from "@faire-auth/core/types";
import type { Context } from "hono";

export type ContextVars<E extends object = object> = {
	Bindings: typeof ENV;
	Variables: E;
};

export type Execute<C extends AuthRouteConfig> = Fn<
	CustomIO<C, "in"> extends undefined
		? [ctx?: Context<ContextVars<any>> | ExecOpts<boolean, boolean>]
		: [
				input: NonNullable<CustomIO<C, "in">>,
				ctx?: Context<ContextVars<any>> | ExecOpts<boolean, boolean>,
			],
	Promise<ExecRet<C>>
>;
