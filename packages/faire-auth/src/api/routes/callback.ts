import type { Context } from "hono";
import type { OAuth2Tokens } from "../../oauth2";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { parseState } from "../../oauth2/state";
import { setTokenUtil } from "../../oauth2/utils";
import type { ContextVars } from "../../types/hono";
import type { FaireAuthOptions } from "../../types/options";
import { setSessionCookie } from "../../utils/cookies";
import { safeJSONParse } from "../../utils/json";
import { Routes } from "@faire-auth/core/static";
import { req, res } from "@faire-auth/core/factory";
import { createEndpoint } from "../factory/endpoint";
import { createRoute } from "@faire-auth/core/factory";
import {
	callbackSchema,
	oauthCallbackParamsSchema,
	oauthCallbackQuerySchema,
} from "../schema/callback";

const handleCallbackOAuth = async (
	ctx: Context<ContextVars>,
	paramsId: string,
	{
		code,
		error,
		device_id,
		error_description,
		state,
		user,
	}: {
		code?: string | undefined;
		error?: string | undefined;
		device_id?: string | undefined;
		error_description?: string | undefined;
		state?: string | undefined;
		user?: string | undefined;
	} = {},
	options: Pick<
		FaireAuthOptions,
		| "account"
		| "emailVerification"
		| "onAPIError"
		| "secondaryStorage"
		| "session"
	>,
) => {
	const context = ctx.get("context");
	const defaultErrorURL =
		options.onAPIError?.errorURL ?? `${context.baseURL}/error`;

	if (error != null)
		return ctx.redirect(
			`${defaultErrorURL}?error=${error}&error_description=${error_description}`,
			302,
		);

	if (state == null) {
		context.logger.error("State not found", error);
		return ctx.redirect(`${defaultErrorURL}?error=state_not_found`, 302);
	}

	const res = await parseState(ctx, options);
	if (res.type === "redirect") return res.response;
	const {
		codeVerifier,
		callbackURL,
		link,
		errorURL,
		newUserURL,
		requestSignUp,
	} = res.data;

	const redirectOnError = (error: string) => {
		let url = errorURL ?? defaultErrorURL;
		if (url.includes("?")) url = `${url}&error=${error}`;
		else url = `${url}?error=${error}`;
		return ctx.redirect(url, 302);
	};

	if (code == null) {
		context.logger.error("Code not found");
		return redirectOnError("no_code");
	}

	const provider = context.socialProviders.find((p) => p.id === paramsId);
	if (!provider) {
		context.logger.error("Oauth provider with id", paramsId, "not found");
		return redirectOnError("oauth_provider_not_found");
	}

	let tokens: OAuth2Tokens;
	try {
		tokens = await provider.validateAuthorizationCode({
			code,
			codeVerifier,
			...(device_id != null ? { deviceId: device_id } : {}),
			redirectURI: `${context.baseURL}/callback/${provider.id}`,
		});
	} catch (e) {
		context.logger.error("", e);
		return redirectOnError("invalid_code");
	}

	const userInfo = await provider
		.getUserInfo({
			...tokens,
			...(user && { user: safeJSONParse(user)! }),
		})
		.then((res) => res?.user);

	if (!userInfo) {
		context.logger.error("Unable to get user info");
		return redirectOnError("unable_to_get_user_info");
	}

	if (!callbackURL) {
		context.logger.error("No callback URL found");
		return redirectOnError("no_callback_url");
	}

	if (link) {
		const trustedProviders = options.account?.accountLinking?.trustedProviders;
		const isTrustedProvider = trustedProviders?.includes(
			provider.id as "apple",
		);
		if (
			(!isTrustedProvider && !userInfo.emailVerified) ||
			options.account?.accountLinking?.enabled === false
		) {
			context.logger.error("Unable to link account - untrusted provider");
			return redirectOnError("unable_to_link_account");
		}

		const existingAccount = await context.internalAdapter.findAccount(
			userInfo.id.toString(),
		);

		if (existingAccount) {
			if (existingAccount.userId.toString() !== link.userId.toString()) {
				return redirectOnError("account_already_linked_to_different_user");
			}
			const updateData = Object.fromEntries(
				Object.entries({
					idToken: tokens.idToken,
					accessToken: await setTokenUtil(tokens.accessToken, ctx, options),
					refreshToken: await setTokenUtil(tokens.refreshToken, ctx, options),
					accessTokenExpiresAt: tokens.accessTokenExpiresAt,
					refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
					...(tokens.scopes &&
						tokens.scopes.length > 0 && { scope: tokens.scopes.join(",") }),
				}).filter(([_, value]) => value !== undefined),
			);
			await context.internalAdapter.updateAccount(
				existingAccount.id,
				updateData,
			);
		} else {
			const newAccount = await context.internalAdapter.createAccount({
				userId: link.userId,
				providerId: provider.id,
				accountId: userInfo.id,
				...tokens,
				accessToken: await setTokenUtil(tokens.accessToken, ctx, options),
				refreshToken: await setTokenUtil(tokens.refreshToken, ctx, options),
				...(tokens.scopes &&
					tokens.scopes.length > 0 && { scope: tokens.scopes.join(",") }),
			});
			if (newAccount == null) return redirectOnError("unable_to_link_account");
		}
		let toRedirectTo: string;
		try {
			const url = callbackURL;
			toRedirectTo = url.toString();
		} catch {
			toRedirectTo = callbackURL;
		}
		return ctx.redirect(toRedirectTo, 302);
	}

	if (userInfo.email == null) {
		context.logger.error(
			"Provider did not return email. This could be due to misconfiguration in the provider settings.",
		);
		return redirectOnError("email_not_found");
	}

	const result = await handleOAuthUserInfo(
		ctx,
		{
			userInfo: {
				...userInfo,
				id: userInfo.id.toString(),
				email: userInfo.email,
				name: userInfo.name ?? userInfo.email,
			},
			account: {
				providerId: provider.id,
				accountId: userInfo.id.toString(),
				...tokens,
				...(tokens.scopes &&
					tokens.scopes.length > 0 && { scope: tokens.scopes.join(",") }),
			},
			callbackURL,
			disableSignUp:
				(provider.disableImplicitSignUp === true &&
					!(requestSignUp ?? false)) ||
				provider.options?.disableSignUp === true,
			overrideUserInfo: provider.options?.overrideUserInfoOnSignIn ?? false,
		},
		options,
	);
	if (result.type === "redirect") return result.response;
	if (result.type === "error") {
		context.logger.error(result.reason);
		return redirectOnError(result.reason);
	}

	const { session, user: resultUser } = result.data;
	await setSessionCookie(ctx, options, { session, user: resultUser });

	let toRedirectTo: string;
	try {
		const url =
			result.isRegister === true ? (newUserURL ?? callbackURL) : callbackURL;
		toRedirectTo = url.toString();
	} catch {
		toRedirectTo =
			result.isRegister === true ? (newUserURL ?? callbackURL) : callbackURL;
	}

	return ctx.redirect(toRedirectTo, 302);
};

export const getOAuthCallbackRoute = createRoute({
	operationId: Routes.OAUTH_CALLBACK_GET,
	isAction: false,
	method: "get",
	path: "/callback/:id",
	description: "Handle OAuth callback",
	request: req()
		.qry(oauthCallbackQuerySchema)
		.prm(oauthCallbackParamsSchema)
		.bld(),
	responses: res().rdr("Redirect to success or error URL").err(400).bld(),
});

export const getOAuthCallback = createEndpoint(
	getOAuthCallbackRoute,
	(options) => async (ctx) => {
		const query = ctx.req.valid("query");
		const { id: paramsId } = ctx.req.valid("param");
		return handleCallbackOAuth(ctx, paramsId, query, options);
	},
);

export const postOAuthCallbackRoute = createRoute({
	operationId: Routes.OAUTH_CALLBACK_POST,
	isAction: false,
	method: "post",
	path: "/callback/:id",
	description: "Handle OAuth callback (POST)",
	request: req()
		.bdy(callbackSchema.optional())
		.prm(oauthCallbackParamsSchema)
		.bld(),
	responses: res()
		.rdr("Redirect to success or error URL")
		.err(400)
		.zod<typeof callbackSchema>()
		.bld(),
});

export const postOAuthCallback = createEndpoint(
	postOAuthCallbackRoute,
	(options) => async (ctx) => {
		const body = ctx.req.valid("json");
		const { id: paramsId } = ctx.req.valid("param");
		return handleCallbackOAuth(ctx, paramsId, body, options);
	},
);
