import type { BetterFetchError } from "@better-fetch/fetch";
import type { BASE_ERROR_CODES } from "@faire-auth/core/error";
import type {
	AnyHono,
	Prettify,
	UnionToIntersection,
} from "@faire-auth/core/types";
// Inlined to avoid pulling Node-only modules into the browser client bundle.
const capitalizeFirstLetter = <T extends string>(str: T): Capitalize<T> =>
	(str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>;
import type { Hono } from "hono";
import type { DeepReadonly, Ref } from "vue";
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
} from "../types";
import { useStore } from "./vue-store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
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
								: never]: () => DeepReadonly<
							Ref<ReturnType<Atoms[key]["get"]>>
						>;
					}
				: {}
			: {}
		: {}
	: {};

export const createAuthClient =
	<App extends AnyHono = DefaultApp>() =>
	<Option extends ClientOptions>(options: Option) => {
		const baseURL = getBaseURL(options.baseURL, options.basePath)!;
		const { pluginsActions, pluginsAtoms, $fetch, $store, atomListeners } =
			getClientConfig(options);
		let resolvedHooks: Record<string, any> = {};
		for (const [key, value] of Object.entries(pluginsAtoms)) {
			resolvedHooks[getAtomKey(key)] = () => useStore(value);
		}

		type ClientAPI = App extends Hono<any, infer S, infer P>
			? Client<S, P, Option>
			: never;
		type Session = App extends Hono<any, infer S, infer P>
			? (S[`${P}/get-session`]["$get"]["output"] & { success: true })["data"]
			: never;
		function useSession(): DeepReadonly<
			Ref<{
				data: Session;
				isPending: boolean;
				isRefetching: boolean;
				error: BetterFetchError | null;
			}>
		>;
		function useSession<F extends (...args: any) => any>(
			useFetch: F,
		): Promise<{
			data: Ref<Session>;
			isPending: false; //this is just to be consistent with the default hook
			error: Ref<{
				message?: string;
				status: number;
				statusText: string;
			}>;
		}>;
		function useSession<UseFetch extends <T>(...args: any) => any>(
			useFetch?: UseFetch,
		) {
			if (useFetch) {
				const ref = useStore(pluginsAtoms.$sessionSignal);
				return useFetch(`${baseURL}/get-session`, {
					ref,
				}).then((res: any) => {
					return {
						data: res.data,
						isPending: false,
						error: res.error,
					};
				});
			}
			return resolvedHooks.useSession();
		}

		const routes = {
			...pluginsActions,
			...resolvedHooks,
			useSession,
			$fetch,
			$store,
		};

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
				useSession: typeof useSession;
				$Infer: { Session: NonNullable<Session> };
				$fetch: typeof $fetch;
				$store: typeof $store;
				$ERROR_CODES: Prettify<
					InferErrorCodes<Option> & typeof BASE_ERROR_CODES
				>;
			};
	};

export type * from "@better-fetch/fetch";
export type * from "nanostores";
