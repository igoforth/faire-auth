import type { ENV } from "@faire-auth/core/env";
import type {
	Exec,
	ExecOpts,
	Fn,
	MinRouteConfig,
} from "@faire-auth/core/types";
import type { Context } from "hono";

export type ContextVars<E extends object = object> = {
	Bindings: typeof ENV;
	Variables: E;
};

export type Execute<C extends MinRouteConfig> = Exec<C, ContextVars<any>>;

export type ToExecFull<T extends Execute<any>> = T extends Fn<
	infer Par extends any[],
	infer Ret
>
	? {
			<
				AsResponse extends boolean = false,
				ReturnHeaders extends boolean = false,
			>(
				...args: Par extends [infer Input, infer Ctx]
					? Ctx extends Context<any>
						? [Input, (Ctx | ExecOpts<AsResponse, ReturnHeaders>)?]
						: Par
					: Par extends [infer Ctx]
						? [(Ctx | ExecOpts<AsResponse, ReturnHeaders>)?]
						: Par
			): Ret extends Promise<infer R>
				? Promise<
						AsResponse extends true
							? Response
							: ReturnHeaders extends true
								? { headers: Headers; response: R }
								: R
					>
				: never;
		}
	: never;
