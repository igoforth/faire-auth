import type {
	Cloudflare,
	ExecutionContext,
	IncomingRequestCfProperties,
} from "@cloudflare/workers-types";
import type { ExecutionContext as HonoExecutionContext } from "hono";

export interface CloudflareContext<
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
	Context = ExecutionContext,
> extends HonoExecutionContext {
	/**
	 * the worker's [bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/)
	 */
	env: Cloudflare.Env;
	/**
	 * the request's [cf properties](https://developers.cloudflare.com/workers/runtime-apis/request/#the-cf-property-requestinitcfproperties)
	 */
	cf: CfProperties | undefined;
	/**
	 * the current [execution context](https://developers.cloudflare.com/workers/runtime-apis/context)
	 */
	ctx: Context;
}

/**
 * Symbol used as an index in the global scope to set and retrieve the Cloudflare context
 *
 * This is used both in production (in the actual built worker) and in development (`next dev`)
 *
 * Note: this symbol needs to be kept in sync with the one used in `src/cli/templates/worker.ts`
 */
const cloudflareContextSymbol = Symbol.for("__cloudflare-context__");

/**
 * `globalThis` override for internal usage
 */
type InternalGlobalThis<
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
	Context = ExecutionContext,
> = typeof globalThis & {
	[cloudflareContextSymbol]:
		| CloudflareContext<CfProperties, Context>
		| undefined;
	__NEXT_DATA__: Record<string, unknown>;
};

/**
 * Get the cloudflare context from the current global scope
 */
export function getCloudflareContext<
	CfProperties extends Record<string, unknown> = IncomingRequestCfProperties,
	Context = ExecutionContext,
>(): CloudflareContext<CfProperties, Context> | undefined {
	const global = globalThis as InternalGlobalThis<CfProperties, Context>;
	return global[cloudflareContextSymbol];
}
