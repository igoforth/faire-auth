import type { BetterFetchError } from "@better-fetch/fetch";
import type { BASE_ERROR_CODES } from "@faire-auth/core/error";
import type {
	AnyHono,
	Prettify,
	UnionToIntersection,
} from "@faire-auth/core/types";
import type { Hono } from "hono";
import type { DefaultApp } from "../../api/types";
import { getBaseURL } from "../../utils/url";
import { getClientConfig } from "../config";
import { createHonoClient } from "../hono";
import type {
	Client,
	ClientOptions,
	FaireAuthClientPlugin,
	InferActions,
	InferErrorCodes,
	IsSignal,
	SessionQueryParams,
} from "../types";
import { useStore } from "./lynx-store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

type InferResolvedHooks<O extends ClientOptions> = O["plugins"] extends Array<
	infer Plugin
>
	? Plugin extends FaireAuthClientPlugin
		? Plugin["getAtoms"] extends (fetch: any) => infer Atoms
			? Atoms extends Record<string, any>
				? {
						[key in keyof Atoms as IsSignal<key> extends true
							? never
							: key extends string
								? `use${Capitalize<key>}`
								: never]: () => ReturnType<Atoms[key]["get"]>;
					}
				: {}
			: {}
		: {}
	: {};

export const createAuthClient =
	<App extends AnyHono = DefaultApp>() =>
	<Option extends ClientOptions>(options: Option) => {
		const baseURL = getBaseURL(options.baseURL, options.basePath)!;
		const {
			pluginPathMethods,
			pluginsActions,
			pluginsAtoms,
			$fetch,
			$store,
			atomListeners,
		} = getClientConfig(options);
		let resolvedHooks: Record<string, any> = {};
		for (const [key, value] of Object.entries(pluginsAtoms)) {
			resolvedHooks[getAtomKey(key)] = () => useStore(value);
		}

		const routes = {
			...pluginsActions,
			...resolvedHooks,
			$fetch,
			$store,
		};

		type ClientAPI = App extends Hono<any, infer S, infer P>
			? Client<S, P, Option>
			: never;
		type Session = App extends Hono<any, infer S, infer P>
			? (S[`${P}/get-session`]["$get"]["output"] & { success: true })["data"]
			: never;

		const honoClient = createHonoClient(
			{ baseURL, createFetchOptions: options.fetchOptions },
			routes,
			$fetch,
			pluginsAtoms,
			atomListeners,
		);

		return honoClient as UnionToIntersection<InferResolvedHooks<Option>> &
			ClientAPI &
			InferActions<Option> & {
				useSession: () => {
					data: Session;
					isPending: boolean;
					error: BetterFetchError | null;
					refetch: (queryParams?: { query?: SessionQueryParams }) => void;
				};
				$Infer: {
					Session: NonNullable<Session>;
				};
				$fetch: typeof $fetch;
				$store: typeof $store;
				$ERROR_CODES: Prettify<
					InferErrorCodes<Option> & typeof BASE_ERROR_CODES
				>;
			};
	};

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export { useStore };
