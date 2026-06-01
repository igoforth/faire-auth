import type { ENV } from "@faire-auth/core/env";
import type {
	AuthRouteConfig,
	Exec,
	ExecOpts,
	Fn,
	JSONRenderRespond,
	LiteralStringUnion,
	MinRouteConfig,
} from "@faire-auth/core/types";
import type { Context } from "hono";
import type { Configs, DefaultAPI } from "../api/types";
import type { AuthContext } from "../init";

// Hono module augmentation. This MUST live in a bundled source module (not a
// triple-slash-referenced ambient `overrides.d.ts`) so rolldown-plugin-dts
// carries it into the emitted declaration output. `types/hono` is a
// `SHARED_MODULES` entry (see tsdown.config.ts) imported by ~every subpath
// for `ContextVars`, so it lands in the stable `shared.d.{m,c}ts` chunk that
// all entries import — meaning consumers of the published bundle get the
// augmentation automatically (typed `ctx.get("context")`, `ctx.get("api")`,
// and the 2-arg `ctx.render(body, status)`), with no consumer-side
// tsconfig.
//
// `ContextRenderer extends JSONRenderRespond` is safe to ship: with the V5
// edit in `@faire-auth/core/src/types/json.ts`, `JSONRespondReturn`'s body
// type is erased to `any` (`Response & TypedResponse<any, U, "json">`), so
// the per-call-site `structuredTypeRelatedTo` work against the route's
// declared response schema is eliminated — peridoc-style consumers
// re-exporting merged `$Infer.Api`/`App` under `declaration: true` drop
// from 4GB OOM to ~38s clean compile (trace-confirmed). `RouteHook<C>`'s
// expected return — `Awaitable<RouteConfigToTypedResponse<R>> | undefined`
// — stays satisfied because `TypedResponse<any, ...>` assigns into
// `TypedResponse<routeBody, ...>` for free.
declare module "hono" {
	export interface ContextRenderer extends JSONRenderRespond {}
	export interface ContextVariableMap {
		/** Gets set early before hitting route handler */
		path: LiteralStringUnion<Configs["path"]>;
		/** Gets set at route handler for intraroute consistency */
		config?: AuthRouteConfig;
		/** Gets set by initContext middleware */
		context: AuthContext;
		/** Gets set in endpoint Route Apps */
		isServer?: true;
		/** Gets set by initContext middleware */
		api: DefaultAPI;
	}
}

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
