import type { User } from "@faire-auth/core/db";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import { generateRandomString } from "../../crypto";
import { parseUserInput } from "../../db/schema";
import { deleteSessionCookie, setSessionCookie } from "../../utils/cookies";
import { createEndpoint } from "../factory/endpoint";
import { originCheck } from "../middleware/origin-check";
import {
	changeEmailSchema,
	changePasswordSchema,
	deleteUserCallbackQuerySchema,
	deleteUserSchema,
	setPasswordSchema,
	updateUserSchema,
} from "../schema/update-user";
import { createEmailVerificationToken } from "./email-verification";
import { sensitiveSessionMiddleware, sessionMiddleware } from "./session";

export const updateUserRoute = createRoute({
	operationId: Routes.UPDATE_USER,
	method: "post",
	path: "/update-user",
	description: "Update the current user",
	middleware: [sessionMiddleware()],
	request: req().bdy(updateUserSchema).bld(),
	responses: res(SCHEMAS[Definitions.SUCCESS].default)
		.zod<typeof updateUserSchema>()
		.err(500, "Failed to update user")
		.bld(),
});

export const updateUser = createEndpoint(
	updateUserRoute,
	(options) => async (ctx) => {
		const { name, image, ...rest } = ctx.req.valid("json");
		if (
			image === undefined &&
			name === undefined &&
			Object.keys(rest).length === 0
		)
			return ctx.render({ success: True }, 200);
		const context = ctx.get("context");
		const session = ctx.get("session");

		const additionalFields = await parseUserInput(options, rest, "update");
		if (additionalFields instanceof Response) return additionalFields;
		const user = await context.internalAdapter.updateUser(session.user.id, {
			...(name != null && { name }),
			...(image !== undefined && { image }),
			...additionalFields,
		});
		if (user == null)
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.FAILED_TO_UPDATE_USER },
				500,
			);

		/**
		 * Update the session cookie with the new user data
		 */
		await setSessionCookie(ctx, options, {
			session: session.session,
			user: user as User,
		});
		return ctx.render({ success: True }, 200);
	},
);

export const changePasswordRoute = createRoute({
	operationId: Routes.CHANGE_PASSWORD,
	method: "post",
	path: "/change-password",
	description: "Change the password of the user",
	middleware: [sensitiveSessionMiddleware],
	request: req().bdy(changePasswordSchema).bld(),
	responses: res(SCHEMAS[Definitions.SIGN_IN_UP].default)
		.err(400, "Invalid password")
		.err(404, "Account not found")
		.zod<typeof changePasswordSchema>()
		.err(500, "Failed to get session")
		.bld(),
});

export const changePassword = createEndpoint(
	changePasswordRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		const session = ctx.get("session");
		const { newPassword, currentPassword, revokeOtherSessions } =
			ctx.req.valid("json");

		const { minPasswordLength } = context.password.config;
		if (newPassword.length < minPasswordLength) {
			context.logger.error("Password is too short");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT },
				400,
			);
		}

		const { maxPasswordLength } = context.password.config;
		if (newPassword.length > maxPasswordLength) {
			context.logger.error("Password is too long");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_LONG },
				400,
			);
		}

		const accounts = await context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) =>
				account.providerId === "credential" && account.password != null,
		);
		if (account?.password == null) {
			return ctx.render(
				{
					success: False,
					message: BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND,
				},
				404,
			);
		}
		const passwordHash = await context.password.hash(newPassword);
		const verify = await context.password.verify({
			hash: account.password,
			password: currentPassword,
		});
		if (!verify) {
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_PASSWORD },
				400,
			);
		}
		await context.internalAdapter.updateAccount(account.id, {
			password: passwordHash,
		});
		let token = session.session.token;
		if (revokeOtherSessions === true) {
			await context.internalAdapter.deleteSessions(session.user.id);
			const newSession = await context.internalAdapter.createSession(
				session.user.id,
			);
			if (newSession == null) {
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION },
					500,
				);
			}
			// set the new session cookie
			await setSessionCookie(ctx, options, {
				session: newSession,
				user: session.user,
			});
			// eslint-disable-next-line @typescript-eslint/prefer-destructuring, prefer-destructuring
			token = newSession.token;
		}

		return ctx.render(
			{ redirect: False, success: True, token, user: session.user },
			200,
		);
	},
);

export const setPasswordRoute = createRoute({
	operationId: Routes.SET_PASSWORD,
	hide: true,
	SERVER_ONLY: true,
	method: "post",
	path: "/set-password",
	middleware: [sensitiveSessionMiddleware],
	request: req().bdy(setPasswordSchema).bld(),
	responses: res(SCHEMAS[Definitions.SUCCESS].default)
		.err(400, "Invalid password or user already has password")
		.zod<typeof setPasswordSchema>()
		.bld(),
});

export const setPassword = createEndpoint(
	setPasswordRoute,
	(_options) => async (ctx) => {
		const context = ctx.get("context");
		const session = ctx.get("session");
		const { newPassword } = ctx.req.valid("json");

		const { minPasswordLength } = context.password.config;
		if (newPassword.length < minPasswordLength) {
			context.logger.error("Password is too short");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT },
				400,
			);
		}

		const { maxPasswordLength } = context.password.config;

		if (newPassword.length > maxPasswordLength) {
			context.logger.error("Password is too long");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_LONG },
				400,
			);
		}

		const accounts = await context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) =>
				account.providerId === "credential" && account.password != null,
		);
		const passwordHash = await context.password.hash(newPassword);
		if (!account) {
			await context.internalAdapter.linkAccount({
				userId: session.user.id,
				providerId: "credential",
				accountId: session.user.id,
				password: passwordHash,
			});
			return ctx.render({ success: True }, 200);
		}
		return ctx.render(
			{ success: False, message: "User already has a password" },
			400,
		);
	},
);

export const deleteUserRoute = createRoute({
	operationId: Routes.DELETE_USER,
	method: "post",
	path: "/delete-user",
	description: "Delete the user",
	middleware: [sensitiveSessionMiddleware],
	request: req().bdy(deleteUserSchema).bld(),
	responses: res(
		SCHEMAS[Definitions.SUCCESS].default,
		"User deletion processed successfully",
	)
		.rdr("Redirect to callback URL")
		.err(400, "Account not found or invalid password")
		.err(404, "Delete user is disabled")
		.zod<typeof deleteUserSchema>()
		.bld(),
});

export const deleteUser = createEndpoint(
	deleteUserRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		if (options.user?.deleteUser?.enabled !== true) {
			context.logger.error("Delete user is disabled. Enable it in the options");
			return ctx.render(
				{ success: False, message: "Delete user is disabled" },
				404,
			);
		}

		const session = ctx.get("session");
		const api = ctx.get("api");
		const { callbackURL, password, token } = ctx.req.valid("json");

		let canDelete = false;
		const accounts = await context.internalAdapter.findAccounts(
			session.user.id,
		);
		const account = accounts.find(
			(account) =>
				account.providerId === "credential" && account.password != null,
		);

		// If the user has a password, we can try to delete the account
		if (password != null) {
			if (account?.password == null) {
				return ctx.render(
					{
						success: False,
						message: BASE_ERROR_CODES.CREDENTIAL_ACCOUNT_NOT_FOUND,
					},
					400,
				);
			}
			const verify = await context.password.verify({
				hash: account.password,
				password,
			});
			if (!verify)
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.INVALID_PASSWORD },
					400,
				);

			canDelete = true;
		}

		// If the user has a token, we can try to delete the account
		if (token != null)
			return await api
				.deleteUserCallback({ query: { token } }, ctx)
				.then((res) =>
					res instanceof Response
						? res
						: ctx.render(
								res,
								res.success === true ? 200 : "errors" in res ? 422 : 404,
							),
				);

		// if user didn't provide a password or token, try sending email verification
		if (options.user?.deleteUser?.sendDeleteAccountVerification != null) {
			// if the user has a password but it was not provided, we can't delete the account
			if (account?.password != null && !canDelete) {
				return ctx.render(
					{
						success: False,
						message: BASE_ERROR_CODES.USER_ALREADY_HAS_PASSWORD,
					},
					400,
				);
			}

			const token = generateRandomString(32, "0-9", "a-z");
			await context.internalAdapter.createVerificationValue({
				value: session.user.id,
				identifier: `delete-account-${token}`,
				expiresAt: new Date(
					Date.now() +
						(options.user.deleteUser.deleteTokenExpiresIn ?? 60 * 60 * 24) *
							1000,
				),
			});
			const url = `${
				context.baseURL
			}/delete-user/callback?token=${token}${callbackURL ? `&callbackURL=${callbackURL}` : ""}`;
			await options.user.deleteUser.sendDeleteAccountVerification(
				{
					user: session.user,
					url,
					token,
				},
				ctx,
			);
			return ctx.render(
				{ success: True, message: "Verification email sent" },
				200,
			);
		}

		// if the user didn't provide a password or token, or email verification is not enabled
		// we can check if the session is fresh and delete based on that
		// options.session?.freshAge != null
		if (!password && context.sessionConfig.freshAge !== 0) {
			const currentAge = session.session.createdAt.getTime();
			// const { freshAge } = options.session;
			const freshAge = context.sessionConfig.freshAge * 1000;
			const now = Date.now();
			if (now - currentAge > freshAge * 1000)
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.SESSION_EXPIRED },
					400,
				);

			canDelete = true;
		}

		// if password/fresh session didn't work, we can't delete the account
		if (!canDelete)
			return ctx.render(
				{
					success: False,
					message: "User cannot be deleted. please provide a password or token",
				},
				400,
			);

		if (options.user?.deleteUser?.beforeDelete)
			await options.user.deleteUser.beforeDelete(session.user, ctx.req);

		await context.internalAdapter.deleteUser(session.user.id);
		await context.internalAdapter.deleteSessions(session.user.id);
		await context.internalAdapter.deleteAccounts(session.user.id);
		deleteSessionCookie(ctx);

		if (options.user?.deleteUser?.afterDelete)
			await options.user.deleteUser.afterDelete(session.user, ctx.req);

		return ctx.render({ success: True, message: "User deleted" }, 200);
	},
);

export const deleteUserCallbackRoute = createRoute({
	operationId: Routes.DELETE_USER_CALLBACK,
	method: "get",
	path: "/delete-user/callback",
	description: "Callback to complete user deletion with verification token",
	middleware: [
		originCheck((ctx) => ctx.req.query("callbackURL")),
		sessionMiddleware(),
	],
	request: req().qry(deleteUserCallbackQuerySchema).bld(),
	responses: res(
		SCHEMAS[Definitions.SUCCESS].default,
		"User successfully deleted",
	)
		.rdr("Redirect to callback URL")
		.err(404, "Invalid token or delete user is disabled")
		.zod<typeof deleteUserCallbackQuerySchema>()
		.bld(),
});

export const deleteUserCallback = createEndpoint(
	deleteUserCallbackRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		if (!(options.user?.deleteUser?.enabled ?? false)) {
			context.logger.error("Delete user is disabled. Enable it in the options");
			return ctx.render(
				{ success: False, message: "Delete user is disabled" },
				404,
			);
		}

		const session = ctx.get("session");
		const { token: requestedToken, callbackURL } = ctx.req.valid("query");

		const token = await context.internalAdapter.findVerificationValue(
			`delete-account-${requestedToken}`,
		);
		if (!token || token.expiresAt < new Date()) {
			context.logger.info(requestedToken);
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_TOKEN },
				404,
			);
		}
		if (token.value !== session.user.id) {
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_TOKEN },
				404,
			);
		}
		const { beforeDelete } = options.user?.deleteUser ?? {};
		if (beforeDelete) await beforeDelete(session.user, ctx.req);

		await context.internalAdapter.deleteUser(session.user.id);
		await context.internalAdapter.deleteSessions(session.user.id);
		await context.internalAdapter.deleteAccounts(session.user.id);
		await context.internalAdapter.deleteVerificationValue(token.id);

		deleteSessionCookie(ctx);

		const { afterDelete } = options.user?.deleteUser ?? {};
		if (afterDelete) await afterDelete(session.user, ctx.req);

		if (callbackURL != null) return ctx.redirect(callbackURL);
		return ctx.render({ success: True, message: "User deleted" }, 200);
	},
);

export const changeEmailRoute = createRoute({
	operationId: Routes.CHANGE_EMAIL,
	method: "post",
	path: "/change-email",
	middleware: [sensitiveSessionMiddleware],
	request: req().bdy(changeEmailSchema).bld(),
	responses: res(
		SCHEMAS[Definitions.SUCCESS].default,
		"Email change request processed successfully",
	)
		.err(400, "Change email is disabled or user already exists")
		.zod<typeof changeEmailSchema>()
		.bld(),
});

export const changeEmail = createEndpoint(
	changeEmailRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		if (options.user?.changeEmail?.enabled !== true) {
			context.logger.error("Change email is disabled.");
			return ctx.render(
				{ success: False, message: "Change email is disabled" },
				400,
			);
		}

		const session = ctx.get("session");
		let { callbackURL, newEmail } = ctx.req.valid("json");
		newEmail = newEmail.toLowerCase();

		if (newEmail === session.user.email) {
			context.logger.error("Email is the same");
			return ctx.render({ success: False, message: "Email is the same" }, 400);
		}
		const existingUser =
			await context.internalAdapter.findUserByEmail(newEmail);
		if (existingUser) {
			context.logger.error("Email already exists");
			return ctx.render(
				{ success: False, message: "Couldn't update your email" },
				400,
			);
		}
		/**
		 * If the email is not verified, we can update the email
		 */
		if (!session.user.emailVerified) {
			const existing = await context.internalAdapter.findUserByEmail(newEmail);
			if (existing) {
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.USER_ALREADY_EXISTS },
					400,
				);
			}
			await context.internalAdapter.updateUserByEmail(session.user.email, {
				email: newEmail,
				emailVerified: false,
			});
			await setSessionCookie(ctx, options, {
				session: session.session,
				user: { ...session.user, email: newEmail },
			});
			if (options.emailVerification?.sendVerificationEmail) {
				const token = await createEmailVerificationToken(
					context.secret,
					newEmail,
					undefined,
					options.emailVerification.expiresIn,
				);
				const url = `${
					context.baseURL
				}/verify-email?token=${token}&callbackURL=${callbackURL ?? "/"}`;
				await options.emailVerification.sendVerificationEmail(
					{
						user: session.user,
						url,
						token,
					},
					ctx,
				);
			}

			return ctx.render({ success: True }, 200);
		}

		/**
		 * If the email is verified, we need to send a verification email
		 */
		if (options.user?.changeEmail?.sendChangeEmailVerification == null) {
			context.logger.error("Verification email isn't enabled.");
			return ctx.render(
				{ success: False, message: "Verification email isn't enabled" },
				400,
			);
		}

		const token = await createEmailVerificationToken(
			context.secret,
			session.user.email,
			newEmail,
			options.emailVerification?.expiresIn,
		);
		const url = `${
			context.baseURL
		}/verify-email?token=${token}&callbackURL=${callbackURL ?? "/"}`;
		await options.user.changeEmail.sendChangeEmailVerification(
			{ user: session.user, newEmail, url, token },
			ctx,
		);
		return ctx.render({ success: True }, 200);
	},
);
