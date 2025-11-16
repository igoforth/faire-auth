import type { HookHandler } from "@faire-auth/core/types";
import { isPromise } from "@faire-auth/core/static";
import type { Context } from "hono";
import type { ContextVars } from "../../types/hono";
import type { FaireAuthOptions } from "../../types/options";
import { createMiddleware } from "../factory/middleware";

const runHooks = async (
	ctx: Context<ContextVars>,
	hooks: {
		matcher: (context: Context<ContextVars>) => boolean;
		handler: HookHandler<ContextVars>;
	}[],
) => {
	let response: Response | undefined = undefined;
	for (const hook of hooks) {
		if (hook.matcher(ctx)) {
			try {
				const maybePromise = hook.handler(ctx);
				const result = isPromise(maybePromise)
					? await maybePromise
					: maybePromise;
				if (result instanceof Response) response = result;
			} catch (error: any) {
				ctx.error = error;
			}
		}
	}
	return response;
};

const getHooks = <O extends FaireAuthOptions>(options: O) => {
	const beforeHooks: {
		matcher: (context: Context<ContextVars>) => boolean;
		handler: HookHandler<ContextVars>;
	}[] = [];
	const afterHooks: {
		matcher: (context: Context<ContextVars>) => boolean;
		handler: HookHandler<ContextVars>;
	}[] = [];
	if (options.hooks?.before != null) {
		beforeHooks.push({
			matcher: () => true,
			handler: options.hooks.before(options),
		});
	}
	if (options.hooks?.after != null) {
		afterHooks.push({
			matcher: () => true,
			handler: options.hooks.after(options),
		});
	}
	options.plugins?.forEach((p) => {
		p.hooks?.before?.forEach((h) =>
			beforeHooks.push({ matcher: h.matcher, handler: h.handler(options) }),
		);
		p.hooks?.after?.forEach((h) =>
			afterHooks.push({ matcher: h.matcher, handler: h.handler(options) }),
		);
	});

	return { beforeHooks, afterHooks };
};

/**
 * Initializes the hooks middleware.
 * @template O - The options type.
 * @param options - The FaireAuth options.
 * @returns The middleware function.
 */
export const initHooksMiddleware = <O extends FaireAuthOptions>(options: O) => {
	const { beforeHooks, afterHooks } = getHooks<O>(options);

	return createMiddleware()(async (ctx, next) => {
		// run before hooks
		const before = await runHooks(ctx, beforeHooks);
		if (before instanceof Response) return before;

		await next();

		// run after hooks
		const after = await runHooks(ctx, afterHooks);
		if (after instanceof Response) ctx.res = after;
	});
};
