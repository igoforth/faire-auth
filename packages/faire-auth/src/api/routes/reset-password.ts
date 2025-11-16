import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import { getDate } from "@faire-auth/core/utils";
import type { Context } from "hono";
import type { ContextVars } from "../../types/hono";
import { generateId } from "../../utils";
import { createEndpoint } from "../factory/endpoint";
import { originCheck } from "../middleware/origin-check";
import {
	requestPasswordResetCallbackParamsSchema,
	requestPasswordResetCallbackQuerySchema,
	requestPasswordResetSchema,
	resetPasswordQuerySchema,
	resetPasswordSchema,
} from "../schema/reset-password";

const redirectError = <V extends object>(
	ctx: Context<ContextVars<V>>,
	callbackURL: string | undefined,
	query?: Record<string, string>,
): string => {
	const url =
		callbackURL != null
			? new URL(callbackURL, ctx.get("context").baseURL)
			: new URL(`${ctx.get("context").baseURL}/error`);
	if (query)
		Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
	return url.href;
};

const redirectCallback = <V extends object>(
	ctx: Context<ContextVars<V>>,
	callbackURL: string,
	query?: Record<string, string>,
): string => {
	const url = new URL(callbackURL, ctx.get("context").baseURL);
	if (query)
		Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));
	return url.href;
};

export const requestPasswordResetRoute = createRoute({
	operationId: Routes.REQUEST_PASSWORD_RESET,
	method: "post",
	path: "/request-password-reset",
	description: "Send a password reset email to the user",
	request: req().bdy(requestPasswordResetSchema).bld(),
	responses: res(SCHEMAS[Definitions.SUCCESS].default)
		.err(400, "Reset password not enabled in options")
		.zod<typeof requestPasswordResetSchema>()
		.bld(),
});

export const requestPasswordReset = createEndpoint(
	requestPasswordResetRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		if (!options.emailAndPassword?.sendResetPassword) {
			context.logger.error(
				"Reset password isn't enabled. Please add an emailAndPassword and sendResetPassword function to your auth config!",
			);
			return ctx.render(
				{ success: False, message: "Reset password isn't enabled" },
				400,
			);
		}
		const { email, redirectTo } = ctx.req.valid("json");

		const user = await context.internalAdapter.findUserByEmail(email, {
			includeAccounts: true,
		});
		if (!user) {
			context.logger.error("Reset Password: User not found", { email });
			return ctx.render(
				{
					success: True,
					message:
						"If this email exists in our system, check your email for the reset link",
				},
				200,
			);
		}
		const defaultExpiresIn = 60 * 60 * 1;
		const expiresAt = getDate(
			options.emailAndPassword.resetPasswordTokenExpiresIn ?? defaultExpiresIn,
			"sec",
		);
		const verificationToken = generateId(24);
		await context.internalAdapter.createVerificationValue({
			value: user.user.id,
			identifier: `reset-password:${verificationToken}`,
			expiresAt,
		});
		const callbackURL =
			redirectTo != null ? encodeURIComponent(redirectTo) : undefined;
		const url = `${context.baseURL}/reset-password/${verificationToken}${callbackURL != null ? `?callbackURL=${callbackURL}` : ""}`;
		await options.emailAndPassword.sendResetPassword(
			{ user: user.user, url, token: verificationToken },
			ctx,
		);
		return ctx.render({ success: True }, 200);
	},
);

export const requestPasswordResetCallbackRoute = createRoute({
	operationId: Routes.REQUEST_PASSWORD_RESET_CALLBACK,
	method: "get",
	path: "/reset-password/:token",
	description: "Redirects the user to the callback URL with the token",
	middleware: [originCheck((ctx) => ctx.req.query("callbackURL"))],
	request: req()
		.prm(requestPasswordResetCallbackParamsSchema)
		.qry(requestPasswordResetCallbackQuerySchema)
		.bld(),
	responses: res().rdr().bld(),
});

export const requestPasswordResetCallback = createEndpoint(
	requestPasswordResetCallbackRoute,
	(_options) => async (ctx) => {
		const { token } = ctx.req.valid("param");
		const { callbackURL } = ctx.req.valid("query");
		if (!token || !callbackURL)
			return ctx.redirect(
				redirectError(ctx, callbackURL, { error: "INVALID_TOKEN" }),
				302,
			);

		const verification = await ctx
			.get("context")
			.internalAdapter.findVerificationValue(`reset-password:${token}`);
		if (!verification || verification.expiresAt < new Date())
			return ctx.redirect(
				redirectError(ctx, callbackURL, { error: "INVALID_TOKEN" }),
				302,
			);

		return ctx.redirect(redirectCallback(ctx, callbackURL, { token }), 302);
	},
);

export const resetPasswordRoute = createRoute({
	operationId: Routes.RESET_PASSWORD,
	method: "post",
	path: "/reset-password",
	description: "Reset the password for a user",
	request: req().qry(resetPasswordQuerySchema).bdy(resetPasswordSchema).bld(),
	responses: res(SCHEMAS[Definitions.SUCCESS].default)
		.err(400, "Invalid token or password")
		.zod<typeof resetPasswordSchema>()
		.bld(),
});

export const resetPassword = createEndpoint(
	resetPasswordRoute,
	(options) => async (ctx) => {
		const token = ctx.req.valid("json").token || ctx.req.valid("query").token;
		if (token == null || token === "")
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_TOKEN },
				400,
			);
		const { newPassword } = ctx.req.valid("json");

		const context = ctx.get("context");
		const minLength = context.password.config.minPasswordLength;
		const maxLength = context.password.config.maxPasswordLength;
		if (newPassword.length < minLength)
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT },
				400,
			);

		if (newPassword.length > maxLength)
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_LONG },
				400,
			);

		const id = `reset-password:${token}`;

		const verification =
			await context.internalAdapter.findVerificationValue(id);
		if (!verification || verification.expiresAt < new Date())
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_TOKEN },
				400,
			);

		const userId = verification.value;
		const hashedPassword = await context.password.hash(newPassword);
		const accounts = await context.internalAdapter.findAccounts(userId);
		const account = accounts.find((ac) => ac.providerId === "credential");
		if (!account)
			await context.internalAdapter.createAccount({
				userId,
				providerId: "credential",
				password: hashedPassword,
				accountId: userId,
			});
		else await context.internalAdapter.updatePassword(userId, hashedPassword);
		await context.internalAdapter.deleteVerificationValue(verification.id);

		if (options.emailAndPassword?.onPasswordReset) {
			const user = await context.internalAdapter.findUserById(userId);
			if (user)
				await options.emailAndPassword.onPasswordReset(
					{
						user,
					},
					ctx.req,
				);
		}

		if (options.emailAndPassword?.revokeSessionsOnPasswordReset)
			await context.internalAdapter.deleteSessions(userId);

		return ctx.render({ success: True }, 200);
	},
);
