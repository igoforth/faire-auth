import type { FaireAuthClientPlugin } from "../types";
import type { FaireAuthOptions } from "../../types/options";

export const InferServerPlugin = <
	AuthOrOption extends
		| {
				options: FaireAuthOptions;
		  }
		| FaireAuthOptions,
	ID extends string,
>() => {
	type Option = AuthOrOption extends { options: infer O } ? O : AuthOrOption;
	type Plugin = Option["plugins"] extends (infer P)[]
		? P extends {
				id: ID;
			}
			? P
			: never
		: never;
	return {
		id: "infer-server-plugin",
		$InferServerPlugin: {} as Plugin,
	} satisfies FaireAuthClientPlugin;
};
