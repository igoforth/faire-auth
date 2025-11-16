import type { BetterFetch } from "@better-fetch/fetch";
import type { Session, User } from "@faire-auth/core/db";
import { atom, onMount } from "nanostores";
import type { ClientOptions } from "../types";
import { useAuthQuery } from "./query";
import { createSessionRefreshManager } from "./session-refresh";

export const getSessionAtom = (
	$fetch: BetterFetch,
	options?: ClientOptions | undefined,
) => {
	const $signal = atom<boolean>(false);
	const session = useAuthQuery<{ user: User; session: Session }>(
		$signal,
		"/get-session",
		$fetch,
		{ method: "GET" },
	);

	if (typeof window !== "undefined") {
		onMount(session, () => {
			const refreshManager = createSessionRefreshManager({
				sessionAtom: session,
				sessionSignal: $signal,
				$fetch,
				options,
			});

			refreshManager.init();

			return () => {
				refreshManager.cleanup();
			};
		});
	}

	return { session, $sessionSignal: $signal };
};
