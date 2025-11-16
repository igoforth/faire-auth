import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import type { OAuth2Tokens } from "../../oauth2";
import { decryptOAuthToken, generateState, setTokenUtil } from "../../oauth2";
import { createEndpoint } from "../factory/endpoint";
import {
	getAccessTokenSchema,
	getAccountInfoSchema,
	linkAccountSchema,
	refreshAccessTokenSchema,
	unlinkAccountSchema,
} from "../schema/account";
import {
	freshSessionMiddleware,
	requestOnlySessionMiddleware,
	sessionMiddleware,
} from "./session";

export const listAccountsRoute = createRoute({
	operationId: Routes.LIST_ACCOUNTS,
	method: "get",
	path: "/list-accounts",
	description: "List all accounts linked to the user",
	middleware: [sessionMiddleware()],
	responses: res(SCHEMAS[Definitions.ACCOUNTS_LIST].default).bld(),
});

export const listAccounts = createEndpoint(
	listAccountsRoute,
	(_options) => async (ctx) => {
		const context = ctx.get("context");
		const session = ctx.get("session");

		const accounts = await context.internalAdapter.findAccounts(
			session.user.id,
		);

		return ctx.render(
			accounts.map((a) => ({
				id: a.id,
				providerId: a.providerId,
				createdAt: a.createdAt,
				updatedAt: a.updatedAt,
				accountId: a.accountId,
				scopes: a.scope ? a.scope.split(",") : [],
			})),
			200,
		);
	},
);

export const linkAccountRoute = createRoute({
	operationId: Routes.LINK_ACCOUNT,
	method: "post",
	path: "/link-social",
	description: "Link a social account to the user",
	middleware: [sessionMiddleware()],
	request: req().bdy(linkAccountSchema).bld(),
	responses: res(SCHEMAS[Definitions.REDIRECT_URL].default)
		.err(
			401,
			"Invalid token, failed to get user info, email not found, linking not allowed, or different emails not allowed",
		)
		.err(404, "Provider not found")
		.err(417, "Unable to create account")
		.zod<typeof linkAccountSchema>()
		.bld(),
});

export const linkAccount = createEndpoint(
	linkAccountRoute,
	(options) => async (ctx) => {
		const {
			scopes,
			provider: requestedProvider,
			idToken,
		} = ctx.req.valid("json");
		const context = ctx.get("context");
		const session = ctx.get("session");

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

		// Handle ID Token flow if provided
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

			const linkingUserInfo = await provider.getUserInfo({
				idToken: token,
				accessToken: idToken.accessToken,
				refreshToken: idToken.refreshToken,
			});

			if (!linkingUserInfo || !linkingUserInfo?.user) {
				context.logger.error("Failed to get user info", {
					provider: requestedProvider,
				});
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO },
					401,
				);
			}

			const linkingUserId = String(linkingUserInfo.user.id);

			if (!linkingUserInfo.user.email) {
				context.logger.error("User email not found", {
					provider: requestedProvider,
				});
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.USER_EMAIL_NOT_FOUND },
					401,
				);
			}

			const existingAccounts = await context.internalAdapter.findAccounts(
				session.user.id,
			);

			const hasBeenLinked = existingAccounts.find(
				(a) => a.providerId === provider.id && a.accountId === linkingUserId,
			);

			if (hasBeenLinked) return ctx.render({ redirect: False }, 200);

			const trustedProviders =
				options.account?.accountLinking?.trustedProviders;

			const isTrustedProvider = trustedProviders?.includes(provider.id);
			if (
				(!isTrustedProvider && !linkingUserInfo.user.emailVerified) ||
				options.account?.accountLinking?.enabled === false
			) {
				return ctx.render(
					{
						success: False,
						message: "Account not linked - linking not allowed",
					},
					401,
				);
			}

			if (
				linkingUserInfo.user.email !== session.user.email &&
				options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				return ctx.render(
					{
						success: False,
						message: "Account not linked - different emails not allowed",
					},
					401,
				);
			}

			try {
				await context.internalAdapter.createAccount({
					userId: session.user.id,
					providerId: provider.id,
					accountId: linkingUserId,
					accessToken: idToken.accessToken,
					idToken: token,
					refreshToken: idToken.refreshToken,
					...(idToken.scopes &&
						idToken.scopes.length > 0 && { scope: idToken.scopes.join(",") }),
				});
			} catch (e: any) {
				return ctx.render(
					{
						success: False,
						message: "Account not linked - unable to create account",
					},
					417,
				);
			}

			if (
				options.account?.accountLinking?.updateUserInfoOnLink === true &&
				(linkingUserInfo.user?.name || linkingUserInfo.user?.image)
			) {
				try {
					await context.internalAdapter.updateUser(session.user.id, {
						...(linkingUserInfo.user?.name && {
							name: linkingUserInfo.user.name,
						}),
						...(linkingUserInfo.user?.image && {
							image: linkingUserInfo.user.image,
						}),
					});
				} catch (e: any) {
					console.warn("Could not update user - " + e.toString());
				}
			}

			return ctx.render({ redirect: False }, 200);
		}

		const state = await generateState(
			ctx,
			{
				userId: session.user.id,
				email: session.user.email,
			},
			options,
		);

		const url = await provider.createAuthorizationURL({
			state: state.state,
			codeVerifier: state.codeVerifier,
			redirectURI: `${context.baseURL}/callback/${provider.id}`,
			...(scopes && { scopes }),
		});

		return ctx.render({ redirect: True, url: url.toString() }, 200);
	},
);

export const unlinkAccountRoute = createRoute({
	operationId: Routes.UNLINK_ACCOUNT,
	method: "post",
	path: "/unlink-account",
	description: "Unlink an account",
	middleware: [freshSessionMiddleware],
	request: req().bdy(unlinkAccountSchema).bld(),
	responses: res(SCHEMAS[Definitions.SUCCESS].default)
		.err(400, "Account not found or failed to unlink")
		.zod<typeof unlinkAccountSchema>()
		.bld(),
});

export const unlinkAccount = createEndpoint(
	unlinkAccountRoute,
	(options) => async (ctx) => {
		const { providerId, accountId } = ctx.req.valid("json");
		const context = ctx.get("context");
		const session = ctx.get("session");

		const accounts = await context.internalAdapter.findAccounts(
			session.user.id,
		);
		if (
			accounts.length === 1 &&
			options.account?.accountLinking?.allowUnlinkingAll !== true
		)
			return ctx.render(
				{
					success: False,
					message: BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
				},
				400,
			);

		const accountExist = accounts.find((account) =>
			accountId != null
				? account.accountId === accountId && account.providerId === providerId
				: account.providerId === providerId,
		);
		if (!accountExist)
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.ACCOUNT_NOT_FOUND },
				400,
			);

		await context.internalAdapter.deleteAccount(accountExist.id);

		return ctx.render({ success: True }, 200);
	},
);

export const getAccessTokenRoute = createRoute({
	operationId: Routes.GET_ACCESS_TOKEN,
	method: "post",
	path: "/get-access-token",
	description: "Get a valid access token, doing a refresh if needed",
	middleware: [requestOnlySessionMiddleware],
	request: req().bdy(getAccessTokenSchema).bld(),
	responses: res(
		SCHEMAS[Definitions.ACCESS_TOKEN].default,
		"A valid access token",
	)
		.err(400, "Invalid refresh token or provider configuration")
		.zod<typeof getAccessTokenSchema>()
		.bld(),
});

export const getAccessToken = createEndpoint(
	getAccessTokenRoute,
	(options) => async (ctx) => {
		const { providerId, accountId, userId } = ctx.req.valid("json");

		if (userId && ctx.get("isServer") !== true)
			return ctx.render({ success: False }, 401);

		const resolvedUserId = ctx.get("session")?.user.id ?? userId;
		if (resolvedUserId == null)
			return ctx.render(
				{ success: False, message: `Either userId or session is required` },
				400,
			);

		const context = ctx.get("context");

		if (!context.socialProviders.find((p) => p.id === providerId))
			return ctx.render(
				{ success: False, message: `Provider ${providerId} is not supported.` },
				400,
			);

		const accounts = await context.internalAdapter.findAccounts(resolvedUserId);
		const account = accounts.find((acc) =>
			accountId != null
				? acc.id === accountId && acc.providerId === providerId
				: acc.providerId === providerId,
		);
		if (!account)
			return ctx.render({ success: False, message: "Account not found" }, 400);

		const provider = context.socialProviders.find((p) => p.id === providerId);
		if (!provider)
			return ctx.render(
				{ success: False, message: `Provider ${providerId} not found.` },
				400,
			);

		try {
			let newTokens: null | OAuth2Tokens = null;
			const accessTokenExpired =
				account.accessTokenExpiresAt &&
				new Date(account.accessTokenExpiresAt).getTime() - Date.now() < 5_000;

			if (
				account.refreshToken &&
				accessTokenExpired &&
				provider.refreshAccessToken
			) {
				newTokens = await provider.refreshAccessToken(account.refreshToken);
				await context.internalAdapter.updateAccount(account.id, {
					...(newTokens.accessToken && {
						accessToken: await setTokenUtil(
							newTokens.accessToken,
							ctx,
							options,
						)!,
						...(newTokens.accessTokenExpiresAt && {
							accessTokenExpiresAt: newTokens.accessTokenExpiresAt,
						}),
					}),
					...(newTokens.refreshToken && {
						refreshToken: await setTokenUtil(
							newTokens.refreshToken,
							ctx,
							options,
						)!,
						...(newTokens.refreshTokenExpiresAt && {
							refreshTokenExpiresAt: newTokens.refreshTokenExpiresAt,
						}),
					}),
				});
			}

			const tokens = {
				accessToken: await decryptOAuthToken(
					newTokens?.accessToken ?? account.accessToken ?? "",
					ctx,
					options,
				),
				...(newTokens?.accessTokenExpiresAt != null ||
				account.accessTokenExpiresAt != null
					? {
							accessTokenExpiresAt:
								newTokens?.accessTokenExpiresAt ??
								account.accessTokenExpiresAt!,
						}
					: {}),
				scopes: account.scope ? account.scope.split(",") : [],
				...(((newTokens?.idToken != null && newTokens.idToken !== "") ||
					(account.idToken != null && account.idToken !== "")) && {
					idToken: newTokens?.idToken || account.idToken!,
				}),
			} satisfies OAuth2Tokens;

			return ctx.render(tokens, 200);
		} catch {
			return ctx.render(
				{ success: False, message: "Failed to get a valid access token" },
				400,
			);
		}
	},
);

export const refreshAccessTokenRoute = createRoute({
	operationId: Routes.REFRESH_ACCESS_TOKEN,
	method: "post",
	path: "/refresh-token",
	description: "Refresh the access token using a refresh token",
	middleware: [sessionMiddleware()],
	request: req().bdy(refreshAccessTokenSchema).bld(),
	responses: res(
		SCHEMAS[Definitions.ACCESS_TOKEN].default,
		"Access token refreshed successfully",
	)
		.err(400, "Invalid refresh token or provider configuration")
		.zod<typeof refreshAccessTokenSchema>()
		.bld(),
});

export const refreshAccessToken = createEndpoint(
	refreshAccessTokenRoute,
	(options) => async (ctx) => {
		const context = ctx.get("context");
		const session = ctx.get("session");
		const { providerId, accountId, userId } = ctx.req.valid("json");

		const resolvedUserId = userId ?? session.user.id;
		if (!context.socialProviders.find((p) => p.id === providerId))
			return ctx.render(
				{ success: False, message: `Provider ${providerId} is not supported.` },
				400,
			);

		const accounts = await context.internalAdapter.findAccounts(resolvedUserId);
		const account = accounts.find((acc) =>
			accountId != null
				? acc.id === accountId && acc.providerId === providerId
				: acc.providerId === providerId,
		);
		if (account?.refreshToken == null)
			return ctx.render({ success: False, message: "Account not found" }, 400);

		const provider = context.socialProviders.find((p) => p.id === providerId);
		if (!provider)
			return ctx.render(
				{ success: False, message: `Provider ${providerId} not found.` },
				400,
			);

		if (!provider.refreshAccessToken)
			return ctx.render(
				{
					success: False,
					message: `Provider ${providerId} does not support token refreshing.`,
				},
				400,
			);

		try {
			const tokens: OAuth2Tokens = await provider.refreshAccessToken(
				account.refreshToken,
			);
			await context.internalAdapter.updateAccount(account.id, {
				...(tokens.accessToken && {
					accessToken: await setTokenUtil(tokens.accessToken, ctx, options)!,
					...(tokens.accessTokenExpiresAt && {
						accessTokenExpiresAt: tokens.accessTokenExpiresAt,
					}),
				}),
				...(tokens.refreshToken && {
					refreshToken: await setTokenUtil(tokens.refreshToken, ctx, options)!,
					...(tokens.refreshTokenExpiresAt && {
						refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
					}),
				}),
			});
			return ctx.render(tokens, 200);
		} catch {
			return ctx.render(
				{ success: False, message: "Failed to refresh access token" },
				400,
			);
		}
	},
);

export const getAccountInfoRoute = createRoute({
	operationId: Routes.GET_ACCOUNT_INFO,
	method: "post",
	path: "/account-info",
	description: "Get the account info provided by the provider",
	middleware: [sessionMiddleware()],
	request: req().bdy(getAccountInfoSchema).bld(),
	responses: res(SCHEMAS[Definitions.ACCOUNT_INFO].default)
		.err(400, "Account not found")
		.zod<typeof getAccountInfoSchema>()
		.err(500, "Provider not configured or failed to get user info")
		.bld(),
});

export const getAccountInfo = createEndpoint(
	getAccountInfoRoute,
	(_options) => async (ctx) => {
		const { accountId } = ctx.req.valid("json");
		const context = ctx.get("context");
		const session = ctx.get("session");
		const api = ctx.get("api");

		const account = await context.internalAdapter.findAccount(accountId);
		if (!account || account.userId !== session.user.id)
			return ctx.render({ success: False, message: "Account not found" }, 400);

		const provider = context.socialProviders.find(
			(p) => p.id === account.providerId,
		);

		if (!provider)
			return ctx.render(
				{
					success: False,
					message: `Provider account provider is ${account.providerId} but it is not configured`,
				},
				500,
			);

		const tokensResponse = await api.getAccessToken(
			{
				json: {
					accountId: account.id,
					providerId: account.providerId,
					userId: account.userId,
				},
			},
			ctx,
		);
		if (tokensResponse.success === false)
			return ctx.render(tokensResponse, 500);

		const info = await provider.getUserInfo({
			...tokensResponse.data,
			...(tokensResponse.data.accessTokenExpiresAt != null && {
				accessTokenExpiresAt: new Date(
					tokensResponse.data.accessTokenExpiresAt,
				),
			}),
			...(tokensResponse.data.refreshTokenExpiresAt != null && {
				refreshTokenExpiresAt: new Date(
					tokensResponse.data.refreshTokenExpiresAt,
				),
			}),
		} as OAuth2Tokens);

		if (info == null)
			return ctx.render(
				{ success: False, message: "Failed to get user info" },
				500,
			);

		return ctx.render(info, 200);
	},
);
