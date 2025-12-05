import type { AuthContext } from "../../init";
import type { FaireAuthOptions } from "../../types/options";
import { createMiddleware } from "../factory/middleware";

/**
 * Initializes the context middleware.
 * @template O - The options type.
 * @param options - The FaireAuth options.
 * @param context - The auth context.
 * @returns The middleware function.
 */
export const initContextMiddleware = <O extends FaireAuthOptions>(
	options: O,
	context: AuthContext,
	api: Record<string, (...args: any[]) => any>,
) =>
	createMiddleware()(async (ctx, next) => {
		// TODO: migrate session
		ctx.set("context", context);
		ctx.set("api", api);
		ctx.set(
			"path",
			ctx.req.path.slice((options.basePath ?? "/api/auth").length),
		);

		return await next();
	});
