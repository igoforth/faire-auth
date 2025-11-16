import type { FaireAuthClientPlugin } from "../../client/types";
import type { twoFactor } from "../../plugins/two-factor";

export const twoFactorClient = (options?: {
	/**
	 * a redirect function to call if a user needs to verify
	 * their two factor
	 */
	onTwoFactorRedirect?: () => void | Promise<void>;
}) => {
	return {
		id: "two-factor",
		$InferServerPlugin: {} as ReturnType<typeof twoFactor>,
		atomListeners: [
			{
				matcher: (path) => path.startsWith("/two-factor/"),
				signal: "$sessionSignal",
			},
		],
		pathMethods: {
			"/two-factor/disable": "POST",
			"/two-factor/enable": "POST",
			"/two-factor/send-otp": "POST",
			"/two-factor/generate-backup-codes": "POST",
		},
		fetchPlugins: [
			{
				id: "two-factor",
				name: "two-factor",
				hooks: {
					async onSuccess(context) {
						if (context.data?.twoFactorRedirect) {
							if (options?.onTwoFactorRedirect) {
								await options.onTwoFactorRedirect();
							}
						}
					},
				},
			},
		],
	} satisfies FaireAuthClientPlugin;
};
