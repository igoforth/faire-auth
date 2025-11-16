import { createMiddleware } from "../factory/middleware";
import { initRenderer } from "@faire-auth/core/factory";

/**
 * Sets the renderer for the context.
 *
 * @todo `options.hono?.advanced?.cbor === true ? cborRespond : ctx.json`
 */
export const setRenderer = createMiddleware()(async (ctx, next) => {
	ctx.setRenderer(initRenderer(ctx));
	return await next();
});
