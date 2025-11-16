import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { generateState } from "../../oauth2/state";
import { setSessionCookie } from "../../utils/cookies";
import { createEndpoint } from "../factory/endpoint";
import { signInEmailSchema, signInSocialSchema } from "../schema/sign-in";
import { createEmailVerificationToken } from "./email-verification";

export const signInSocialRoute = createRoute({
	operationId: Routes.SIGN_IN_SOCIAL,
	method: "post",
	path: "/sign-in/social",
	description: "Sign in with a social provider",
	request: req().bdy(signInSocialSchema).bld(),
	responses: res(
		SCHEMAS[Definitions.SIGN_IN_UP].default,
		"Returns either session details or redirect URL",
	)
		.rdr()
		.err(401, "Invalid token or user not found")
		.err(404, "Provider or id token not supported")
		.zod<typeof signInSocialSchema>()
		.bld(),
});

export const signInSocial = createEndpoint(
	signInSocialRoute,
	(options) => async (ctx) => {
		const {
			provider: requestedProvider,
			idToken,
			requestSignUp,
			callbackURL,
			scopes,
			loginHint,
			disableRedirect,
		} = ctx.req.valid("json");
		const context = ctx.get("context");
		const provider = context.socialProviders.find(
			(p) => p.id === requestedProvider,
		);
		if (!provider) {
			context.logger.error(
				"Provider not found. Make sure to add the provider in your auth config",
				{ provider: requestedProvider },
			);
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.PROVIDER_NOT_FOUND },
				404,
			);
		}

		if (idToken) {
			if (!provider.verifyIdToken) {
				context.logger.error(
					"Provider does not support id token verification",
					{
						provider: requestedProvider,
					},
				);
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.ID_TOKEN_NOT_SUPPORTED },
					404,
				);
			}
			const { token, nonce } = idToken;
			const valid = await provider.verifyIdToken(token, nonce);
			if (!valid) {
				context.logger.error("Invalid id token", {
					provider: requestedProvider,
				});
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.INVALID_TOKEN },
					401,
				);
			}
			const userInfo = await provider.getUserInfo({
				idToken: token,
				...(idToken.accessToken != null && {
					accessToken: idToken.accessToken,
				}),
				...(idToken.refreshToken != null && {
					refreshToken: idToken.refreshToken,
				}),
			});
			if (!userInfo?.user) {
				context.logger.error("Failed to get user info", {
					provider: requestedProvider,
				});
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO },
					401,
				);
			}
			if (userInfo.user.email == null) {
				context.logger.error("User email not found", {
					provider: requestedProvider,
				});
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND },
					401,
				);
			}

			const data = await handleOAuthUserInfo(
				ctx,
				{
					userInfo: {
						...userInfo.user,
						email: userInfo.user.email,
						id: userInfo.user.id.toString(),
						...(userInfo.user.name && { name: userInfo.user.name }),
						...(userInfo.user.image && { image: userInfo.user.image }),
						emailVerified: userInfo.user.emailVerified,
					},
					account: {
						providerId: provider.id,
						accountId: userInfo.user.id.toString(),
						...(idToken.accessToken && { accessToken: idToken.accessToken }),
					},
					...(callbackURL && { callbackURL }),
					disableSignUp:
						(provider.disableImplicitSignUp === true &&
							requestSignUp !== true) ||
						provider.disableSignUp === true,
				},
				options,
			);
			if (data.type === "redirect") return data.response;
			if (data.type === "error")
				return ctx.render(
					{ success: False, message: data.reason.replaceAll("_", " ") },
					401,
				);

			await setSessionCookie(ctx, options, data.data);
			return ctx.render(
				{
					success: True,
					redirect: False,
					token: data.data.session.token,
					user: data.data.user,
				},
				200,
			);
		}

		const { codeVerifier, state } = await generateState(
			ctx,
			undefined,
			options,
		);
		const url = await provider.createAuthorizationURL({
			state,
			codeVerifier,
			redirectURI: `${context.baseURL}/callback/${provider.id}`,
			...(scopes && scopes.length > 0 && { scopes }),
			...(loginHint != null && loginHint !== "" && { loginHint }),
		});

		if (disableRedirect === true)
			return ctx.render({ success: False, redirect: False }, 200);
		return ctx.render(
			{ success: False, redirect: True, url: url.toString() },
			200,
		);
	},
);

export const signInEmailRoute = createRoute({
	operationId: Routes.SIGN_IN_EMAIL,
	method: "post",
	path: "/sign-in/email",
	description: "Sign in with email and password",
	request: req().bdy(signInEmailSchema).bld(),
	responses: res(
		SCHEMAS[Definitions.SIGN_IN_UP].default,
		"Returns either session details or redirect URL",
	)
		.err(400, "Email and password login not enabled in options")
		.err(401, "Invalid email or password")
		.err(403, "Email not verified")
		.zod<typeof signInEmailSchema>()
		.err(500, "Failed to create session")
		.bld(),
});

export const signInEmail = createEndpoint(
	signInEmailRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		if (!(options.emailAndPassword?.enabled ?? false)) {
			context.logger.error(
				"Email and password is not enabled. Make sure to enable it in the options on you `auth.ts` file. Check `https://faire-auth.com/docs/authentication/email-password` for more!",
			);
			return ctx.render(
				{ success: False, message: "Email and password is not enabled" },
				400,
			);
		}

		const { email, password, rememberMe, callbackURL } = ctx.req.valid("json");

		const user = await context.internalAdapter.findUserByEmail(email, {
			includeAccounts: true,
		});

		if (!user) {
			// Hash password to prevent timing attacks from revealing valid email addresses
			// By hashing passwords for invalid emails, we ensure consistent response times
			await context.password.hash(password);
			context.logger.error("User not found", { email });
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD },
				401,
			);
		}

		const credentialAccount = user.accounts.find(
			(a) => a.providerId === "credential",
		);
		if (!credentialAccount) {
			context.logger.error("Credential account not found", { email });
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD },
				401,
			);
		}

		const currentPassword = credentialAccount.password;
		if (currentPassword == null) {
			context.logger.error("Password not found", { email });
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD },
				401,
			);
		}

		const validPassword = await context.password.verify({
			hash: currentPassword,
			password,
		});
		if (!validPassword) {
			context.logger.error("Invalid password");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD },
				401,
			);
		}

		if (
			options.emailAndPassword?.requireEmailVerification === true &&
			!user.user.emailVerified
		) {
			if (!options.emailVerification?.sendVerificationEmail) {
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED },
					403,
				);
			}
			const token = await createEmailVerificationToken(
				context.secret,
				user.user.email,
				undefined,
				options.emailVerification.expiresIn,
			);
			const url = `${
				context.baseURL
			}/verify-email?token=${token}&callbackURL=${callbackURL ?? "/"}`;
			await options.emailVerification.sendVerificationEmail(
				{ user: user.user, url, token },
				ctx,
			);
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.EMAIL_NOT_VERIFIED },
				403,
			);
		}

		const session = await context.internalAdapter.createSession(
			user.user.id,
			!rememberMe,
		);

		if (session == null) {
			context.logger.error("Failed to create session");
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION },
				500,
			);
		}

		await setSessionCookie(
			ctx,
			options,
			{ session, user: user.user },
			!rememberMe,
		);
		if (callbackURL != null)
			return ctx.render(
				{
					success: True,
					redirect: True,
					url: callbackURL,
					token: session.token,
					user: user.user,
				},
				200,
			);
		return ctx.render(
			{ success: True, redirect: False, token: session.token, user: user.user },
			200,
		);
	},
);
