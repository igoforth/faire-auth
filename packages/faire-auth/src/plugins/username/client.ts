import type { username } from "./index";
import type { FaireAuthClientPlugin } from "../../client/types";

export const usernameClient = () => {
	return {
		id: "username",
		$InferServerPlugin: {} as ReturnType<typeof username>,
	} satisfies FaireAuthClientPlugin;
};
