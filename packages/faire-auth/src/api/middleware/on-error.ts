import { HTTPException } from "hono/http-exception";
import type { FaireAuthOptions } from "../../types/options";
import { False, isPromise } from "@faire-auth/core/static";
import { APIError } from "@faire-auth/core/error";
import { logger } from "@faire-auth/core/env";
import { createErrorHandler } from "../factory/middleware";

/**
 * Initializes the error handler.
 * @param options - The FaireAuth options.
 * @returns The error handler function.
 */
export const initErrorHandler = <V extends object>(options: FaireAuthOptions) =>
	createErrorHandler<V>()(async (e, ctx) => {
		const ret =
			ctx.finalized === true
				? ctx.res
				: // TODO: this will handle any 'throw ctx.redirect' etc
					// until we decide if that kind of control flow is
					// acceptable
					e instanceof Response
					? e
					: e instanceof HTTPException
						? e.getResponse()
						: ctx.json(
								{
									success: False,
									...(options.onAPIError?.exposeMessage === true && {
										message: e.message,
									}),
								},
								500,
							);
		if (e instanceof APIError && e.statusText === "FOUND") return ret;
		if (options.onAPIError?.throw === true) throw e;
		if (options.onAPIError?.onError) {
			const res = options.onAPIError.onError(e, ctx as any);
			if (isPromise(res)) await res;
			return ret;
		}

		const optLogLevel = options.logger?.level;
		const critLog = ctx.get("context")?.logger ?? console;
		const log =
			optLogLevel === "error" ||
			optLogLevel === "warn" ||
			optLogLevel === "debug"
				? logger
				: undefined;

		if (options.logger?.disabled !== true) {
			if (
				e != null &&
				typeof e === "object" &&
				"message" in e &&
				typeof e.message === "string"
			) {
				if (
					e.message.includes("no column") ||
					e.message.includes("column") ||
					e.message.includes("relation") ||
					e.message.includes("table") ||
					e.message.includes("does not exist")
				) {
					critLog.error(e.message);
					return ret;
				}
			}

			if (e instanceof APIError) {
				if (e.statusText === "INTERNAL_SERVER_ERROR")
					critLog.error(e.statusText, e);

				log?.error(e.message);
			} else
				critLog.error(
					e != null && typeof e === "object" && "name" in e ? e.name : "",
					e,
				);
		}

		return ret;
	});
