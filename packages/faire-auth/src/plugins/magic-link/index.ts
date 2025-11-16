import { APIError, BASE_ERROR_CODES } from "@faire-auth/core/error";
import {
	callbackURLSchema,
	createRoute,
	emailSchema,
	nameSchema,
	req,
	res,
} from "@faire-auth/core/factory";
import { Definitions, SCHEMAS, True } from "@faire-auth/core/static";
import type { HonoRequest } from "hono/request";
import * as z from "zod";
import { createEndpoint } from "../../api/factory/endpoint";
import { originCheck } from "../../api/middleware/origin-check";
import { generateRandomString } from "../../crypto";
import type { FaireAuthPlugin } from "../../types";
import { setSessionCookie } from "../../utils/cookies";

interface MagicLinkOptions {
	/**
	 * Time in seconds until the magic link expires.
	 * @default (60 * 5) // 5 minutes
	 */
	expiresIn?: number;
	/**
	 * Send magic link implementation.
	 */
	sendMagicLink: (
		data: { email: string; url: string; token: string },
		request?: HonoRequest,
	) => Promise<void> | void;
	/**
	 * Public site url
	 */
	siteUrl: string;
	/**
	 * Disable sign up if user is not found.
	 *
	 * @default false
	 */
	disableSignUp?: boolean;
	/**
	 * Rate limit configuration.
	 *
	 * @default {
	 *  window: 60,
	 *  max: 5,
	 * }
	 */
	rateLimit?: { window: number; max: number };
	/**
	 * Custom function to generate a token
	 */
	generateToken?: (email: string) => Promise<string> | string;
}

export const magicLink = (options: MagicLinkOptions) =>
	({
		id: "magic-link",
		routes: {
			signInMagicLink: createEndpoint(
				createRoute({
					operationId: "signInMagicLink",
					method: "post",
					path: "/sign-in/magic-link",
					description: "Sign in with magic link",
					request: req()
						.bdy(
							z.object({
								email: emailSchema.openapi({
									description: "Email address to send the magic link",
								}),
								name: nameSchema,
								callbackURL: callbackURLSchema(true).openapi({
									description: "URL to redirect after magic link verification",
								}),
							}),
						)
						.bld(),
					responses: res(SCHEMAS[Definitions.SUCCESS].default).bld(),
				}),
				(_authOptions) => async (ctx) => {
					const { email, name, callbackURL } = ctx.req.valid("json");

					if (options.disableSignUp === true) {
						const user = await ctx
							.get("context")
							.internalAdapter.findUserByEmail(email);

						if (!user)
							throw new APIError("BAD_REQUEST", {
								message: BASE_ERROR_CODES.USER_NOT_FOUND,
							});
					}

					const verificationToken = options.generateToken
						? await options.generateToken(email)
						: generateRandomString(32, "a-z", "A-Z");
					await ctx.get("context").internalAdapter.createVerificationValue({
						identifier: verificationToken,
						value: JSON.stringify({ email, name }),
						expiresAt: new Date(
							Date.now() + (options.expiresIn ?? 60 * 5) * 1000,
						),
					});

					const url = `${
						ctx.get("context").baseURL
					}/magic-link/verify?token=${verificationToken}${
						callbackURL ? `&callbackURL=${encodeURIComponent(callbackURL)}` : ""
					}`;
					await options.sendMagicLink(
						{ email, url, token: verificationToken },
						ctx.req,
					);

					return ctx.render({ success: True }, 200);
				},
			),
			verifyMagicLink: createEndpoint(
				createRoute({
					operationId: "verifyMagicLink",
					method: "get",
					path: "/magic-link/verify",
					description: "Verify magic link",
					middleware: [originCheck((ctx) => ctx.req.query("callbackURL")!)],
					request: req()
						.qry(
							z.object({
								token: z.string().openapi({
									param: { in: "query", name: "token" },
									description: "Verification token",
								}),
								callbackURL: callbackURLSchema(true).openapi({
									param: { in: "query", name: "callbackURL" },
									description:
										"URL to redirect after magic link verification, if not provided will return session",
								}),
							}),
						)
						.bld(),
					responses: res(SCHEMAS[Definitions.SESSION_USER].default)
						.rdr("Redirect if provided callbackURL")
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const { token, callbackURL } = ctx.req.valid("query");

					const toRedirectTo =
						callbackURL?.startsWith("http") === true
							? `${authOptions.baseURL}${callbackURL}`
							: authOptions.baseURL;
					const tokenValue = await ctx
						.get("context")
						.internalAdapter.findVerificationValue(token);
					if (!tokenValue)
						return ctx.redirect(`${toRedirectTo}?error=INVALID_TOKEN`, 302);

					if (tokenValue.expiresAt < new Date()) {
						await ctx
							.get("context")
							.internalAdapter.deleteVerificationValue(tokenValue.id);
						return ctx.redirect(`${toRedirectTo}?error=EXPIRED_TOKEN`, 302);
					}

					await ctx
						.get("context")
						.internalAdapter.deleteVerificationValue(tokenValue.id);
					const { email, name } = JSON.parse(tokenValue.value) as {
						email: string;
						name?: string;
					};
					let user = await ctx
						.get("context")
						.internalAdapter.findUserByEmail(email)
						.then((res) => res?.user);

					if (!user) {
						if (!(options.disableSignUp ?? false)) {
							const newUser = await ctx
								.get("context")
								.internalAdapter.createUser({
									email,
									emailVerified: true,
									...(name != null && { name }),
								});
							user = newUser;
							if (user == null)
								return ctx.redirect(
									`${toRedirectTo}?error=failed_to_create_user`,
									302,
								);
						} else
							return ctx.redirect(
								`${toRedirectTo}?error=failed_to_create_user`,
								302,
							);
					}

					if (!user.emailVerified) {
						await ctx
							.get("context")
							.internalAdapter.updateUser(user.id, { emailVerified: true });
					}

					const session = await ctx
						.get("context")
						.internalAdapter.createSession(user.id);

					if (session == null)
						return ctx.redirect(
							`${toRedirectTo}?error=failed_to_create_session`,
							302,
						);

					await setSessionCookie(ctx, authOptions, { session, user });
					if (callbackURL == null) {
						return ctx.render(
							{
								// TODO: Mirror anonymous session return?
								// session: {
								//   id: session.id,
								//   token: session.token,
								// },

								session,
								user,
							},
							200,
						);
					}
					return ctx.redirect(callbackURL, 302);
				},
			),
		},
		rateLimit: [
			{
				pathMatcher: (path) =>
					path.startsWith("/sign-in/magic-link") ||
					path.startsWith("/magic-link/verify"),
				window: options.rateLimit?.window ?? 60,
				max: options.rateLimit?.max ?? 5,
			},
		],
	}) satisfies FaireAuthPlugin;
