import type { SuccessContext } from "@better-fetch/fetch";
import { base64Url, binary, createHMAC } from "@faire-auth/core/datatypes";
import type { Session, User } from "@faire-auth/core/db";
import { env, isProduction } from "@faire-auth/core/env";
import { FaireAuthError } from "@faire-auth/core/error";
import { isPromise } from "@faire-auth/core/static";
import type { LiteralStringUnion } from "@faire-auth/core/types";
import { createTime, getDate } from "@faire-auth/core/utils";
import type { Context } from "hono";
import * as hc from "hono/cookie";
import { signCookieValue } from "../crypto";
import type { AuthContext } from "../init";
import type { ContextVars } from "../types/hono";
import type { FaireAuthOptions } from "../types/options";
import { safeJSONParse } from "./json";

export * from "hono/cookie";
export {
	parse,
	parseSigned,
	serialize,
	serializeSigned,
} from "hono/utils/cookie";

export type FaireAuthCookies = ReturnType<typeof getCookies>;
export type EligibleCookies = LiteralStringUnion<keyof FaireAuthCookies>;

interface CookieAttributes {
	value: string;
	"max-age"?: number;
	expires?: Date;
	domain?: string;
	path?: string;
	secure?: boolean;
	httponly?: boolean;
	samesite?: "lax" | "none" | "strict";
	[key: string]: any;
}

export type CookiePrefixOptions = "host" | "secure";

export interface CookieOptions {
	/**
	 * Domain of the cookie
	 *
	 * The Domain attribute specifies which server can receive a cookie. If specified, cookies are
	 * available on the specified server and its subdomains. If the it is not
	 * specified, the cookies are available on the server that sets it but not on
	 * its subdomains.
	 *
	 * @example
	 * `domain: "example.com"`
	 */
	domain?: string;
	/**
	 * A lifetime of a cookie. Permanent cookies are deleted after the date specified in the
	 * Expires attribute:
	 *
	 * Expires has been available for longer than Max-Age, however Max-Age is less error-prone, and
	 * takes precedence when both are set. The rationale behind this is that when you set an
	 * Expires date and time, they're relative to the client the cookie is being set on. If the
	 * server is set to a different time, this could cause errors
	 */
	expires?: Date;
	/**
	 * Forbids JavaScript from accessing the cookie, for example, through the Document.cookie
	 * property. Note that a cookie that has been created with HttpOnly will still be sent with
	 * JavaScript-initiated requests, for example, when calling XMLHttpRequest.send() or fetch().
	 * This mitigates attacks against cross-site scripting
	 */
	httpOnly?: boolean;
	/**
	 * Indicates the number of seconds until the cookie expires. A zero or negative number will
	 * expire the cookie immediately. If both Expires and Max-Age are set, Max-Age has precedence.
	 *
	 * @example 604800 - 7 days
	 */
	maxAge?: number;
	/**
	 * Indicates the path that must exist in the requested URL for the browser to send the Cookie
	 * header.
	 *
	 * @example
	 * "/docs"
	 * // -> the request paths /docs, /docs/, /docs/Web/, and /docs/Web/HTTP will all match. the request paths /, /fr/docs will not match.
	 */
	path?: string;
	/**
	 * Indicates that the cookie is sent to the server only when a request is made with the https:
	 * scheme (except on localhost), and therefore, is more resistant to man-in-the-middle attacks.
	 */
	secure?: boolean;
	/**
	 * Controls whether or not a cookie is sent with cross-site requests, providing some protection
	 * against cross-site request forgery attacks (CSRF).
	 *
	 * Strict -  Means that the browser sends the cookie only for same-site requests, that is,
	 * requests originating from the same site that set the cookie. If a request originates from a
	 * different domain or scheme (even with the same domain), no cookies with the SameSite=Strict
	 * attribute are sent.
	 *
	 * Lax - Means that the cookie is not sent on cross-site requests, such as on requests to load
	 * images or frames, but is sent when a user is navigating to the origin site from an external
	 * site (for example, when following a link). This is the default behavior if the SameSite
	 * attribute is not specified.
	 *
	 * None - Means that the browser sends the cookie with both cross-site and same-site requests.
	 * The Secure attribute must also be set when setting this value.
	 */
	sameSite?: "Lax" | "lax" | "None" | "none" | "Strict" | "strict";
	/**
	 * Indicates that the cookie should be stored using partitioned storage. Note that if this is
	 * set, the Secure directive must also be set.
	 *
	 * @see https://developer.mozilla.org/en-US/docs/Web/Privacy/Privacy_sandbox/Partitioned_cookies
	 */
	partitioned?: boolean;
	/**
	 * Cooke Prefix
	 *
	 * - secure: `__Secure-` -> `__Secure-cookie-name`
	 * - host: `__Host-` -> `__Host-cookie-name`
	 *
	 * `secure` must be set to true to use prefixes
	 */
	prefix?: CookiePrefixOptions;
}

const tryDecode = (str: string) => {
	try {
		return str.includes("%") ? decodeURIComponent(str) : str;
	} catch {
		return str;
	}
};

export const getCookieKey = (key: string, prefix?: CookiePrefixOptions) => {
	let finalKey = key;
	if (prefix) {
		if (prefix === "secure") {
			finalKey = `__Secure-${key}`;
		} else if (prefix === "host") {
			finalKey = `__Host-${key}`;
		} else {
			return undefined;
		}
	}
	return finalKey;
};

/**
 * Parse an HTTP Cookie header string and returning an object of all cookie
 * name-value pairs.
 *
 * Inspired by https://github.com/unjs/cookie-es/blob/main/src/cookie/parse.ts
 *
 * @param str the string representing a `Cookie` header value
 */
export const parseCookies = (str: string) => {
	if (typeof str !== "string")
		throw new TypeError("argument str must be a string");

	const cookies = new Map<string, string>();

	let index = 0;
	while (index < str.length) {
		const eqIdx = str.indexOf("=", index);
		if (eqIdx === -1) break;

		let endIdx = str.indexOf(";", index);
		if (endIdx === -1) endIdx = str.length;
		else if (endIdx < eqIdx) {
			index = str.lastIndexOf(";", eqIdx - 1) + 1;
			continue;
		}

		const key = str.slice(index, eqIdx).trim();
		if (!cookies.has(key)) {
			let val = str.slice(eqIdx + 1, endIdx).trim();
			if (val.codePointAt(0) === 0x22) val = val.slice(1, -1);
			cookies.set(key, tryDecode(val));
		}

		index = endIdx + 1;
	}

	return cookies;
};

const _serialize = (key: string, value: string, opt: CookieOptions = {}) => {
	let cookie: string;

	if (opt.prefix === "secure") cookie = `__Secure-${key}=${value}`;
	else if (opt.prefix === "host") cookie = `__Host-${key}=${value}`;
	else cookie = `${key}=${value}`;

	if (key.startsWith("__Secure-") && !(opt.secure ?? false)) opt.secure = true;

	if (key.startsWith("__Host-")) {
		if (!(opt.secure ?? false)) opt.secure = true;
		if (opt.path !== "/") opt.path = "/";
		// biome-ignore lint/performance/noDelete: __Host- cookies must not have a domain
		if (opt.domain != null) delete opt.domain;
	}

	if (opt != null && typeof opt.maxAge === "number" && opt.maxAge >= 0) {
		if (opt.maxAge > 34560000)
			throw new Error(
				"Cookies Max-Age SHOULD NOT be greater than 400 days (34560000 seconds) in duration.",
			);

		cookie += `; Max-Age=${Math.floor(opt.maxAge)}`;
	}

	if (opt.domain != null && opt.prefix !== "host")
		cookie += `; Domain=${opt.domain}`;

	if (opt.path != null) cookie += `; Path=${opt.path}`;

	if (opt.expires) {
		if (opt.expires.getTime() - Date.now() > 34560000_000) {
			throw new Error(
				"Cookies Expires SHOULD NOT be greater than 400 days (34560000 seconds) in the future.",
			);
		}
		cookie += `; Expires=${opt.expires.toUTCString()}`;
	}

	if (opt.httpOnly === true) {
		cookie += "; HttpOnly";
	}

	if (opt.secure === true) {
		cookie += "; Secure";
	}

	if (opt.sameSite) {
		cookie += `; SameSite=${opt.sameSite.charAt(0).toUpperCase() + opt.sameSite.slice(1)}`;
	}

	if (opt.partitioned === true) {
		if (!(opt.secure ?? false)) opt.secure = true;
		cookie += "; Partitioned";
	}

	return cookie;
};

// export const serializeCookie = (
// 	key: string,
// 	value: string,
// 	opt?: CookieOptions,
// ) => {
// 	value = encodeURIComponent(value);
// 	return _serialize(key, value, opt);
// };

export const serializeSignedCookie = async (
	key: string,
	value: string,
	secret: string,
	opt?: CookieOptions,
) => {
	value = await signCookieValue(value, secret);
	return _serialize(key, value, opt);
};

export const checkAuthCookie = async (
	request: Headers | Request,
	auth: { $context: Promise<AuthContext> | AuthContext },
) => {
	const headers = request instanceof Headers ? request : request.headers;
	const cookies = headers.get("cookie");
	if (cookies == null) return null;
	const ctx = isPromise(auth.$context) ? await auth.$context : auth.$context;
	const cookieName = ctx.authCookies.sessionToken.name;
	const parsedCookie = parseCookies(cookies);
	const sessionToken = parsedCookie.get(cookieName);
	if (sessionToken != null) return sessionToken;
	return null;
};

/**
 * Split attributes by semicolon, but respect that semicolons
 * might appear in attribute values (though this is rare in practice)
 */
const splitAttributes = (str: string): string[] => {
	const attributes: string[] = [];
	let current = "";
	let inQuotes = false;

	for (let i = 0; i < str.length; i++) {
		const char = str[i];

		if (char === '"' && (i === 0 || str[i - 1] !== "\\")) {
			inQuotes = !inQuotes;
			current += char;
		} else if (char === ";" && !inQuotes) {
			if (current.trim()) {
				attributes.push(current.trim());
			}
			current = "";
		} else {
			current += char;
		}
	}

	// Add the last attribute
	if (current.trim()) {
		attributes.push(current.trim());
	}

	return attributes;
};

/**
 * IMPORTANT - each Set-Cookie header should be a single cookie
 */
export const parseSetCookieHeader = (
	setCookie: string | string[],
): Map<string, CookieAttributes> => {
	if (Array.isArray(setCookie)) {
		return new Map(setCookie.flatMap((c) => [...parseSetCookieHeader(c)]));
	}

	const cookies = new Map<string, CookieAttributes>();

	// Parse the name-value pair first, handling quoted values
	const nameValueMatch = setCookie.match(/^([^=]+)=([^;]*)/);
	if (!nameValueMatch) return cookies;

	const name = nameValueMatch[1]?.trim();
	let value = nameValueMatch[2]?.trim() || "";

	if (!name) return cookies;

	// Remove quotes if present and properly formatted
	if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
		value = value.slice(1, -1);
		// Unescape any escaped quotes within the value
		value = value.replace(/\\"/g, '"');
	}

	const attrObj: CookieAttributes = { value };

	// Find where attributes start (after the first semicolon following the value)
	const firstSemicolon = setCookie.indexOf(";", nameValueMatch[0].length);
	if (firstSemicolon === -1) {
		cookies.set(name, attrObj);
		return cookies;
	}

	// Parse attributes from the remainder
	const attributesStr = setCookie.slice(firstSemicolon + 1);
	const attributes = splitAttributes(attributesStr);

	attributes.forEach((attribute) => {
		const eqIndex = attribute.indexOf("=");
		const attrName =
			eqIndex === -1 ? attribute.trim() : attribute.slice(0, eqIndex).trim();
		const attrValue = eqIndex === -1 ? "" : attribute.slice(eqIndex + 1).trim();

		const normalizedAttrName = attrName.toLowerCase();

		switch (normalizedAttrName) {
			case "max-age": {
				const maxAge = attrValue ? Number.parseInt(attrValue, 10) : undefined;
				if (!Number.isNaN(maxAge) && maxAge != null)
					attrObj["max-age"] = maxAge;
				break;
			}
			case "expires": {
				const expires = attrValue ? new Date(attrValue) : undefined;
				if (expires && !Number.isNaN(expires.getTime()))
					attrObj.expires = expires;
				break;
			}
			case "domain": {
				if (attrValue) attrObj.domain = attrValue;
				break;
			}
			case "path": {
				if (attrValue) attrObj.path = attrValue;
				break;
			}
			case "secure": {
				attrObj.secure = true;
				break;
			}
			case "httponly": {
				attrObj.httponly = true;
				break;
			}
			case "samesite": {
				const samesite = attrValue.toLowerCase() as "lax" | "none" | "strict";
				if (["lax", "none", "strict"].includes(samesite)) {
					attrObj.samesite = samesite;
				}
				break;
			}
			case "partitioned": {
				attrObj.partitioned = true;
				break;
			}
			default: {
				if (normalizedAttrName) {
					attrObj[normalizedAttrName] = attrValue || true;
				}
				break;
			}
		}
	});

	cookies.set(name, attrObj);
	return cookies;
};

export const createCookieCreator = (options: FaireAuthOptions) => {
	const secure =
		options.advanced?.useSecureCookies !== undefined
			? options.advanced.useSecureCookies
			: options.baseURL !== undefined
				? options.baseURL.startsWith("https://")
					? true
					: false
				: isProduction();
	const secureCookiePrefix = secure ? "__Secure-" : "";
	const crossSubdomainEnabled =
		options.advanced?.crossSubDomainCookies?.enabled === true;
	const domain = crossSubdomainEnabled
		? (options.advanced?.crossSubDomainCookies?.domain ??
			(options.baseURL != null ? new URL(options.baseURL).hostname : undefined))
		: undefined;
	if (crossSubdomainEnabled && domain == null)
		throw new FaireAuthError(
			"baseURL is required when crossSubdomainCookies are enabled",
		);

	const createCookie = (
		cookieName: string,
		overrideAttributes: Partial<CookieOptions> = {},
	) => {
		const prefix = options.advanced?.cookiePrefix ?? "faire-auth";
		const name =
			options.advanced?.cookies?.[cookieName as "session_token"]?.name ??
			`${prefix}.${cookieName}`;

		const attributes =
			options.advanced?.cookies?.[cookieName as "session_token"]?.attributes;

		return {
			name: `${secureCookiePrefix}${name}`,
			attributes: {
				secure: !!secureCookiePrefix,
				sameSite: "lax",
				path: "/",
				httpOnly: true,
				...(crossSubdomainEnabled ? { domain } : {}),
				...options.advanced?.defaultCookieAttributes,
				...overrideAttributes,
				...attributes,
			} as CookieOptions,
		};
	};
	return createCookie;
};

export const getCookies = (options: FaireAuthOptions) => {
	const createCookie = createCookieCreator(options);
	const sessionMaxAge =
		options.session?.expiresIn ?? createTime(7, "d").toSeconds();
	const sessionToken = createCookie("session_token", { maxAge: sessionMaxAge });
	const sessionData = createCookie("session_data", {
		maxAge: options.session?.cookieCache?.maxAge ?? 60 * 5,
	});
	const dontRememberToken = createCookie("dont_remember");
	return {
		sessionToken: { name: sessionToken.name, options: sessionToken.attributes },
		/**
		 * This cookie is used to store the session data in the cookie
		 * This is useful for when you want to cache the session in the cookie
		 */
		sessionData: { name: sessionData.name, options: sessionData.attributes },
		dontRememberToken: {
			name: dontRememberToken.name,
			options: dontRememberToken.attributes,
		},
	};
};

const serializeCookies = (cookies: Map<string, string>) =>
	Array.from(cookies, ([key, value]) => (value ? `${key}=${value}` : ""))
		.filter(Boolean)
		.join("; ");

export const createCookieSetter =
	(headers: Headers) => (name: string, value: string) => {
		const cookieMap = parseCookies(headers.get("cookie") ?? "");
		cookieMap.set(name, value);
		headers.set("cookie", serializeCookies(cookieMap));
	};

export const createCookieCapture =
	(headers: Headers) =>
	(callback?: (cookieMap: Map<string, string>) => void) =>
	<Res = {}>(context: SuccessContext<Res>) => {
		const setCookieHeader = context.response.headers.getSetCookie();
		if (setCookieHeader.length === 0) return;

		const cookieMap = new Map([
			...parseCookies(headers.get("cookie") ?? ""),
			...Array.from<[string, CookieAttributes], [string, string]>(
				parseSetCookieHeader(setCookieHeader),
				([key, value]) => [key, value.value],
			),
		]);

		headers.set("cookie", serializeCookies(cookieMap));

		if (callback) callback(cookieMap);
	};

export const getCookieCache = async <
	S extends { session: Session; user: User },
>(
	request: Headers | Request,
	config?: {
		cookiePrefix?: string;
		cookieName?: string;
		isSecure?: boolean;
		secret?: string;
	},
) => {
	const headers = request instanceof Headers ? request : request.headers;
	const cookies = headers.get("cookie");
	if (cookies == null) return null;

	const { cookieName = "session_data", cookiePrefix = "faire-auth" } =
		config ?? {};
	const name =
		config?.isSecure !== undefined
			? config.isSecure
				? `__Secure-${cookiePrefix}.${cookieName}`
				: `${cookiePrefix}.${cookieName}`
			: isProduction()
				? `__Secure-${cookiePrefix}.${cookieName}`
				: `${cookiePrefix}.${cookieName}`;
	const parsedCookie = parseCookies(cookies);
	const sessionData = parsedCookie.get(name);
	if (sessionData != null) {
		const sessionDataPayload = safeJSONParse<{
			session: S;
			expiresAt: number;
			signature: string;
		}>(binary.decode(base64Url.decode(sessionData)));
		if (!sessionDataPayload) return null;

		const secret = config?.secret ?? env["FAIRE_AUTH_SECRET"];
		if (secret == null) {
			throw new FaireAuthError(
				"getCookieCache requires a secret to be provided. Either pass it as an option or set the FAIRE_AUTH_SECRET environment variable",
			);
		}
		const isValid = await createHMAC("SHA-256", "base64urlnopad").verify(
			secret,
			JSON.stringify({
				...sessionDataPayload.session,
				expiresAt: sessionDataPayload.expiresAt,
			}),
			sessionDataPayload.signature,
		);
		if (!isValid) return null;

		return sessionDataPayload.session;
	}
	return null;
};

export const setCookieCache = async <V extends object>(
	ctx: Context<ContextVars<V>>,
	options: Pick<FaireAuthOptions, "session">,
	session: { session: Session; user: User },
	dontRememberMe: boolean = false,
) => {
	const context = ctx.get("context");
	const shouldStoreSessionDataInCookie =
		options.session?.cookieCache?.enabled === true;

	if (shouldStoreSessionDataInCookie) {
		const filteredSession = Object.entries(session.session).reduce<
			Record<string, any>
		>((acc, [key, value]) => {
			const fieldConfig = options.session?.additionalFields?.[key];
			if (!fieldConfig || fieldConfig.returned !== false) acc[key] = value;

			return acc;
		}, {});

		const sessionData = { session: filteredSession, user: session.user };

		const cookieOptions = {
			...context.authCookies.sessionData.options,
			...(dontRememberMe && {
				maxAge: context.authCookies.sessionData.options.maxAge,
			}),
		};

		const expiresAtDate = getDate(cookieOptions.maxAge || 60, "sec").getTime();

		const data = base64Url.encode(
			JSON.stringify({
				session: sessionData,
				expiresAt: expiresAtDate,
				signature: await createHMAC("SHA-256", "base64urlnopad").sign(
					context.secret,
					JSON.stringify({
						...sessionData,
						expiresAt: expiresAtDate,
					}),
				),
			}),
			{
				padding: false,
			},
		);
		if (data.length > 4093)
			throw new FaireAuthError(
				"Session data is too large to store in the cookie. Please disable session cookie caching or reduce the size of the session data",
			);

		hc.setCookie(
			ctx,
			context.authCookies.sessionData.name,
			data,
			cookieOptions,
		);
	}
};

export const getSessionCookie = (
	request: Headers | Request,
	config?: { cookiePrefix?: string; cookieName?: string; path?: string },
) => {
	if (config?.cookiePrefix != null) {
		if (config.cookieName != null)
			config.cookiePrefix = `${config.cookiePrefix}-`;
		else config.cookiePrefix = `${config.cookiePrefix}.`;
	}
	const headers = "headers" in request ? request.headers : request;
	// const req = request instanceof Request ? request : undefined
	// const url = getBaseURL(req?.url, config?.path, req)
	const cookies = headers.get("cookie");
	if (cookies == null) return null;
	const { cookieName = "session_token", cookiePrefix = "faire-auth." } =
		config ?? {};
	const name = `${cookiePrefix}${cookieName}`;
	const secureCookieName = `__Secure-${name}`;
	const parsedCookie = parseCookies(cookies);
	const sessionToken =
		parsedCookie.get(name) ?? parsedCookie.get(secureCookieName);
	if (sessionToken != null) return sessionToken;

	return null;
};

export const setSessionCookie = <V extends object>(
	ctx: Context<ContextVars<V>>,
	authOptions: Pick<FaireAuthOptions, "session" | "secondaryStorage">,
	session: { session: Session; user: User },
	dontRememberMe?: boolean,
	overrides?: Partial<CookieOptions>,
): Promise<void> => {
	const context = ctx.get("context");

	return hc
		.getSignedCookie(
			ctx,
			context.secret,
			context.authCookies.dontRememberToken.name,
		)
		.then((dontRememberMeCookie) => {
			// if dontRememberMe is not set, use the cookie value
			dontRememberMe ??= !!dontRememberMeCookie;

			const options = { ...context.authCookies.sessionToken.options };
			// biome-ignore lint/performance/noDelete: maxAge must be absent, not undefined
			if (dontRememberMe === true) delete options.maxAge;
			else options.maxAge = context.sessionConfig.expiresIn;
			// const maxAge = dontRememberMe
			// 	? undefined
			// 	: context.sessionConfig.expiresIn;

			return hc.setSignedCookie(
				ctx,
				context.authCookies.sessionToken.name,
				session.session.token,
				context.secret,
				{ ...options, ...overrides },
			);
		})
		.then(() => {
			if (dontRememberMe === true) {
				return hc.setSignedCookie(
					ctx,
					context.authCookies.dontRememberToken.name,
					"true",
					context.secret,
					context.authCookies.dontRememberToken.options,
				);
			}
			return Promise.resolve();
		})
		.then(() => {
			if (authOptions.session?.cookieCache?.enabled === true) {
				return setCookieCache(ctx, authOptions, session, dontRememberMe);
			}
			return Promise.resolve();
		})
		.then(() => {
			context.newSession = session;

			if (authOptions.secondaryStorage) {
				const maybePromise = context.secondaryStorage?.set(
					session.session.token,
					JSON.stringify({ user: session.user, session: session.session }),
					Math.floor(
						(new Date(session.session.expiresAt).getTime() - Date.now()) / 1000,
					),
				);
				if (isPromise<void>(maybePromise as any))
					return maybePromise as Promise<void>;
			}
			return Promise.resolve();
		});
};

export const deleteSessionCookie = <V extends object>(
	ctx: Context<ContextVars<V>>,
	skipDontRememberMe?: boolean,
) => {
	const context = ctx.get("context");
	hc.deleteCookie(
		ctx,
		context.authCookies.sessionToken.name,
		context.authCookies.sessionToken.options,
	);
	hc.deleteCookie(
		ctx,
		context.authCookies.sessionData.name,
		context.authCookies.sessionData.options,
	);
	if (!skipDontRememberMe)
		hc.deleteCookie(
			ctx,
			context.authCookies.dontRememberToken.name,
			context.authCookies.dontRememberToken.options,
		);
};
