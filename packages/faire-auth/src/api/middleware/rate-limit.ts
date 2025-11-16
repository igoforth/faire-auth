import { False, isPromise } from "@faire-auth/core/static";
import type { Context } from "hono";
import type { AuthContext } from "../../init";
import type { RateLimit } from "../../types/models";
import type { FaireAuthOptions } from "../../types/options";
import { getIp } from "../../utils/ip";
import { safeJSONParse } from "../../utils/json";
import { wildcardMatch } from "../../utils/wildcard";
import { createMiddleware } from "../factory/middleware";

const shouldRateLimit = (
	max: number,
	window: number,
	rateLimitData: RateLimit,
) => {
	const now = Date.now();
	const windowInMs = window * 1000;
	const timeSinceLastRequest = now - rateLimitData.lastRequest;
	return timeSinceLastRequest < windowInMs && rateLimitData.count >= max;
};

const rateLimitResponse = (ctx: Context, retryAfter: number) => {
	ctx.header("X-Retry-After", retryAfter.toString());
	return ctx.json(
		{ status: False, message: "Too many requests. Please try again later." },
		429,
	);
};

const getRetryAfter = (lastRequest: number, window: number) => {
	const now = Date.now();
	const windowInMs = window * 1000;
	return Math.ceil((lastRequest + windowInMs - now) / 1000);
};

const createDBStorage = (ctx: Pick<AuthContext, "adapter" | "logger">) => {
	const model = "rateLimit";
	const db = ctx.adapter;
	return {
		get: async (key: string) => {
			const res = db.findMany<RateLimit>({
				model,
				where: [{ field: "key", value: key }],
			});
			const data = isPromise(res) ? (await res)[0] : res[0];

			if (typeof data?.lastRequest === "bigint")
				data.lastRequest = Number(data.lastRequest);

			return data;
		},
		set: async (key: string, value: RateLimit, _update?: boolean) => {
			try {
				if (_update === true) {
					const res = db.updateMany({
						model: "rateLimit",
						where: [{ field: "key", value: key }],
						update: { count: value.count, lastRequest: value.lastRequest },
					});
					if (isPromise(res)) await res;
				} else {
					const res = await db.create({
						model: "rateLimit",
						data: { key, count: value.count, lastRequest: value.lastRequest },
					});
					if (isPromise(res)) await res;
				}
			} catch (e) {
				ctx.logger.error("Error setting rate limit", e);
			}
		},
	};
};

const memory = new Map<string, RateLimit>();
/**
 * Gets the rate limit storage based on the configuration.
 * @param context - The auth context with rateLimit, adapter, and logger.
 * @param options - The FaireAuth options with rateLimit and secondaryStorage.
 * @returns The storage object with get and set methods.
 */
export const getRateLimitStorage = (
	config: AuthContext["rateLimit"],
	context: Pick<AuthContext, "adapter" | "logger">,
	options: Pick<FaireAuthOptions, "rateLimit" | "secondaryStorage">,
) => {
	if (options.rateLimit?.customStorage) return options.rateLimit.customStorage;

	if (config.storage === "secondary-storage")
		return {
			get: (key: string) => {
				const res = options.secondaryStorage?.get(key);
				return isPromise(res)
					? res.then((r) => (r ? safeJSONParse<RateLimit>(r) : undefined))
					: res
						? safeJSONParse<RateLimit>(res)
						: undefined;
			},
			set: (key: string, value: RateLimit) =>
				options.secondaryStorage?.set(key, JSON.stringify(value)),
		};

	if (config.storage === "memory")
		return {
			get: (key: string) => memory.get(key),
			set: (key: string, value: RateLimit, _update?: boolean) =>
				memory.set(key, value),
		};

	return createDBStorage(context);
};

const getDefaultSpecialRules = () => [
	{
		pathMatcher: (path: string) =>
			path.startsWith("/sign-in") ||
			path.startsWith("/sign-up") ||
			path.startsWith("/change-password") ||
			path.startsWith("/change-email"),
		window: 10,
		max: 3,
	},
];

/**
 * Initializes the rate limit middleware.
 * @param options - The FaireAuth options.
 * @returns The middleware function.
 */
export const initRateLimitMiddleware = (
	options: Pick<
		FaireAuthOptions,
		"advanced" | "rateLimit" | "plugins" | "secondaryStorage"
	>,
	rateLimit: AuthContext["rateLimit"],
) => {
	const specialRules = getDefaultSpecialRules();

	return createMiddleware()(async (ctx, next) => {
		if (!rateLimit.enabled) return await next();
		const ip = getIp(ctx.req, options);
		if (!ip) return await next();

		const context = ctx.get("context");
		const path = ctx.get("path");
		const key = ip + path;
		let window = rateLimit.window;
		let max = rateLimit.max;

		const specialRule = specialRules.find((rule) => rule.pathMatcher(path));
		if (specialRule) {
			window = specialRule.window;
			max = specialRule.max;
		}

		for (const plugin of options.plugins ?? []) {
			if (plugin.rateLimit) {
				const matchedRule = plugin.rateLimit.find((rule) =>
					rule.pathMatcher(path),
				);
				if (matchedRule) {
					window = matchedRule.window;
					max = matchedRule.max;
					break;
				}
			}
		}

		if (rateLimit.customRules) {
			const _path = Object.keys(rateLimit.customRules).find((p) =>
				p.includes("*") ? wildcardMatch(p)(path) : p === path,
			);
			if (_path) {
				const customRule = rateLimit.customRules[_path];
				const res =
					typeof customRule === "function" ? customRule(ctx.req) : customRule;
				const resolved = isPromise(res) ? await res : res;
				if (resolved) {
					window = resolved.window;
					max = resolved.max;
				}

				if (resolved === false) return await next();
			}
		}

		const storage = getRateLimitStorage(rateLimit, context, options);
		const res = storage.get(key);
		const now = Date.now();
		const data = isPromise(res) ? await res : res;

		if (!data) {
			const res2 = storage.set(key, { key, count: 1, lastRequest: now });
			if (isPromise(res2)) await res2;
		} else {
			const timeSinceLastRequest = now - data.lastRequest;

			if (shouldRateLimit(max, window, data)) {
				const retryAfter = getRetryAfter(data.lastRequest, window);
				return rateLimitResponse(ctx, retryAfter);
			}
			if (timeSinceLastRequest > window * 1000) {
				// Reset the count if the window has passed since the last request
				const res3 = storage.set(
					key,
					{ ...data, count: 1, lastRequest: now },
					true,
				);
				if (isPromise(res3)) await res3;
			} else {
				const res3 = storage.set(
					key,
					{ ...data, count: data.count + 1, lastRequest: now },
					true,
				);
				if (isPromise(res3)) await res3;
			}
		}
		return await next();
	});
};
