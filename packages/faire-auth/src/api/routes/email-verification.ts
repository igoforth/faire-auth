import type { User } from "@faire-auth/core/db";
import { createRoute, req, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import type { Context } from "hono";
import { signJWT } from "../../crypto";
import type { ContextVars } from "../../types/hono";
import type { FaireAuthOptions } from "../../types/options";
import { setSessionCookie } from "../../utils/cookies";
import { createEndpoint } from "../factory/endpoint";
import { originCheck } from "../middleware/origin-check";
import {
	sendVerificationEmailSchema,
	verifyEmailQuerySchema,
	verifyEmailTokenSchema,
} from "../schema/email-verification";
import { getSessionFromCtx } from "./session";
import { capitalizeFirstLetter } from "@faire-auth/core/utils";
import { tokenCheck } from "../middleware/token-check";

export const createEmailVerificationToken = async (
	secret: string,
	email: string,
	/**
	 * The email to update from
	 */
	updateTo?: string,
	/**
	 * The time in seconds for the token to expire
	 */
	expiresIn = 3600,
) => {
	const token = await signJWT(
		{ email: email.toLowerCase(), updateTo },
		secret,
		expiresIn,
	);
	return token;
};

/**
 * A function to send a verification email to the user
 */
export const sendVerificationEmailFn = async (
	ctx: Context<ContextVars, "/send-verification-email">,
	user: User,
	callbackURL = encodeURIComponent("/"),
	options?: Pick<FaireAuthOptions, "emailVerification">,
) => {
	const context = ctx.get("context");
	if (!options?.emailVerification?.sendVerificationEmail) {
		context.logger.error("Verification email isn't enabled.");
		return ctx.render(
			{ success: False, message: "Verification email isn't enabled" },
			400,
		);
	}
	const token = await createEmailVerificationToken(
		context.secret,
		user.email,
		undefined,
		options.emailVerification.expiresIn,
	);
	const url = `${context.baseURL}/verify-email?token=${token}&callbackURL=${
		callbackURL
	}`;
	await options.emailVerification.sendVerificationEmail(
		{ user, url, token },
		ctx,
	);

	return;
};

export const sendVerificationEmailRoute = createRoute({
	operationId: Routes.SEND_VERIFICATION_EMAIL,
	method: "post",
	path: "/send-verification-email",
	description: "Send a verification email to the user",
	request: req().bdy(sendVerificationEmailSchema).bld(),
	responses: res(SCHEMAS[Definitions.SUCCESS].default)
		.err(400)
		.zod<typeof sendVerificationEmailSchema>()
		.bld(),
});

export const sendVerificationEmail = createEndpoint(
	sendVerificationEmailRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		if (!options.emailVerification?.sendVerificationEmail) {
			context.logger.error("Verification email isn't enabled.");
			return ctx.render(
				{ success: False, message: "Verification email isn't enabled" },
				400,
			);
		}

		const { email, callbackURL } = ctx.req.valid("json");
		const session = await getSessionFromCtx(ctx);

		if (session instanceof Response) {
			const user = await context.internalAdapter.findUserByEmail(email);
			if (!user) {
				// we're returning true to avoid leaking information about the user
				return ctx.render({ success: True }, 200);
			}
			await sendVerificationEmailFn(ctx, user.user, callbackURL, options);
			return ctx.render({ success: True }, 200);
		}

		if (session.user.emailVerified)
			return ctx.render(
				{
					success: False,
					message:
						"You can only send a verification email to an unverified email",
				},
				400,
			);

		if (session.user.email !== email)
			return ctx.render(
				{
					success: False,
					message: "You can only send a verification email to your own email",
				},
				400,
			);

		await sendVerificationEmailFn(ctx, session.user, callbackURL, options);
		return ctx.render({ success: True }, 200);
	},
);

export const verifyEmailRoute = createRoute({
	operationId: Routes.VERIFY_EMAIL,
	method: "get",
	path: "/verify-email",
	description: "Verify the email of the user",
	middleware: [
		originCheck((ctx) => ctx.req.query("callbackURL")),
		tokenCheck((ctx) => ctx.req.query("token"), verifyEmailTokenSchema),
	],
	request: req().qry(verifyEmailQuerySchema).bld(),
	responses: res(SCHEMAS[Definitions.TOKEN_USER].default)
		.err(401, "Invalid or expired token")
		.err(500)
		.rdr("Redirect to callback URL")
		.zod<typeof verifyEmailQuerySchema>()
		.bld(),
});

export const verifyEmail = createEndpoint(
	verifyEmailRoute,
	(options) => async (ctx) => {
		const { callbackURL } = ctx.req.valid("query");
		const context = ctx.get("context");
		const parsed = ctx.get("token");

		const redirectOnError = (error: string) => {
			if (callbackURL) {
				if (callbackURL.includes("?"))
					return ctx.redirect(`${callbackURL}&error=${error}`, 302);
				return ctx.redirect(`${callbackURL}?error=${error}`, 302);
			}
			return ctx.render(
				{
					success: False,
					code: error.toUpperCase(),
					message: capitalizeFirstLetter(error.replaceAll("_", " ")) as string,
				},
				401,
			);
		};

		const user = await context.internalAdapter.findUserByEmail(parsed.email);
		if (!user) return redirectOnError("user_not_found");

		if (parsed.updateTo) {
			const session = await getSessionFromCtx(ctx);
			if (session instanceof Response || session.user.email !== parsed.email)
				return redirectOnError("unauthorized");

			const updatedUser = await context.internalAdapter.updateUserByEmail(
				parsed.email,
				{ email: parsed.updateTo, emailVerified: false },
			);

			if (updatedUser == null)
				return ctx.render(
					{ success: False, message: "Failed to update user" },
					500,
				);

			const newToken = await createEmailVerificationToken(
				context.secret,
				parsed.updateTo,
			);

			if (options.emailVerification?.sendVerificationEmail)
				// send verification email to the new email
				await options.emailVerification.sendVerificationEmail(
					{
						user: updatedUser,
						url: `${context.baseURL}/verify-email?token=${newToken}&callbackURL=${callbackURL ?? encodeURIComponent("/")}`,
						token: newToken,
					},
					ctx,
				);

			await setSessionCookie(ctx, options, {
				session: session.session,
				user: { ...session.user, email: parsed.updateTo, emailVerified: false },
			});

			if (callbackURL != null) return ctx.redirect(callbackURL, 302);

			return ctx.render(
				{ success: True, token: session.session.token, user: updatedUser },
				200,
			);
		}

		if (options.emailVerification?.onEmailVerification)
			await options.emailVerification.onEmailVerification(user.user, ctx.req);

		const updatedUser = await context.internalAdapter.updateUserByEmail(
			parsed.email,
			{ emailVerified: true },
		);

		if (updatedUser == null)
			return ctx.render(
				{ success: False, message: "Failed to update user" },
				500,
			);

		if (options.emailVerification?.afterEmailVerification)
			await options.emailVerification.afterEmailVerification(
				updatedUser,
				ctx.req,
			);

		if (options.emailVerification?.autoSignInAfterVerification === true) {
			const currentSession = await getSessionFromCtx(ctx);
			if (
				currentSession instanceof Response ||
				currentSession.user.email !== parsed.email
			) {
				const session = await context.internalAdapter.createSession(
					user.user.id,
				);
				if (session == null)
					return ctx.render(
						{ success: False, message: "Failed to create session" },
						500,
					);

				await setSessionCookie(ctx, options, {
					session,
					user: { ...user.user, emailVerified: true },
				});
			} else
				await setSessionCookie(ctx, options, {
					session: currentSession.session,
					user: { ...currentSession.user, emailVerified: true },
				});
		}

		if (callbackURL != null) return ctx.redirect(callbackURL, 302);
		return ctx.render({ success: False }, 200);
	},
);
