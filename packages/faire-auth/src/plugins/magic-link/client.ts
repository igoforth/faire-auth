import type { FaireAuthClientPlugin } from "../../types";
import type { magicLink } from "./index";

export const magicLinkClient = () =>
	({
		id: "magic-link",
		$InferServerPlugin: {} as ReturnType<typeof magicLink>,
	}) satisfies FaireAuthClientPlugin;
