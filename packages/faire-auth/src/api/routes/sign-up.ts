import type { User } from "@faire-auth/core/db";
import { isDevelopment } from "@faire-auth/core/env";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import { runWithTransaction } from "../../context/transaction";
import { parseUserInput } from "../../db/schema";
import { setSessionCookie } from "../../utils/cookies";
import { createEndpoint } from "../factory/endpoint";
import { signUpEmailSchema } from "../schema/sign-up";
import { createEmailVerificationToken } from "./email-verification";

export const signUpEmailRoute = createRoute({
	operationId: Routes.SIGN_UP_EMAIL,
	method: "post",
	path: "/sign-up/email",
	description: "Sign up a user using email and password",
	request: req().bdy(signUpEmailSchema).bld(),
	responses: res(
		SCHEMAS[Definitions.SIGN_IN_UP].default,
		"Successfully created user",
	)
		.err(
			400,
			"Email and password sign up is not enabled, invalid password, or user already exists",
		)
		.zod<typeof signUpEmailSchema>()
		.bld(),
});

export const signUpEmail = createEndpoint(
	signUpEmailRoute,
	(options) => async (ctx) => {
		if (
			!(options.emailAndPassword?.enabled ?? false) ||
			options.emailAndPassword?.disableSignUp === true
		)
			return ctx.render(
				{
					success: False,
					message: "Email and password sign up is not enabled",
				},
				400,
			);

		const {
			name,
			email,
			password,
			image,
			callbackURL,
			rememberMe,
			...additionalFields
		} = ctx.req.valid("json");

		const context = ctx.get("context");
		const { minPasswordLength, maxPasswordLength } = context.password.config;

		if (password.length < minPasswordLength) {
			context.logger.error("Password is too short");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT },
				400,
			);
		}
		if (password.length > maxPasswordLength) {
			context.logger.error("Password is too long");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PASSWORD_TOO_LONG },
				400,
			);
		}

		return runWithTransaction(context.adapter, async () => {
			const dbUser = await context.internalAdapter.findUserByEmail(email);
			if (dbUser?.user) {
				context.logger.info(`Sign-up attempt for existing email: ${email}`);
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.USER_ALREADY_EXISTS },
					400,
				);
			}

			const additionalData = await parseUserInput(
				options,
				additionalFields,
				"create",
			);
			if (additionalData instanceof Response) return additionalData;
			/**
			 * Hash the password
			 *
			 * This is done prior to creating the user
			 * to ensure that any plugin that
			 * may break the hashing should break
			 * before the user is created.
			 */
			const hash = await context.password.hash(password);
			let createdUser: User;
			try {
				createdUser = await context.internalAdapter.createUser({
					email: email.toLowerCase(),
					name,
					image,
					...additionalData,
					emailVerified: false,
				});
			} catch (e) {
				if (isDevelopment()) context.logger.error("Failed to create user", e);

				// if (e instanceof Error && 'status' in e && 'message' in e) {
				//   return ctx.render({ success: False, message: e.message }, 422)
				// }
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER },
					400,
				);
			}
			if (createdUser == null)
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.FAILED_TO_CREATE_USER },
					400,
				);

			await context.internalAdapter.linkAccount({
				userId: createdUser.id,
				providerId: "credential",
				accountId: createdUser.id,
				password: hash,
			});
			if (
				options.emailVerification?.sendOnSignUp === true ||
				options.emailAndPassword?.requireEmailVerification === true
			) {
				const token = await createEmailVerificationToken(
					context.secret,
					createdUser.email,
					undefined,
					options.emailVerification?.expiresIn,
				);
				const url = `${
					context.baseURL
				}/verify-email?token=${token}&callbackURL=${callbackURL ?? "/"}`;
				await options.emailVerification?.sendVerificationEmail?.(
					{ user: createdUser, url, token },
					ctx,
				);
			}

			if (
				options.emailAndPassword?.autoSignIn === false ||
				options.emailAndPassword?.requireEmailVerification === true
			) {
				return ctx.render(
					{ success: True, redirect: False, user: createdUser },
					200,
				);
			}

			const session = await context.internalAdapter.createSession(
				createdUser.id,
				rememberMe === false,
			);
			if (session == null)
				return ctx.render(
					{
						success: False,
						message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
					},
					400,
				);

			await setSessionCookie(
				ctx,
				options,
				{ session, user: createdUser },
				rememberMe === false,
			);
			return ctx.render(
				{
					success: True,
					redirect: False,
					token: session.token,
					user: createdUser,
				},
				200,
			);
		});
	},
);
