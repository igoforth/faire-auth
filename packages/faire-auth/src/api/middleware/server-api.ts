import { createMiddleware } from "../factory/middleware";

/**
 * Middleware that sets a flag indicating the route was called from the server-side API.
 * This should only be used with localApp in createEndpoint to provide permissions depth.
 */
export const serverApiMiddleware = createMiddleware()(async (ctx, next) => {
	// set isServer
	ctx.set("isServer", true);
	return await next();
});
