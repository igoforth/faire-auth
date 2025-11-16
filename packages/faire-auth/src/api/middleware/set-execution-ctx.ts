import { createMiddleware } from "../factory/middleware";
import { createDefaultExecutionCtx } from "../../utils/hono";

/**
 * Sets the default execution context if not already present.
 * Manages promises to await after the middleware chain.
 */
export const setDefaultExecutionCtx = createMiddleware<{
	toAwait: Promise<unknown>[];
}>()(async (ctx, next) => {
	ctx.set("toAwait", []);
	let hasDefaultExecutionCtx = false;

	try {
		ctx.executionCtx;
	} catch {
		createDefaultExecutionCtx(ctx);
		hasDefaultExecutionCtx = true;
	}

	await next();

	if (hasDefaultExecutionCtx === true)
		await Promise.allSettled(ctx.get("toAwait"));
});
