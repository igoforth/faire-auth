import type { BetterFetchError } from "@better-fetch/fetch";
import type { BASE_ERROR_CODES } from "@faire-auth/core/error";
import type {
	AnyHono,
	Prettify,
	UnionToIntersection,
} from "@faire-auth/core/types";
import { capitalizeFirstLetter } from "@faire-auth/core/utils";
import type { Hono } from "hono";
import type { Accessor } from "solid-js";
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
import { useStore } from "./solid-store";

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
								: never]: () => Accessor<ReturnType<Atoms[key]["get"]>>;
					}
				: {}
			: {}
		: {}
	: {};

export const createAuthClient =
	<App extends AnyHono = DefaultApp>() =>
	<Option extends ClientOptions>(options: Option) => {
		const baseURL = getBaseURL(options.baseURL, options.basePath)!;
		const { pluginsActions, pluginsAtoms, $fetch, atomListeners } =
			getClientConfig(options);
		const resolvedHooks: Record<string, any> = {};
		for (const [key, value] of Object.entries(pluginsAtoms)) {
			resolvedHooks[getAtomKey(key)] = () => useStore(value);
		}
		const routes = { ...pluginsActions, ...resolvedHooks };

		routes.useSession = () => useStore(pluginsAtoms.session!);

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
				useSession: () => Accessor<{
					data: Session;
					isPending: boolean;
					isRefetching: boolean;
					error: BetterFetchError | null;
				}>;
				$Infer: { Session: NonNullable<Session> };
				$fetch: typeof $fetch;
				$ERROR_CODES: Prettify<
					InferErrorCodes<Option> & typeof BASE_ERROR_CODES
				>;
			};
	};

export type * from "@better-fetch/fetch";
export type * from "nanostores";
