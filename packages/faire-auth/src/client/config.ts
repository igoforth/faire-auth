import { createFetch, type CreateFetchOption } from "@better-fetch/fetch";
import type { LiteralStringUnion } from "@faire-auth/core/types";
import type { WritableAtom } from "nanostores";
import { getBaseURL } from "../utils/url";
import { redirectPlugin } from "./fetch-plugins";
import { parseJSON } from "./parser";
import { lifecycle } from "./plugins/lifecycle";
import { getSessionAtom } from "./session-atom";
import type { AtomListener, ClientOptions } from "./types";

export const getClientConfig = (options?: ClientOptions) => {
	const baseURL = () =>
		getBaseURL(options?.baseURL, options?.basePath) ?? "/api/auth";
	const plugins = options?.plugins ?? [];
	const pluginsFetchPlugins = plugins
		.flatMap((plugin) => plugin.fetchPlugins)
		.filter((pl) => pl !== undefined);
	const {
		onSuccess: _,
		onError: __,
		onRequest: ___,
		onResponse: ____,
		...restOfFetchOptions
	} = options?.fetchOptions ?? {};
	const fetchOptions = {
		get baseURL() {
			return baseURL();
		},
		/* check if the credentials property is supported. Useful for cf workers */
		...("credentials" in Request.prototype && { credentials: "include" }),
		method: "GET",
		jsonParser(text) {
			if (!text) return null as any;
			return parseJSON(text, { strict: false });
		},
		customFetchImpl: fetch as any,
		...restOfFetchOptions,
		plugins: [
			lifecycle(options),
			...(restOfFetchOptions.plugins ?? []),
			...(options?.disableDefaultFetchPlugins ? [] : [redirectPlugin]),
			...pluginsFetchPlugins,
		],
	} satisfies CreateFetchOption;

	const $fetch = createFetch(fetchOptions);
	const sessionAtom = getSessionAtom($fetch);
	const pluginsActions: Record<string, any> = {};
	const pluginsAtoms: ReturnType<typeof getSessionAtom> &
		Record<string, WritableAtom<any>> = sessionAtom;
	const pluginPathMethods: Record<string, "POST" | "GET"> = {
		"/sign-out": "POST",
		"/revoke-sessions": "POST",
		"/revoke-other-sessions": "POST",
		"/delete-user": "POST",
	};
	const atomListeners: AtomListener[] = [
		{
			signal: "$sessionSignal",
			matcher(path) {
				return (
					path === "/sign-out" ||
					path === "/update-user" ||
					path.startsWith("/sign-in") ||
					path.startsWith("/sign-up") ||
					path === "/delete-user" ||
					path === "/verify-email"
				);
			},
		},
	];

	for (const plugin of plugins) {
		if (plugin.getAtoms) Object.assign(pluginsAtoms, plugin.getAtoms?.($fetch));
		if (plugin.pathMethods)
			Object.assign(pluginPathMethods, plugin.pathMethods);
		if (plugin.atomListeners) atomListeners.push(...plugin.atomListeners);
	}

	const $store = {
		notify: (signal?: LiteralStringUnion<"$sessionSignal">) => {
			if (signal) pluginsAtoms[signal]!.set(!pluginsAtoms[signal]!.get());
		},
		listen: (
			signal: LiteralStringUnion<"$sessionSignal">,
			listener: (value: boolean, oldValue?: boolean | undefined) => void,
		) => {
			pluginsAtoms[signal]!.subscribe(listener);
		},
		atoms: pluginsAtoms,
	};

	for (const plugin of plugins)
		if (plugin.getActions)
			Object.assign(
				pluginsActions,
				plugin.getActions?.($fetch, $store, options),
			);

	return {
		get baseURL() {
			return baseURL();
		},
		pluginsActions,
		pluginsAtoms,
		pluginPathMethods,
		atomListeners,
		$fetch,
		$store,
	};
};
