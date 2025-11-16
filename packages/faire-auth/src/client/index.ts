import type { FaireAuthPlugin } from "../types/plugin";
import type { FaireAuthOptions } from "../types/options";
import type { FaireAuthClientPlugin } from "./types";
export * from "./vanilla";
export * from "./query";
export type { FetchOptions } from "./hono";
export type * from "./types";

export const InferPlugin = <T extends FaireAuthPlugin>() =>
	({
		id: "infer-server-plugin",
		$InferServerPlugin: {} as T,
	}) satisfies FaireAuthClientPlugin;

export function InferAuth<O extends { options: FaireAuthOptions }>() {
	return {} as O["options"];
}

//@ts-expect-error
export type * from "nanostores";
export type { SocialProvider } from "../social-providers";
export type * from "@better-fetch/fetch";
