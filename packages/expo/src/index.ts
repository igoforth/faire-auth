import type { FaireAuthPlugin } from "faire-auth/types";
import { createHook } from "faire-auth/plugins";

export interface ExpoOptions {
	/**
	 * Override origin header for expo API routes
	 */
	overrideOrigin?: boolean;
}

export const expo = (options?: ExpoOptions) => {
	return {
		id: "expo",
		init: (ctx) => {
			const trustedOrigins =
				process.env.NODE_ENV === "development" ? ["exp://"] : [];

			return {
				options: {
					trustedOrigins,
				},
			};
		},
		onRequest: (ctx) => {
			if (!options?.overrideOrigin || ctx.req.header("origin")) return;

			/**
			 * To bypass origin check from expo, we need to set the origin header to the expo-origin header
			 */
			const expoOrigin = ctx.req.header("expo-origin");
			if (!expoOrigin) return;

			ctx.req.raw.headers.set("origin", expoOrigin);
		},
		hooks: {
			after: [
				{
					matcher: (ctx) =>
						ctx.req.path.startsWith("/callback") ||
						ctx.req.path.startsWith("/oauth2/callback"),
					handler: (_authOptions) =>
						createHook()(async (ctx) => {
							const location = ctx.res.headers.get("location");
							if (!location) return;

							const isProxyURL = location.includes("/oauth-proxy-callback");
							if (isProxyURL) return;

							const trustedOrigins = [
								...ctx.get("context").trustedOrigins.values(),
							].filter((origin: string) => !origin.startsWith("http"));
							const isTrustedOrigin = trustedOrigins.some((origin: string) =>
								location?.startsWith(origin),
							);
							if (!isTrustedOrigin) return;

							const cookie = ctx.res.headers.get("set-cookie");
							if (!cookie) return;

							const url = new URL(location);
							url.searchParams.set("cookie", cookie);
							ctx.header("location", url.toString());
						}),
				},
			],
		},
	} satisfies FaireAuthPlugin;
};
