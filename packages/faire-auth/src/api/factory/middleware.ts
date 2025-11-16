import type { HookHandler } from "@faire-auth/core/types";
import type { Input, MiddlewareHandler, ErrorHandler } from "hono/types";
import type { ContextVars } from "../../types/hono";

/**
 * Creates a hook handler.
 * @template E - The environment type.
 * @template P - The path type.
 * @template I - The input type.
 * @param handler - The hook handler function.
 * @returns The hook handler.
 */
export const createHook =
	<E extends object, P extends string = string, I extends Input = {}>() =>
	<H extends HookHandler<ContextVars<E>, P, I>, R extends H>(handler: H): R =>
		handler as R;

/**
 * Creates a middleware handler.
 * @template E - The environment type.
 * @template P - The path type.
 * @template I - The input type.
 * @param handler - The middleware handler function.
 * @returns The middleware handler.
 */
export const createMiddleware =
	<E extends object, P extends string = string, I extends Input = {}>() =>
	<H extends MiddlewareHandler<ContextVars<E>, P, I>, R extends H>(
		handler: H,
	): R =>
		handler as R;

/**
 * Creates an error handler.
 * @template E - The environment type.
 * @param handler - The error handler function.
 * @returns The error handler.
 */
export const createErrorHandler =
	<E extends object>() =>
	<H extends ErrorHandler<ContextVars<E>>, R extends H>(handler: H): R =>
		handler as R;
