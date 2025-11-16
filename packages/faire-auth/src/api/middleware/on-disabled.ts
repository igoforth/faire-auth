import type { FaireAuthOptions } from "../../types/options";
import { createMiddleware } from "../factory/middleware";

/**
 * Initializes the middleware to handle disabled paths.
 * @param options - The FaireAuth options.
 * @returns The middleware function.
 */
export const initHandleDisabledMiddleware = (options: FaireAuthOptions) => {
	let disabledPaths: string[] | null = null;
	return createMiddleware()(async (ctx, next) => {
		disabledPaths ??= options.disabledPaths ?? [];

		if (disabledPaths.includes(ctx.get("path"))) return ctx.notFound();
		return await next();
	});
};
