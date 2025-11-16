import type { Context } from "hono";
import type { HonoRequest, ExecutionContext } from "hono";
import { setQueryParamRaw } from "./query";
import type { ContextVars } from "../types/hono";

export const updateQueryParam = (
	req: HonoRequest,
	key: string,
	value: string,
	append?: boolean,
) => {
	const url = setQueryParamRaw(req.url, key, value, append);
	Object.defineProperty(req, "url", {
		get: () => url,
		configurable: true,
		enumerable: true,
	});
};

export const updateRequestJson = <T>(req: HonoRequest, value: T) => {
	Object.defineProperty(req, "json", {
		value: async () => value,
		writable: false,
		configurable: true,
	});
};

// export const overrideResponseJson = () => {}

export const createDefaultExecutionCtx = <
	V extends { toAwait: Promise<unknown>[] },
>(
	ctx: Context<ContextVars<V>>,
) => {
	Object.defineProperty(ctx, "executionCtx", {
		get: () =>
			({
				waitUntil: (promise) => ctx.get("toAwait").push(promise),
				passThroughOnException: () => {},
				props: {},
			}) satisfies ExecutionContext,
		configurable: true,
		enumerable: true,
	});
};
