import { FaireAuthError } from "@faire-auth/core/error";
import type { HonoRequest } from "hono/request";
import type { AuthContext } from "../init";
import type { FaireAuthOptions } from "../types/options";
import { env } from "@faire-auth/core/env";

export * from "hono/utils/url";

const checkHasPath = (url: string): boolean => {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.pathname !== "/";
	} catch {
		throw new FaireAuthError(
			`Invalid base URL: ${url}. Please provide a valid base URL.`,
		);
	}
};

const withPath = (url: string, path = "/api/auth") => {
	const hasPath = checkHasPath(url);
	if (hasPath) return url;
	path = path.startsWith("/") ? path : `/${path}`;
	return `${url.replace(/\/+$/, "")}${path}`;
};

export const getOrigin = (url: string) => {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.origin;
	} catch {
		return null;
	}
};

export const getProtocol = (url: string) => {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.protocol;
	} catch {
		return null;
	}
};

export const getHost = (url: string) => {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.host;
	} catch {
		return url;
	}
};

export const getBaseURLFromEnv = () =>
	env["FAIRE_AUTH_URL"] ??
	env["NEXT_PUBLIC_FAIRE_AUTH_URL"] ??
	env["PUBLIC_FAIRE_AUTH_URL"] ??
	env["NUXT_PUBLIC_FAIRE_AUTH_URL"] ??
	env["NUXT_PUBLIC_AUTH_URL"] ??
	(env["BASE_URL"] !== "/" ? env["BASE_URL"] : undefined);

export const getBaseURL = (
	url?: string,
	path?: string,
	request?: HonoRequest,
) => {
	if (url) return withPath(url, path);
	const fromEnv = getBaseURLFromEnv();
	if (fromEnv) return withPath(fromEnv, path);

	if (request) {
		const fromRequest = request.header("x-forwarded-host");
		const fromRequestProto = request.header("x-forwarded-proto");
		if (fromRequest != null && fromRequestProto != null)
			return withPath(`${fromRequestProto}://${fromRequest}`, path);

		const url = getOrigin(request.url);
		if (url == null || url === "")
			throw new FaireAuthError(
				"Could not get origin from request. Please provide a valid base URL.",
			);

		return withPath(url, path);
	}

	if (typeof window !== "undefined" && window.location != null)
		return withPath(window.location.origin, path);

	return undefined;
};

type TrustedOriginsResult = {
	ready: boolean;
	dynamicPromise?: Promise<void>;
	trustedOrigins: Set<string>;
};
export const getTrustedOrigins = (
	options: Pick<FaireAuthOptions, "baseURL" | "trustedOrigins">,
	context?: Pick<AuthContext, "baseURL"> & { trustedOrigins?: Set<string> },
	request?: HonoRequest,
): {
	ready: boolean;
	dynamicPromise?: Promise<void>;
	trustedOrigins: Set<string>;
} => {
	const result: TrustedOriginsResult = {
		ready: false,
		trustedOrigins: new Set<string>(),
	};
	if (context?.trustedOrigins != null) {
		// If the context already has the set, just return it
		// This is because request is the only mutating aspect of this function
		// otherwise, populate original set for new request
		if (!request)
			return { ready: true, trustedOrigins: context.trustedOrigins };
		else context.trustedOrigins.forEach((o) => result.trustedOrigins.add(o));
	}

	const checkFalsy = () => {
		for (const o of result.trustedOrigins) {
			if (!o)
				throw new FaireAuthError(
					"A provided trusted origin is invalid, make sure your trusted origins list is properly defined.",
				);
		}
	};

	const optionsTrustedOrigins = options.trustedOrigins;

	// no need if already populated from context
	if (!context?.trustedOrigins) {
		const baseURL = options.baseURL ?? context?.baseURL;
		if (baseURL) result.trustedOrigins.add(new URL(baseURL).origin);

		const envTrustedOrigins = process.env["FAIRE_AUTH_TRUSTED_ORIGINS"];
		if (envTrustedOrigins != null)
			envTrustedOrigins.split(",").forEach((o) => result.trustedOrigins.add(o));

		// Handle options.trustedOrigins (array or callback)
		if (optionsTrustedOrigins && Array.isArray(optionsTrustedOrigins))
			optionsTrustedOrigins.forEach((o) => result.trustedOrigins.add(o));
	}

	// awaitable for function call
	if (typeof optionsTrustedOrigins === "function" && request)
		result.dynamicPromise = (async () => {
			const dynamic = await optionsTrustedOrigins(request);
			if (dynamic) dynamic.forEach((o) => result.trustedOrigins.add(o));
			checkFalsy();
			result.ready = true;
		})();
	else {
		checkFalsy();
		result.ready = true;
	}

	return result;
};
