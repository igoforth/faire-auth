import type { InterceptHandler } from "@faire-auth/core/types";
import type { Context } from "hono";
import type { ContextVars } from "../../types/hono";
import type { FaireAuthOptions } from "../../types/options";
import { createMiddleware } from "../factory/middleware";

const runIntercept = (
	ctx: Context<ContextVars>,
	hooks: InterceptHandler<ContextVars>[],
) => {
	let response: Response | undefined = undefined;
	for (const hook of hooks) {
		try {
			const result = hook(ctx);
			if (result instanceof Response) response = result;
		} catch (error: any) {
			ctx.error = error;
		}
	}
	return response;
};

const getHooks = <O extends FaireAuthOptions>(options: O) => {
	const beforeHooks: InterceptHandler<ContextVars>[] = [];
	const afterHooks: InterceptHandler<ContextVars>[] = [];
	options.plugins?.forEach((p) => {
		if (p.onRequest) beforeHooks.push(p.onRequest);
		if (p.onResponse) afterHooks.push(p.onResponse);
	});

	return { beforeHooks, afterHooks };
};

/**
 * Initializes the intercept middleware.
 * @template O - The options type.
 * @param options - The FaireAuth options.
 * @returns The middleware function.
 */
export const initInterceptMiddleware = <O extends FaireAuthOptions>(
	options: O,
) => {
	const { beforeHooks, afterHooks } = getHooks<O>(options);

	return createMiddleware()(async (ctx, next) => {
		// run before hooks
		const before = runIntercept(ctx, beforeHooks);
		if (before instanceof Response) return before;

		await next();

		// run after hooks
		const after = runIntercept(ctx, afterHooks);
		if (after instanceof Response) ctx.res = after;
	});
};
