import { createHMAC, createOTP } from "@faire-auth/core/datatypes";
import type { User } from "@faire-auth/core/db";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import { Definitions, False, SCHEMAS, True } from "@faire-auth/core/static";
import { toSuccess } from "@faire-auth/core/utils";
import { createEndpoint } from "../../api/factory/endpoint";
import { createHook } from "../../api/factory/middleware";
import { sessionMiddleware } from "../../api/routes/session";
import { symmetricEncrypt, validatePassword } from "../../crypto";
import { mergeSchema } from "../../db/schema";
import type { FaireAuthPlugin } from "../../types/plugin";
import { generateRandomString } from "../../utils";
import {
	deleteSessionCookie,
	getSignedCookie,
	setSessionCookie,
	setSignedCookie,
} from "../../utils/cookies";
import { backupCode2fa, generateBackupCodes } from "./backup-codes";
import {
	TRUST_DEVICE_COOKIE_MAX_AGE,
	TRUST_DEVICE_COOKIE_NAME,
	TWO_FACTOR_COOKIE_NAME,
} from "./constant";
import { TWO_FACTOR_ERROR_CODES } from "./error-code";
import { otp2fa } from "./otp";
import {
	disableTwoFactorSchema,
	enableTwoFactorSchema,
	schema,
	totpURISchema,
} from "./schema";
import { totp2fa } from "./totp";
import type { TwoFactorOptions, UserWithTwoFactor } from "./types";

export * from "./error-code";

export const twoFactor = (options?: TwoFactorOptions) => {
	const opts = { twoFactorTable: "twoFactor" };
	const backupCodeOptions = {
		storeBackupCodes: "encrypted" as const,
		...options?.backupCodeOptions,
	};
	const totp = totp2fa(options?.totpOptions);
	const backupCode = backupCode2fa(backupCodeOptions);
	const otp = otp2fa(options?.otpOptions);

	return {
		id: "two-factor",
		routes: {
			...totp.routes,
			...otp.routes,
			...backupCode.routes,
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/enable`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.enableTwoFactor`
			 *
			 * **client:**
			 * `authClient.twoFactor.enable`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/2fa#api-method-two-factor-enable)
			 */
			enableTwoFactor: createEndpoint(
				createRoute({
					operationId: "enableTwoFactor",
					method: "post",
					path: "/two-factor/enable",
					summary: "Enable two factor authentication",
					description:
						"Use this endpoint to enable two factor authentication. This will generate a TOTP URI and backup codes. Once the user verifies the TOTP URI, the two factor authentication will be enabled.",
					middleware: [sessionMiddleware()],
					request: req().bdy(enableTwoFactorSchema).bld(),
					responses: res(totpURISchema.transform(toSuccess))
						.err(400, "Invalid password")
						.err(500, "Failed to update user")
						.zod<typeof enableTwoFactorSchema>()
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const session = ctx.get("session");
					const context = ctx.get("context");
					const user = session.user as UserWithTwoFactor;
					const { password, issuer } = ctx.req.valid("json");

					const isPasswordValid = await validatePassword(ctx, {
						password,
						userId: user.id,
					});
					if (!isPasswordValid)
						return ctx.render(
							{ success: False, message: BASE_ERROR_CODES.INVALID_PASSWORD },
							400,
						);

					const secret = generateRandomString(32);
					const encryptedSecret = await symmetricEncrypt({
						key: context.secret,
						data: secret,
					});
					const backupCodes = await generateBackupCodes(
						context.secret,
						backupCodeOptions,
					);
					if (options?.skipVerificationOnEnable === true) {
						const updatedUser = await context.internalAdapter.updateUser(
							user.id,
							{ twoFactorEnabled: true },
						);
						if (updatedUser == null)
							return ctx.render(
								{
									success: False,
									message: BASE_ERROR_CODES.FAILED_TO_UPDATE_USER,
								},
								500,
							);
						const newSession = await context.internalAdapter.createSession(
							updatedUser.id!,
							false,
							session.session,
						);
						/**
						 * Update the session cookie with the new user data
						 */
						await setSessionCookie(ctx, authOptions, {
							session: newSession,
							user: updatedUser as User,
						});

						//remove current session
						await context.internalAdapter.deleteSession(session.session.token);
					}
					//delete existing two factor
					await context.adapter.deleteMany({
						model: opts.twoFactorTable,
						where: [{ field: "userId", value: user.id }],
					});

					await context.adapter.create({
						model: opts.twoFactorTable,
						data: {
							secret: encryptedSecret,
							backupCodes: backupCodes.encryptedBackupCodes,
							userId: user.id,
						},
					});
					const totpURI = createOTP(secret, {
						digits: options?.totpOptions?.digits ?? 6,
						period: options?.totpOptions?.period,
					}).url(issuer ?? options?.issuer ?? context.appName, user.email);
					return ctx.render(
						{ totpURI, backupCodes: backupCodes.backupCodes },
						200,
					);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/disable`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.disableTwoFactor`
			 *
			 * **client:**
			 * `authClient.twoFactor.disable`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/2fa#api-method-two-factor-disable)
			 */
			disableTwoFactor: createEndpoint(
				createRoute({
					operationId: "disableTwoFactor",
					method: "post",
					path: "/two-factor/disable",
					summary: "Disable two factor authentication",
					description:
						"Use this endpoint to disable two factor authentication.",
					middleware: [sessionMiddleware()],
					request: req().bdy(disableTwoFactorSchema).bld(),
					responses: res(SCHEMAS[Definitions.SUCCESS].default)
						.err(400, "Invalid password")
						.err(500, "Failed to update user")
						.zod<typeof disableTwoFactorSchema>()
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const context = ctx.get("context");
					const session = ctx.get("session");
					const user = session.user as UserWithTwoFactor;
					const { password } = ctx.req.valid("json");
					const isPasswordValid = await validatePassword(ctx, {
						password,
						userId: user.id,
					});
					if (!isPasswordValid)
						return ctx.render(
							{ success: False, message: "Invalid password" },
							400,
						);

					const updatedUser = await context.internalAdapter.updateUser(
						user.id,
						{ twoFactorEnabled: false },
					);
					if (updatedUser == null)
						return ctx.render(
							{
								success: False,
								message: BASE_ERROR_CODES.FAILED_TO_UPDATE_USER,
							},
							500,
						);
					await context.adapter.delete({
						model: opts.twoFactorTable,
						where: [{ field: "userId", value: updatedUser.id! }],
					});
					const newSession = await context.internalAdapter.createSession(
						updatedUser.id!,
						false,
						session.session,
					);
					/**
					 * Update the session cookie with the new user data
					 */
					await setSessionCookie(ctx, authOptions, {
						session: newSession,
						user: updatedUser,
					});
					//remove current session
					await context.internalAdapter.deleteSession(session.session.token);
					return ctx.render({ success: True }, 200);
				},
			),
		},
		options: options ?? {},

		hooks: {
			after: [
				{
					matcher: (ctx) =>
						ctx.get("path") === "/sign-in/email" ||
						ctx.get("path") === "/sign-in/username" ||
						ctx.get("path") === "/sign-in/phone-number",
					handler: (_opts) =>
						createHook()(async (ctx) => {
							const context = ctx.get("context");
							const data = context.newSession;
							if (!data) return;
							if (!data.user.twoFactorEnabled) return;

							const trustDeviceCookieAttrs = context.createAuthCookie(
								TRUST_DEVICE_COOKIE_NAME,
								{ maxAge: TRUST_DEVICE_COOKIE_MAX_AGE },
							);
							// Check for trust device cookie
							const trustDeviceCookie = await getSignedCookie(
								ctx,
								context.secret,
								trustDeviceCookieAttrs.name,
							);
							if (trustDeviceCookie) {
								const [token, sessionToken] = trustDeviceCookie.split("!");
								const expectedToken = await createHMAC(
									"SHA-256",
									"base64urlnopad",
								).sign(context.secret, `${data.user.id}!${sessionToken}`);

								if (token === expectedToken) {
									// Trust device cookie is valid, refresh it and skip 2FA
									const newTrustDeviceCookie = context.createAuthCookie(
										TRUST_DEVICE_COOKIE_NAME,
										{
											maxAge: TRUST_DEVICE_COOKIE_MAX_AGE,
										},
									);
									const newToken = await createHMAC(
										"SHA-256",
										"base64urlnopad",
									).sign(
										context.secret,
										`${data.user.id}!${data.session.token}`,
									);
									await setSignedCookie(
										ctx,
										newTrustDeviceCookie.name,
										`${newToken}!${data.session.token}`,
										context.secret,
										trustDeviceCookieAttrs.attributes,
									);
									return;
								}
							}

							/**
							 * remove the session cookie. It's set by the sign in credential
							 */
							deleteSessionCookie(ctx, true);
							await context.internalAdapter.deleteSession(data.session.token);
							const maxAge = (options?.otpOptions?.period ?? 3) * 60; // 3 minutes
							const twoFactorCookie = context.createAuthCookie(
								TWO_FACTOR_COOKIE_NAME,
								{ maxAge },
							);
							const identifier = `2fa-${generateRandomString(20)}`;
							await context.internalAdapter.createVerificationValue({
								value: data.user.id,
								identifier,
								expiresAt: new Date(Date.now() + maxAge * 1000),
							});
							await setSignedCookie(
								ctx,
								twoFactorCookie.name,
								identifier,
								context.secret,
								twoFactorCookie.attributes,
							);
							return ctx.render({ twoFactorRedirect: True }, 200);
						}),
				},
			],
		},
		schema: mergeSchema(schema, options?.schema),
		rateLimit: [
			{
				pathMatcher: (path) => path.startsWith("/two-factor/"),
				window: 10,
				max: 3,
			},
		],
		$ERROR_CODES: TWO_FACTOR_ERROR_CODES,
	} satisfies FaireAuthPlugin;
};

export * from "./client";
export type * from "./types";
