import { env } from "@faire-auth/core/env";
import {
	callbackURLSchema,
	createRoute,
	req,
	res,
} from "@faire-auth/core/factory";
import type { LiteralStringUnion } from "@faire-auth/core/types";
import type { Context } from "hono";
import * as z from "zod";
import { createEndpoint } from "../../api/factory/endpoint";
import { createHook } from "../../api/factory/middleware";
import { originCheck } from "../../api/middleware/origin-check";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import type { FaireAuthPlugin } from "../../types";
import type { ContextVars } from "../../types/hono";
import { getOrigin } from "../../utils/url";

interface OAuthProxyOptions {
	/**
	 * The current URL of the application.
	 * The plugin will attempt to infer the current URL from your environment
	 * by checking the base URL from popular hosting providers,
	 * from the request URL if invoked by a client,
	 * or as a fallback, from the `baseURL` in your auth config.
	 * If the URL is not inferred correctly, you can provide a value here."
	 */
	currentURL?: string;
	/**
	 * If a request in a production url it won't be proxied.
	 *
	 * default to `FAIRE_AUTH_URL`
	 */
	productionURL?: string;
}

/**
 * A proxy plugin, that allows you to proxy OAuth requests.
 * Useful for development and preview deployments where
 * the redirect URL can't be known in advance to add to the OAuth provider.
 */
export const oAuthProxy = (opts?: OAuthProxyOptions) => {
	const resolveCurrentURL = <V extends object>(
		ctx: Context<ContextVars<V>>,
	) => {
		return new URL(opts?.currentURL ?? ctx.req.url);
	};

	const shimCallbackURL = (
		input:
			| {
					target: LiteralStringUnion<"json">;
					success: true;
					data: Record<string, any> & { callbackURL?: string | undefined };
			  }
			| { success: false; error: z.ZodError<unknown> },
		ctx: Context<any, any, {}>,
	) => {
		// return if validation unsuccessful
		if (input.success === false) return;

		// if skip proxy header is set, we don't need to proxy
		const skipProxy = ctx.req.header("x-skip-oauth-proxy");
		if (skipProxy) return;

		// get baseURL, basePath from ctx
		const { origin: baseURL, pathname: basePath } = new URL(
			ctx.get("context").baseURL,
		);

		const url = resolveCurrentURL(ctx);
		const productionURL = opts?.productionURL ?? env["FAIRE_AUTH_URL"];
		console.log(productionURL, baseURL);
		if (productionURL === baseURL) return;

		// modify baseURL
		input.data.callbackURL = `${url.origin}${
			basePath
		}/oauth-proxy-callback?callbackURL=${encodeURIComponent(
			input.data.callbackURL ?? ctx.get("context")!.baseURL,
		)}`;
		return;
	};

	return {
		id: "oauth-proxy",
		routes: {
			oAuthProxy: createEndpoint(
				createRoute({
					operationId: "oAuthProxy",
					method: "get",
					path: "/oauth-proxy-callback",
					isAction: false,
					middleware: [originCheck((ctx) => ctx.req.query("callbackURL")!)],
					request: req()
						.qry(
							z.object({
								callbackURL: callbackURLSchema().openapi({
									description: "The URL to redirect to after the proxy",
								}),
								cookies: z.string().openapi({
									description: "The cookies to set after the proxy",
								}),
							}),
						)
						.bld(),
					responses: res().rdr().bld(),
				}),
				(options) => async (ctx) => {
					const { callbackURL, cookies } = ctx.req.valid("query");
					const context = ctx.get("context");

					const decryptedCookies = await symmetricDecrypt({
						key: context.secret,
						data: cookies,
					}).catch((e) => {
						context.logger.error(e);
						return null;
					});
					const errorURL =
						options.onAPIError?.errorURL ?? `${context.baseURL}/error`;
					if (!decryptedCookies)
						return ctx.redirect(
							`${errorURL}?error=${encodeURIComponent("OAuthProxy - Invalid cookies or secret")}`,
							302,
						);

					const isSecureContext = resolveCurrentURL(ctx).protocol === "https:";
					const prefix = options.advanced?.cookiePrefix || "faire-auth";
					const cookieToSet = isSecureContext
						? decryptedCookies
						: decryptedCookies
								.replace("Secure;", "")
								.replace(`__Secure-${prefix}`, prefix);
					ctx.header("Set-Cookie", cookieToSet, { append: true });
					return ctx.redirect(callbackURL, 302);
				},
			),
		},
		routeHooks: {
			signInSocial: shimCallbackURL,
			signInWithOAuth2: shimCallbackURL,
		},
		hooks: {
			after: [
				{
					matcher: (ctx) =>
						ctx.get("path").startsWith("/callback") ||
						ctx.get("path").startsWith("/oauth2/callback"),
					handler: (_opts) =>
						createHook()(async (ctx) => {
							const location = ctx.res.headers.get("location");
							console.log("hit location", location);
							if (location?.includes("/oauth-proxy-callback?callbackURL")) {
								if (!location.startsWith("http")) return;
								console.log("in location", location);

								const context = ctx.get("context");
								const locationURL = new URL(location);
								const origin = locationURL.origin;
								/**
								 * We don't want to redirect to the proxy URL if the origin is the same
								 * as the current URL
								 */
								if (origin === getOrigin(context.baseURL)) {
									const newLocation =
										locationURL.searchParams.get("callbackURL");
									if (!newLocation) return;

									ctx.header("Location", newLocation);
									return;
								}

								const setCookies = ctx.res.headers.get("set-cookie");
								if (!setCookies) return;

								const encryptedCookies = await symmetricEncrypt({
									key: context.secret,
									data: setCookies,
								});
								const locationWithCookies = `${location}&cookies=${encodeURIComponent(
									encryptedCookies,
								)}`;
								ctx.header("Location", locationWithCookies);
							}
						}),
				},
			],
		},
	} satisfies FaireAuthPlugin;
};
