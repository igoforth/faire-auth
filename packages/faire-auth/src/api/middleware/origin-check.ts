import { False, isPromise } from "@faire-auth/core/static";
import type { Context } from "hono";
import type { AuthContext } from "../../init";
import type { ContextVars } from "../../types/hono";
import type { FaireAuthOptions } from "../../types/options";
import type { InternalLogger } from "@faire-auth/core/env";
import { logger } from "@faire-auth/core/env";
import {
	getHost,
	getOrigin,
	getProtocol,
	getTrustedOrigins,
} from "../../utils/url";
import { wildcardMatch } from "../../utils/wildcard";
import { createMiddleware } from "../factory/middleware";

// use ctx.json() in initOriginCheckMiddleware because set-renderer
// middleware usually comes after

const RELATIVE_PATH_RE =
	/^\/(?!\/|\\|%2f|%5c)[\w\-.\+/@]*(?:\?[\w\-.\+/=&%@]*)?$/;

const matchesPattern = (url: string, pattern: string): boolean => {
	if (url.startsWith("/")) {
		return false;
	}
	if (pattern.includes("*")) {
		// For protocol-specific wildcards, match the full origin
		if (pattern.includes("://")) {
			return wildcardMatch(pattern)(getOrigin(url) || url);
		}
		// For host-only wildcards, match just the host
		return wildcardMatch(pattern)(getHost(url));
	}
	const protocol = getProtocol(url);
	return protocol === "http:" || protocol === "https:" || !protocol
		? pattern === getOrigin(url)
		: url.startsWith(pattern);
};

const validateURL = (
	url: string | undefined,
	label: string,
	trustedOrigins: Set<string>,
	logger: Pick<InternalLogger, "error" | "info">,
	ctx: Context,
) => {
	if (url == null) return null;

	let isTrustedOrigin: boolean = false;
	trustedOrigins.forEach((origin) => {
		if (
			isTrustedOrigin === false &&
			(matchesPattern(url, origin) ||
				(url.startsWith("/") &&
					label !== "origin" &&
					RELATIVE_PATH_RE.test(url)))
		)
			isTrustedOrigin = true;
	});
	if (!isTrustedOrigin) {
		logger.error(`Invalid ${label}: ${url}`);
		logger.info(
			`If it's a valid URL, please add ${url} to trustedOrigins in your auth config\n`,
			`Current list of trustedOrigins: ${[...trustedOrigins].join(", ")}`,
		);
		return ctx.json({ success: False, message: `Invalid ${label}` }, 403);
	}

	return null;
};

/**
 * A middleware to validate callbackURL and origin against
 * trustedOrigins.
 */
export const initOriginCheckMiddleware = (
	options: Pick<FaireAuthOptions, "advanced" | "logger" | "trustedOrigins">,
	context?: Pick<AuthContext, "baseURL"> & { trustedOrigins?: Set<string> },
) => {
	const log = {
		info: (message: string, ...args: any[]) =>
			options.logger?.log?.("info", message, ...args) ?? logger.info,
		error: (message: string, ...args: any[]) =>
			options.logger?.log?.("error", message, ...args) ?? logger.error,
	};

	return createMiddleware()(async (ctx, next) => {
		// if in the future we want to validate all methods the middleware
		// is ready to do so
		if (ctx.get("isServer") === true || ctx.req.method !== "POST")
			return await next();

		const needsBody = ["POST", "PUT", "PATCH"].includes(ctx.req.method);
		const usesCookies = ctx.req.header("cookie") != null;
		const originHeader = ctx.req.header("origin") ?? ctx.req.header("referer");
		const queryCallbackURL = ctx.req.query("callbackURL");
		const { ready, dynamicPromise, trustedOrigins } = getTrustedOrigins(
			options,
			context,
			ctx.req,
		);

		let body: {
			callbackURL?: string;
			redirectTo?: string;
			errorCallbackURL?: string;
			newUserCallbackURL?: string;
		} | null = null;
		if (needsBody)
			try {
				// TODO: clone can't be ideal here but we haven't yet
				// explored storing body after reading
				body = await ctx.req.raw.clone().json();
			} catch {}

		const callbackURL = body?.callbackURL ?? queryCallbackURL;
		const redirectURL = body?.redirectTo;
		const errorCallbackURL = body?.errorCallbackURL;
		const newUserCallbackURL = body?.newUserCallbackURL;

		let ret: Response | null = null;
		if (usesCookies && !options.advanced?.disableCSRFCheck) {
			if (!ready) await dynamicPromise;
			ret = validateURL(originHeader, "origin", trustedOrigins, log, ctx);
			if (ret) return ret;
		}
		if (callbackURL != null) {
			if (!ready) await dynamicPromise;
			ret = validateURL(callbackURL, "callbackURL", trustedOrigins, log, ctx);
			if (ret) return ret;
		}
		if (redirectURL != null) {
			if (!ready) await dynamicPromise;
			ret = validateURL(redirectURL, "redirectURL", trustedOrigins, log, ctx);
			if (ret) return ret;
		}
		if (errorCallbackURL != null) {
			if (!ready) await dynamicPromise;
			ret = validateURL(
				errorCallbackURL,
				"errorCallbackURL",
				trustedOrigins,
				log,
				ctx,
			);
			if (ret) return ret;
		}
		if (newUserCallbackURL != null) {
			if (!ready) await dynamicPromise;
			ret = validateURL(
				newUserCallbackURL,
				"newUserCallbackURL",
				trustedOrigins,
				log,
				ctx,
			);
			if (ret) return ret;
		}

		return await next();
	});
};

/**
 * Validates callback URLs against trusted origins.
 * @template V - The context variables type.
 * @param getValue - Function to get the callback URL(s) from the context.
 * @returns The middleware function.
 */
export const originCheck = (
	getValue: <V extends object>(
		ctx: Context<ContextVars<V>>,
	) => string | string[] | undefined | Promise<string | string[] | undefined>,
) => {
	return createMiddleware()(async (ctx, next) => {
		if (ctx.get("isServer") === true) return await next();

		const context = ctx.get("context");
		let callbackURL = getValue(ctx);
		if (isPromise(callbackURL)) callbackURL = await callbackURL;
		if (!callbackURL) return await next();
		const callbacks = Array.isArray(callbackURL) ? callbackURL : [callbackURL];

		let ret;
		for (const url of callbacks) {
			ret = validateURL(
				url,
				"callbackURL",
				context.trustedOrigins,
				context.logger,
				ctx,
			);
			if (ret) return ret;
		}

		return await next();
	});
};
