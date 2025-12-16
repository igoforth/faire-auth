import type {
	BetterFetch,
	BetterFetchError,
	BetterFetchOption,
} from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import { atom, onMount } from "nanostores";

// SSR detection
const isServer = typeof window === "undefined";

export const useAuthQuery = <T>(
	initializedAtom:
		| PreinitializedWritableAtom<any>
		| PreinitializedWritableAtom<any>[],
	path: string,
	$fetch: BetterFetch,
	options?:
		| ((value: {
				data: null | T;
				error: BetterFetchError | null;
				isPending: boolean;
		  }) => BetterFetchOption)
		| BetterFetchOption,
) => {
	const value = atom<{
		data: null | T;
		error: BetterFetchError | null;
		isPending: boolean;
		isRefetching: boolean;
		refetch: () => void;
	}>({
		data: null,
		error: null,
		isPending: true,
		isRefetching: false,
		refetch: async () => fn(),
	});

	const fn = async () => {
		const opts =
			typeof options === "function"
				? options({
						data: value.get().data,
						error: value.get().error,
						isPending: value.get().isPending,
					})
				: options;

		return $fetch<T>(path, {
			...opts,
			onSuccess: async (context) => {
				value.set({
					data: context.data,
					error: null,
					isPending: false,
					isRefetching: false,
					refetch: value.value.refetch,
				});
				await opts?.onSuccess?.(context);
			},
			onError: async (context) => {
				const { request } = context;
				const retryAttempts =
					typeof request.retry === "number"
						? request.retry
						: request.retry?.attempts;
				const retryAttempt = request.retryAttempt ?? 0;
				if (retryAttempts != null && retryAttempt < retryAttempts) return;
				value.set({
					error: context.error,
					data: null,
					isPending: false,
					isRefetching: false,
					refetch: value.value.refetch,
				});
				await opts?.onError?.(context);
			},
			onRequest: async (context) => {
				const currentValue = value.get();
				value.set({
					isPending: currentValue.data === null,
					data: currentValue.data,
					error: null,
					isRefetching: true,
					refetch: value.value.refetch,
				});
				await opts?.onRequest?.(context);
			},
		});
	};
	initializedAtom = Array.isArray(initializedAtom)
		? initializedAtom
		: [initializedAtom];
	let isMounted = false;

	for (const initAtom of initializedAtom) {
		initAtom.subscribe(() => {
			if (isServer) {
				// On server, don't trigger fetch
				return;
			}
			if (isMounted) {
				void fn();
			} else {
				onMount(value, () => {
					setTimeout(() => {
						void fn();
					}, 0);
					isMounted = true;
					return () => {
						value.off();
						initAtom.off();
					};
				});
			}
		});
	}
	return value;
};
