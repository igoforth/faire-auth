import { createHook } from "../api/factory/middleware";
import type { FaireAuthPlugin } from "../types/plugin";
import { parseSetCookieHeader } from "../utils/cookies";

export const reactStartCookies = () => {
	return {
		id: "react-start-cookies",
		hooks: {
			after: [
				{
					matcher: (_ctx) => true,
					handler: (_authOptions) =>
						createHook()(async (ctx) => {
							// TODO: needed?
							// if ('_flag' in ctx && ctx._flag === 'router') return next()

							const setCookies = ctx.res.headers.getSetCookie();
							if (!setCookies.length) return;
							const parsed = parseSetCookieHeader(setCookies);
							const { setCookie } = await import("@tanstack/start-server-core");
							parsed.forEach((value, key) => {
								if (!key) return;
								const opts = {
									sameSite: value.samesite,
									secure: value.secure,
									maxAge: value["max-age"],
									httpOnly: value.httponly,
									domain: value.domain,
									path: value.path,
								} as const;
								try {
									setCookie(key, decodeURIComponent(value.value), opts);
								} catch (e) {
									// this will fail if the cookie is being set on server component
								}
							});
							return;
						}),
				},
			],
		},
	} satisfies FaireAuthPlugin;
};
