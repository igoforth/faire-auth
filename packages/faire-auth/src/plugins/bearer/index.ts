import { createHMAC } from "@faire-auth/core/datatypes";
import { createHook } from "../../api/factory/middleware";
import type { FaireAuthPlugin } from "../../types/plugin";
import {
	parseSetCookieHeader,
	serializeSignedCookie,
} from "../../utils/cookies";

interface BearerOptions {
	/**
	 * If true, only signed tokens
	 * will be converted to session
	 * cookies
	 *
	 * @default false
	 */
	requireSignature?: boolean;
}

/**
 * Converts bearer token to session cookie
 */
export const bearer = (options?: BearerOptions) =>
	({
		id: "bearer",
		hooks: {
			before: [
				{
					matcher: (ctx) => Boolean(ctx.req.header("Authorization")),
					handler: (_opts) =>
						createHook()(async (ctx) => {
							const token = ctx.req
								.header("Authorization")
								?.replace("Bearer ", "");
							if (token == null) return;

							let signedToken = "";
							if (token.includes(".")) {
								signedToken = token.replace("=", "");
							} else {
								if (options?.requireSignature === true) return;
								signedToken = (
									await serializeSignedCookie(
										"",
										token,
										ctx.get("context").secret,
									)
								).replace("=", "");
							}

							try {
								const decodedToken = decodeURIComponent(signedToken);
								const [first, second] = decodedToken.split(".");
								if (first == null || second == null) return;
								const isValid = await createHMAC(
									"SHA-256",
									"base64urlnopad",
								).verify(ctx.get("context").secret, first, second);
								if (!isValid) return;
							} catch {
								return;
							}

							ctx.req.raw.headers.append(
								"cookie",
								`${ctx.get("context").authCookies.sessionToken.name}=${signedToken}`,
							);
							// setCookie(
							//   ctx,
							//   ctx.get("context").authCookies.sessionToken.name,
							//   signedToken,
							// )
						}),
				},
			],
			after: [
				{
					matcher: (_ctx) => true,
					handler: (_opts) =>
						createHook()(async (ctx) => {
							const setCookie = ctx.res.headers.getSetCookie();
							if (!setCookie.length) return;

							const parsedCookies = parseSetCookieHeader(setCookie);
							const cookieName =
								ctx.get("context").authCookies.sessionToken.name;
							const sessionCookie = parsedCookies.get(cookieName);
							if (
								sessionCookie?.value == null ||
								sessionCookie["max-age"] === 0
							)
								return;

							const token = sessionCookie.value;
							const exposedHeaders =
								ctx.res.headers.get("access-control-expose-headers") ?? "";
							const headersSet = new Set(
								exposedHeaders
									.split(",")
									.map((header) => header.trim())
									.filter(Boolean),
							);
							headersSet.add("set-auth-token");
							ctx.res.headers.set("set-auth-token", token);
							ctx.res.headers.set(
								"Access-Control-Expose-Headers",
								Array.from(headersSet).join(", "),
							);
						}),
				},
			],
		},
	}) satisfies FaireAuthPlugin;
