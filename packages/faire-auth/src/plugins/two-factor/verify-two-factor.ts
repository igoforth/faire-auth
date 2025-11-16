import { createHMAC } from "@faire-auth/core/datatypes";
import type { Session, User } from "@faire-auth/core/db";
import { False, True } from "@faire-auth/core/static";
import type { Context } from "hono";
import { getSessionFromCtx } from "../../api/routes/session";
import type { ContextVars } from "../../types/hono";
import type { FaireAuthOptions } from "../../types/options";
import {
	deleteCookie,
	getSignedCookie,
	setSessionCookie,
	setSignedCookie,
} from "../../utils/cookies";
import { TRUST_DEVICE_COOKIE_NAME, TWO_FACTOR_COOKIE_NAME } from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";

export async function verifyTwoFactor<V extends object>(
	ctx: Context<ContextVars>,
	options: Pick<FaireAuthOptions, "secondaryStorage" | "session">,
) {
	const invalid = (errorKey: keyof typeof TWO_FACTOR_ERROR_CODES) =>
		ctx.render(
			{ success: False, message: TWO_FACTOR_ERROR_CODES[errorKey] },
			401,
		);

	const session = await getSessionFromCtx<User & V, Session>(ctx);
	const context = ctx.get("context");
	if (session instanceof Response) {
		const cookieName = context.createAuthCookie(TWO_FACTOR_COOKIE_NAME);
		const twoFactorCookie = await getSignedCookie(
			ctx,
			context.secret,
			cookieName.name,
		);
		if (!twoFactorCookie)
			return ctx.render(
				{
					success: False,
					message: TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
				},
				401,
			);

		const verificationToken =
			await context.internalAdapter.findVerificationValue(twoFactorCookie);
		if (!verificationToken)
			return ctx.render(
				{
					success: False,
					message: TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
				},
				401,
			);

		const user = (await context.internalAdapter.findUserById(
			verificationToken.value,
		)) as User & V;
		if (!user)
			return ctx.render(
				{
					success: False,
					message: TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
				},
				401,
			);

		const dontRememberMe = await getSignedCookie(
			ctx,
			context.secret,
			context.authCookies.dontRememberToken.name,
		);
		return {
			valid: async (
				ctx: Context<
					ContextVars,
					string,
					{ out: { json: { trustDevice?: boolean } } }
				>,
			) => {
				const session = await context.internalAdapter.createSession(
					verificationToken.value,
					!!dontRememberMe,
				);
				if (!session) {
					return ctx.render(
						{ success: False, message: "Failed to create session" },
						500,
					);
				}
				await setSessionCookie(ctx, options, { session, user });
				if (ctx.req.valid("json").trustDevice === true) {
					const trustDeviceCookie = context.createAuthCookie(
						TRUST_DEVICE_COOKIE_NAME,
						{
							maxAge: 30 * 24 * 60 * 60, // 30 days, it'll be refreshed on sign in requests
						},
					);
					/**
					 * create a token that will be used to
					 * verify the device
					 */
					const token = await createHMAC("SHA-256", "base64urlnopad").sign(
						context.secret,
						`${user.id}!${session.token}`,
					);
					await setSignedCookie(
						ctx,
						trustDeviceCookie.name,
						`${token}!${session.token}`,
						context.secret,
						trustDeviceCookie.attributes,
					);
					// delete the dont remember me cookie
					deleteCookie(
						ctx,
						context.authCookies.dontRememberToken.name,
						context.authCookies.dontRememberToken.options,
					);
					// delete the two factor cookie
					deleteCookie(ctx, cookieName.name, cookieName.attributes);
				}
				return ctx.render(
					{
						success: True,
						token: session.token,
						user: {
							id: user.id,
							email: user.email,
							emailVerified: user.emailVerified,
							name: user.name,
							image: user.image,
							createdAt: user.createdAt,
							updatedAt: user.updatedAt,
						},
					},
					200,
				);
			},
			invalid,
			session: { session: null, user },
			key: twoFactorCookie,
		};
	}
	return {
		valid: (ctx: Context<ContextVars>) =>
			ctx.render(
				{
					success: True,
					token: session.session.token,
					user: {
						id: session.user.id,
						email: session.user.email,
						emailVerified: session.user.emailVerified,
						name: session.user.name,
						image: session.user.image,
						createdAt: session.user.createdAt,
						updatedAt: session.user.updatedAt,
					},
				},
				200,
			),
		invalid,
		session,
		key: `${session.user.id}!${session.session.id}`,
	};
}
