import type { BetterFetchPlugin } from "@better-fetch/fetch";
import type { ClientOptions } from "../types";

export const lifecycle = <C extends ClientOptions>(options?: C) =>
	({
		id: "lifecycle-hooks",
		name: "lifecycle-hooks",
		hooks: {
			...(options?.fetchOptions?.onSuccess && {
				onSuccess: options?.fetchOptions?.onSuccess,
			}),
			...(options?.fetchOptions?.onError && {
				onError: options.fetchOptions.onError,
			}),
			...(options?.fetchOptions?.onRequest && {
				onRequest: options.fetchOptions.onRequest,
			}),
			...(options?.fetchOptions?.onResponse && {
				onResponse: options.fetchOptions.onResponse,
			}),
		} as C extends { fetchOptions: { hooks: infer H } } ? H : {},
	}) satisfies BetterFetchPlugin;
