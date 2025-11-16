import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { InvalidJSONValue, JSONValue } from "hono/utils/types";
import type { AuthContext } from "../types";
import type { ResponseHeadersInit } from "../types/helper";
import type { AuthRouteConfig } from "../types/hono";
import type { JSONRespondReturn } from "../types/json";
import { findSchema } from "../utils/schema";
import { _statusText } from "../error";
import { isTest } from "../env";

/**
 * Initializes a renderer function that validates and responds with JSON, using schemas if available.
 *
 * @todo in future can easily change from json to cbor
 */
export const initRenderer =
	(ctx: Context) =>
	<
		T extends JSONValue | {} | InvalidJSONValue,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		object: T,
		status: U = 200 as U,
		headers?: ResponseHeadersInit,
	): Promise<JSONRespondReturn<T, U>> | JSONRespondReturn<T, U> => {
		const context: AuthContext = ctx.get("context");
		const config: AuthRouteConfig = ctx.get("config");
		const path: string = ctx.get("path");

		if (config == null)
			return ctx.json<T, U>(object, {
				status,
				statusText: _statusText[status],
				...(headers && { headers }),
			});
		// if (config.path !== path)
		// 	context.logger.debug(`${config.path} intraroute by ${path}`);

		const bodySchema = findSchema(config, status, "application/json");

		if (bodySchema)
			return bodySchema
				.parseAsync(object, { reportInput: isTest() })
				.then((r) =>
					ctx.json<T, U>(r, {
						status,
						statusText: _statusText[status],
						...(headers && { headers }),
					}),
				);
		else
			context.logger.debug(
				`Could not find a response schema for ${status} ${ctx.get("path")}`,
			);

		return ctx.json<T, U>(object, {
			status,
			statusText: _statusText[status],
			...(headers && { headers }),
		});
	};
