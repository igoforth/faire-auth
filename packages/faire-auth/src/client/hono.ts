import type {
	BetterFetch,
	BetterFetchOption,
	CreateFetchOption,
	Schema,
} from "@better-fetch/fetch";
import { isPromise } from "@faire-auth/core/static";
import type { AnyHono, ExK, UnionToIntersection } from "@faire-auth/core/types";
import { isHonoRequestLike } from "@faire-auth/core/utils";
import type { Hono, ValidationTargets } from "hono";
import type { HonoRequest } from "hono/request";
import type { FormValue } from "hono/types";
import type { Atom } from "nanostores";
import { serialize } from "../utils/cookies";
import { defu } from "../utils/defu";
import {
	buildSearchParams,
	mergeHeaders,
	mergePath,
	normaliseHeaders,
	removeIndexString,
	replaceUrlParam,
	replaceUrlProtocol,
} from "../utils/request";
import type { Client, FaireAuthClientPlugin } from "./types";

export type ClientRequestOptions<T = unknown> = {
	fetch?: typeof fetch | HonoRequest;
	webSocket?: (...args: ConstructorParameters<typeof WebSocket>) => WebSocket;
	/**
	 * Standard `RequestInit`, caution that this take highest priority
	 * and could be used to overwrite things that Hono sets for you, like `body | method | headers`.
	 *
	 * If you want to add some headers, use in `headers` instead of `init`
	 */
	init?: RequestInit;
} & (keyof T extends never
	? { headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>) }
	: { headers: T | (() => T | Promise<T>) });

// type ClientRequestOptions<T = unknown> = Omit<CRO<T>, 'fetch'>

export type FetchOptions<
	Head = unknown,
	Body = any,
	Query extends Record<string, any> = any,
	Params extends Record<string, any> | Array<string> | undefined = any,
	Res = any,
	ExtraOptions extends Record<string, any> = {},
> = {
	fetchOptions?: ExK<
		BetterFetchOption<Body, Query, Params, Res, ExtraOptions>,
		"throw"
	>;
} & ClientRequestOptions<Head>;

export type FetchEsque = (
	input: string | URL | globalThis.Request,
	init?: RequestInit,
) => Promise<Response> | Response;

export type CreateOptions<S extends Schema = Schema> = {
	baseURL?: string;
	createFetchOptions?:
		| (ExK<CreateFetchOption, "schema" | "customFetchImpl"> & {
				schema?: S;
				// also allowing synchronous returns
				customFetchImpl?: FetchEsque;
		  })
		| undefined;
} & ExK<ClientRequestOptions, "headers">;

// null or obj and not fetchOptions, fetch, websocket, init, headers in obj
const isInputOpts = (
	value: unknown,
): value is
	| (ValidationTargets<FormValue> & { param?: Record<string, string> })
	| null =>
	value == null ||
	(typeof value === "object" &&
		Object.keys(value).every(
			(k) =>
				k !== "fetchOptions" &&
				k !== "fetch" &&
				k !== "websocket" &&
				k !== "init" &&
				k !== "headers",
		));

const returnFromRoutesIfFn = (
	fullPath: string[],
	routes: any,
): ((...args: any[]) => any) | undefined => {
	let current: any = routes;
	for (const segment of fullPath) {
		if (current && typeof current === "object" && segment in current)
			current = current[segment];
		else {
			current = undefined;
			break;
		}
	}
	// && !/^\$/.test(current)
	// if (typeof current === "function") return current;
	if (
		typeof current === "function" ||
		fullPath[0] === "$fetch" ||
		fullPath[0] === "$store"
	)
		return current;
	return;
};

const createProxy = (
	callback: (opts: {
		path: string[];
		args:
			| [
					args?: ValidationTargets<FormValue> & {
						param?: Record<string, string>;
					},
					opt?: FetchOptions,
			  ]
			| [opt?: FetchOptions];
	}) => unknown,
	path: string[],
	routes: any,
) => {
	const proxy: unknown = new Proxy(() => {}, {
		get(_obj, key) {
			if (
				typeof key !== "string" ||
				key === "then" ||
				key === "catch" ||
				key === "finally"
			)
				return undefined;
			const fullPath = [...path, key];

			const maybeFn = returnFromRoutesIfFn(fullPath, routes);
			if (maybeFn) return maybeFn;

			return createProxy(callback, fullPath, routes);
		},
		apply(_1, _2, args) {
			return callback({ path, args: args as [any, any] | [any] });
		},
	});
	return proxy;
};

class ClientRequestImpl<F extends BetterFetch = BetterFetch<CreateOptions>> {
	private url: string;
	private path: string;
	private method: string;
	private queryParams: URLSearchParams | undefined = undefined;
	private pathParams: Record<string, string> = {};
	private rBody: BodyInit | undefined;
	private cType: string | undefined = undefined;
	private $fetch: F;
	private atoms?: Record<string, Atom>;
	private atomListeners?: FaireAuthClientPlugin["atomListeners"];

	constructor(
		url: string,
		path: string,
		method: string,
		$fetch: F,
		atoms?: Record<string, Atom>,
		atomListeners?: FaireAuthClientPlugin["atomListeners"],
	) {
		this.url = url;
		this.path = path;
		this.method = method;
		this.$fetch = $fetch;
		if (atoms) this.atoms = atoms;
		if (atomListeners) this.atomListeners = atomListeners;
	}
	fetch = async (args: Partial<ValidationTargets>, opt: FetchOptions) => {
		if (isHonoRequestLike(opt.fetch))
			return this.$fetch(opt.fetch.url, opt.fetch.raw);

		if (args) {
			if (args.query) this.queryParams = buildSearchParams(args.query);

			if (args.form) {
				const form = new FormData();
				for (const [k, v] of Object.entries(args.form)) {
					if (Array.isArray(v)) for (const v2 of v) form.append(k, v2);
					else form.append(k, v);
				}
				this.rBody = form;
			}

			if (args.json) {
				this.rBody = JSON.stringify(args.json);
				this.cType = "application/json";
			}

			if (args.param) this.pathParams = args.param;
		}

		let methodUpperCase = this.method.toUpperCase();

		let headers: Headers = normaliseHeaders(opt.headers) as any;
		if (isPromise(headers)) headers = await headers;
		if (args?.header)
			Object.entries(args.header).forEach(([k, v]) => headers.set(k, v));

		if (args?.cookie) {
			const cookies: string[] = [];
			for (const [key, value] of Object.entries(args.cookie))
				cookies.push(serialize(key, value, { path: "/" }));

			headers.set("Cookie", cookies.join(","));
		}

		if (this.cType) headers.set("Content-Type", this.cType);

		let url = this.url;

		url = removeIndexString(url);
		url = replaceUrlParam(url, this.pathParams);

		if (this.queryParams && this.queryParams.size > 0)
			url = url + "?" + this.queryParams.toString();

		methodUpperCase = this.method.toUpperCase();
		const setBody = !(methodUpperCase === "GET" || methodUpperCase === "HEAD");

		// Pass URL string to 1st arg for testing with MSW and node-fetch
		return this.$fetch(url, {
			// defaults
			customFetchImpl: opt.fetch,
			...opt.fetchOptions,
			// from input
			...(setBody === true && { body: this.rBody }),
			method: methodUpperCase,
			// merged already with fetchOptions
			headers,
			// overrides
			...opt.init,
			// hooks
			onSuccess: async (context) => {
				if (opt.fetchOptions?.onSuccess)
					await opt.fetchOptions.onSuccess(context);
				// await Promise.all([
				// 	opt.fetchOptions?.onSuccess?.(context),
				// ...(opt.fetchOptions?.plugins?.map((p) =>
				// 	p.hooks?.onSuccess?.(context),
				// ) ?? []),
				// ]);

				/**
				 * We trigger listeners
				 */
				const matches = this.atomListeners?.filter((s) => s.matcher(this.path));
				if (!matches?.length) return;
				for (const match of matches) {
					const signal = this.atoms?.[match.signal as any];
					if (!signal) return;
					/**
					 * To avoid race conditions we set the signal in a setTimeout
					 */
					const val = signal.get();
					// @ts-expect-error a description
					setTimeout(() => signal.set(!val), 10);
				}
			},
			// TODO: wait for better-fetch to properly pass us the response object
			// on !ok otherwise it calls text() which defeats the entire point
			// of binary serialization formats
			//
			// notes:
			// we need this because better-fetch refuses to return the error text
			// if error response is not json parseable. Meaning if we want to extend
			// to additional protocols like cbor, we need to catch in a promise chain
			// we will recreate specified throw return after processing
			// throw: true,
		});
	};
}

export const createHonoClient = <
	T extends AnyHono = AnyHono,
	S extends Schema = Schema,
>(
	options: CreateOptions<S>,
	routes: any,
	$fetch: BetterFetch<
		Exclude<(typeof options)["createFetchOptions"], undefined> &
			CreateFetchOption
	>,
	atoms?: Record<string, Atom>,
	atomListeners?: FaireAuthClientPlugin["atomListeners"],
) =>
	createProxy(
		function proxyCallback(opts) {
			const parts = opts.path.map((segment) =>
				segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
			);
			const lastParts = parts.slice(-3).reverse();

			// allow calling .toString() and .valueOf() on the proxy
			if (lastParts[0] === "toString") {
				if (lastParts[1] === "name")
					// e.g. hc().somePath.name.toString() -> "somePath"
					return lastParts[2] ?? "";

				// e.g. hc().somePath.toString()
				return proxyCallback.toString();
			}

			if (lastParts[0] === "valueOf") {
				if (lastParts[1] === "name")
					// e.g. hc().somePath.name.valueOf() -> "somePath"
					return lastParts[2] ?? "";

				// e.g. hc().somePath.valueOf()
				return proxyCallback;
			}

			let method = "";
			if (/^\$/.test(lastParts[0] as string)) {
				const last = parts.pop();
				if (last) method = last.replace(/^\$/, "");
			}

			const {
				input,
				clientOpts,
			}: { input: Partial<ValidationTargets>; clientOpts: FetchOptions } =
				isInputOpts(opts.args[0])
					? {
							input: opts.args[0] ?? ({} as any),
							clientOpts: opts.args[1] ?? ({} as any),
						}
					: { input: {} as any, clientOpts: opts.args[0] ?? ({} as any) };
			const path = `/${parts.join("/")}`;
			const url = mergePath(options.baseURL, path);
			clientOpts.headers = mergeHeaders(
				options?.createFetchOptions?.headers,
				clientOpts.fetchOptions?.headers,
				clientOpts.headers,
			);

			if (method === "url") {
				let result = url;

				if (input.param) result = replaceUrlParam(url, input.param);

				if (input.query) {
					const sp = buildSearchParams(input.query);
					if (sp.size > 0) result += "?" + sp.toString();
				}

				result = removeIndexString(result);
				return new URL(result);
			}
			if (method === "ws") {
				const webSocketUrl = replaceUrlProtocol(
					input.param ? replaceUrlParam(url, input.param) : url,
					"ws",
				);
				const targetUrl = new URL(webSocketUrl);

				const queryParams: Record<string, string | string[]> | undefined =
					input.query;
				if (queryParams) {
					Object.entries(queryParams).forEach(([key, value]) => {
						if (Array.isArray(value))
							value.forEach((item) => targetUrl.searchParams.append(key, item));
						else targetUrl.searchParams.set(key, value);
					});
				}
				const establishWebSocket = (
					...args: ConstructorParameters<typeof WebSocket>
				) => {
					if (
						options?.webSocket !== undefined &&
						typeof options.webSocket === "function"
					)
						return options.webSocket(...args);

					return new WebSocket(...args);
				};

				return establishWebSocket(targetUrl.toString());
			}

			const req = new ClientRequestImpl(
				url,
				path,
				method,
				$fetch,
				atoms,
				atomListeners,
			);
			// if (method) {
			clientOpts.fetchOptions = defu(
				clientOpts.fetchOptions,
				options.createFetchOptions,
			);
			return req.fetch(input, clientOpts);
			// }
			// return req
		},
		[],
		routes,
	) as T extends Hono<any, infer S, infer B>
		? UnionToIntersection<Client<S, B, typeof options>>
		: never;
