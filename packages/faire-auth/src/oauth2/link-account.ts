import type { Account, Session, User } from "@faire-auth/core/db";
import { isDevelopment, logger } from "@faire-auth/core/env";
import { APIError } from "@faire-auth/core/error";
import type { Context, TypedResponse } from "hono";
import { createEmailVerificationToken } from "../api/routes/email-verification";
import type { ContextVars } from "../types/hono";
import type { FaireAuthOptions } from "../types/options";
import { setTokenUtil } from "./utils";
import type { ExK } from "@faire-auth/core/types";

type OAuthError =
	| "account_not_linked"
	| "unable_to_link_account"
	| "unable_to_create_user"
	| "unable_to_create_session"
	| "internal_server_error"
	| "signup_disabled"
	| (string & {});

export const handleOAuthUserInfo = async (
	ctx: Context<ContextVars>,
	{
		userInfo,
		account,
		callbackURL,
		disableSignUp,
		overrideUserInfo,
	}: {
		userInfo: ExK<User, "createdAt" | "updatedAt">;
		account: ExK<Account, "createdAt" | "id" | "updatedAt" | "userId">;
		callbackURL?: string;
		disableSignUp?: boolean;
		overrideUserInfo?: boolean;
	},
	options: Pick<
		FaireAuthOptions,
		"account" | "emailVerification" | "onAPIError"
	>,
): Promise<
	| {
			type: "success";
			data: { session: Session; user: User };
			isRegister: boolean;
	  }
	| {
			type: "redirect";
			response: Response & TypedResponse<undefined, 302, "redirect">;
	  }
	| { type: "error"; reason: OAuthError; isRegister?: false }
> => {
	const context = ctx.get("context");
	const redirectOnError = (
		reason: OAuthError,
	): {
		type: "redirect";
		response: Response & TypedResponse<undefined, 302, "redirect">;
	} => {
		const errorURL = options.onAPIError?.errorURL ?? `${context.baseURL}/error`;
		return {
			type: "redirect",
			response: ctx.redirect(`${errorURL}?error=${reason}`, 302),
		};
	};

	const dbUser = await context.internalAdapter
		.findOAuthUser(
			userInfo.email.toLowerCase(),
			account.accountId,
			account.providerId,
		)
		.catch((e: unknown) => {
			logger.error(
				"Better auth was unable to query your database.\nError: ",
				e,
			);
			return "error" as const;
		});
	if (dbUser === "error") return redirectOnError("internal_server_error");
	// If we already produced a redirect, bail out early
	// if (dbUser && "type" in dbUser) return dbUser;

	let user = dbUser?.user ?? null;
	const isRegister = user == null;

	if (dbUser) {
		const hasBeenLinked = dbUser.accounts.find(
			(a) =>
				a.providerId === account.providerId &&
				a.accountId === account.accountId,
		);
		if (!hasBeenLinked) {
			const trustedProviders =
				options.account?.accountLinking?.trustedProviders;
			const isTrustedProvider = trustedProviders?.includes(
				account.providerId as "apple",
			);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				options.account?.accountLinking?.enabled === false
			) {
				if (isDevelopment()) {
					logger.warn(
						`User already exist but account isn't linked to ${account.providerId}. To read more about how account linking works in Faire Auth see https://www.faire-auth.com/docs/concepts/users-accounts#account-linking.`,
					);
				}
				return { type: "error", reason: "account_not_linked" };
			}
			try {
				await context.internalAdapter.linkAccount({
					providerId: account.providerId,
					accountId: userInfo.id.toString(),
					userId: dbUser.user.id,
					accessToken: await setTokenUtil(account.accessToken, ctx, options),
					refreshToken: await setTokenUtil(account.refreshToken, ctx, options),
					idToken: account.idToken,
					accessTokenExpiresAt: account.accessTokenExpiresAt,
					refreshTokenExpiresAt: account.refreshTokenExpiresAt,
					scope: account.scope,
				});
			} catch (e) {
				logger.error("Unable to link account", e);
				return {
					type: "error",
					reason: "unable_to_link_account",
				};
			}

			if (
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			)
				await context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
		} else {
			if (options.account?.updateAccountOnSignIn !== false) {
				const updateData = Object.fromEntries(
					Object.entries({
						idToken: account.idToken,
						accessToken: await setTokenUtil(account.accessToken, ctx, options),
						refreshToken: await setTokenUtil(
							account.refreshToken,
							ctx,
							options,
						),
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
					}).filter(([, value]) => value !== undefined && value !== ""),
				);

				if (Object.keys(updateData).length > 0) {
					await context.internalAdapter.updateAccount(
						hasBeenLinked.id,
						updateData,
					);
				}
			}

			if (
				userInfo.emailVerified &&
				!dbUser.user.emailVerified &&
				userInfo.email.toLowerCase() === dbUser.user.email
			)
				await context.internalAdapter.updateUser(dbUser.user.id, {
					emailVerified: true,
				});
		}
		if (overrideUserInfo === true) {
			const { id: _, ...restUserInfo } = userInfo;
			// update user info from the provider if overrideUserInfo is true
			await context.internalAdapter.updateUser(dbUser.user.id, {
				...restUserInfo,
				email: userInfo.email.toLowerCase(),
				emailVerified:
					userInfo.email.toLowerCase() === dbUser.user.email
						? dbUser.user.emailVerified || userInfo.emailVerified
						: userInfo.emailVerified,
			});
		}
	} else {
		if (disableSignUp === true)
			return { type: "error", reason: "signup_disabled", isRegister: false };

		try {
			const { id: _, ...restUserInfo } = userInfo;
			user = await context.internalAdapter
				.createOAuthUser(
					{ ...restUserInfo, email: userInfo.email.toLowerCase() },
					{
						accessToken: await setTokenUtil(account.accessToken, ctx, options),
						refreshToken: await setTokenUtil(
							account.refreshToken,
							ctx,
							options,
						),
						idToken: account.idToken,
						accessTokenExpiresAt: account.accessTokenExpiresAt,
						refreshTokenExpiresAt: account.refreshTokenExpiresAt,
						scope: account.scope,
						providerId: account.providerId,
						accountId: userInfo.id.toString(),
					},
				)
				.then((res) => res.user);
			if (
				!userInfo.emailVerified &&
				user &&
				options.emailVerification?.sendOnSignUp === true
			) {
				const token = await createEmailVerificationToken(
					context.secret,
					user.email,
					undefined,
					options.emailVerification.expiresIn,
				);
				const url = `${context.baseURL}/verify-email?token=${token}${callbackURL ? `&callbackURL=${callbackURL}` : ""}`;
				await options.emailVerification.sendVerificationEmail?.(
					{ user, url, token },
					ctx,
				);
			}
		} catch (e: unknown) {
			logger.error(e instanceof Error ? e.message : String(e), e);
			if (e instanceof APIError)
				return { type: "error", reason: e.message, isRegister: false };

			return {
				type: "error",
				reason: "unable_to_create_user",
				isRegister: false,
			};
		}
	}
	if (!user)
		return {
			type: "error",
			reason: "unable_to_create_user",
			isRegister: false,
		};

	const session = await context.internalAdapter.createSession(user.id);
	if (!session)
		return {
			type: "error",
			reason: "unable_to_create_session",
			isRegister: false,
		};

	return { type: "success", data: { session, user }, isRegister };
};
