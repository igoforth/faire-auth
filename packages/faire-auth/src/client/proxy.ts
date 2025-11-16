import type { BetterFetch, BetterFetchOption } from "@better-fetch/fetch";
import type { Atom, PreinitializedWritableAtom } from "nanostores";
import type { ProxyRequest } from "./path-to-object";
import type { FaireAuthClientPlugin } from "./types";

const getMethod = (
	path: string,
	knownPathMethods: Record<string, "GET" | "POST">,
	args:
		| { fetchOptions?: BetterFetchOption; query?: Record<string, any> }
		| undefined,
) => {
	const method = knownPathMethods[path];
	const { fetchOptions, query: _query, ...body } = args ?? {};
	if (method) return method;
	if (fetchOptions?.method != null) return fetchOptions.method;
	if (body != null && Object.keys(body).length > 0) return "POST";
	return "GET";
};

export interface AuthProxySignal {
	atom: PreinitializedWritableAtom<boolean>;
	matcher: (path: string) => boolean;
}

export const createDynamicPathProxy = <T extends Record<string, any>>(
	routes: T,
	client: BetterFetch,
	knownPathMethods: Record<string, "GET" | "POST">,
	atoms: Record<string, Atom>,
	atomListeners: FaireAuthClientPlugin["atomListeners"],
): T => {
	const createProxy = (path: string[] = []): any =>
		new Proxy(() => {}, {
			get: (_target, prop: string) => {
				const fullPath = [...path, prop];
				let current: any = routes;
				for (const segment of fullPath) {
					if (
						current != null &&
						typeof current === "object" &&
						segment in current
					)
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
						current = current[segment];
					else {
						current = undefined;
						break;
					}
				}
				if (typeof current === "function") return current;

				return createProxy(fullPath);
			},
			apply: async (_, __, args) => {
				const routePath = `/${path
					.map((segment) =>
						segment.replaceAll(
							/[A-Z]/g,
							(letter) => `-${letter.toLowerCase()}`,
						),
					)
					.join("/")}`;
				const arg = (args[0] ?? {}) as ProxyRequest;
				const fetchOptions = (args[1] ?? {}) as BetterFetchOption;
				const { query, fetchOptions: argFetchOptions, ...body } = arg;
				const options = {
					...fetchOptions,
					...argFetchOptions,
				} as BetterFetchOption;
				const method = getMethod(routePath, knownPathMethods, arg);

				return client(routePath, {
					...options,
					body:
						method === "GET" ? undefined : { ...body, ...(options.body ?? {}) },
					query: query ?? options.query,
					method,
					onSuccess: async (context) => {
						await options.onSuccess?.(context);
						/**
						 * We trigger listeners
						 */
						const matches = atomListeners?.find((s) => s.matcher(routePath));
						if (!matches) return;
						const signal = atoms[matches.signal as any];
						if (!signal) return;
						/**
						 * To avoid race conditions we set the signal in a setTimeout
						 */
						const val = signal.get();
						// @ts-expect-error a description
						// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-call
						setTimeout(() => signal.set(!val), 10);
					},
				});
			},
		});
	return createProxy() as T;
};
