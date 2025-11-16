import { SCHEMAS } from "@faire-auth/core/static";
import { Definitions } from "@faire-auth/core/static";
import { req, res } from "@faire-auth/core/factory";
import { createEndpoint } from "../../../api/factory/endpoint";
import { createRoute } from "@faire-auth/core/factory";
import { sessionMiddleware } from "../../../api/routes/session";
import { symmetricDecrypt } from "../../../crypto";
import { createOTP } from "@faire-auth/core/datatypes";
import type { User } from "../../../types/models";
import { False } from "@faire-auth/core/static";
import { setSessionCookie } from "../../../utils/cookies";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { toSuccess } from "@faire-auth/core/utils";
import type { BackupCodeOptions } from "../backup-codes";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import {
	generateTOTPResponseSchema,
	generateTOTPSchema,
	getTOTPURIResponseSchema,
	getTOTPURISchema,
	verifyTOTPSchema,
} from "../schema";
import type { TwoFactorProvider, TwoFactorTable } from "../types";
import { verifyTwoFactor } from "../verify-two-factor";

export type TOTPOptions = {
	/**
	 * Issuer
	 */
	issuer?: string;
	/**
	 * How many digits the otp to be
	 *
	 * @default 6
	 */
	digits?: 6 | 8;
	/**
	 * Period for otp in seconds.
	 * @default 30
	 */
	period?: number;
	/**
	 * Backup codes configuration
	 */
	backupCodes?: BackupCodeOptions;
	/**
	 * Disable totp
	 */
	disable?: boolean;
};

export const totp2fa = (options?: TOTPOptions) => {
	const opts = {
		...options,
		digits: options?.digits ?? 6,
		period: options?.period ?? 30,
	};

	const twoFactorTable = "twoFactor";

	const generateTOTP = createEndpoint(
		createRoute({
			operationId: "generateTOTP",
			method: "post",
			path: "/totp/generate",
			SERVER_ONLY: true,
			summary: "Generate TOTP code",
			description: "Use this endpoint to generate a TOTP code",
			request: req().bdy(generateTOTPSchema).bld(),
			responses: res(generateTOTPResponseSchema.transform(toSuccess))
				.err(400, "TOTP isn't configured")
				.zod<typeof generateTOTPSchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			if (options?.disable === true) {
				ctx
					.get("context")
					.logger.error(
						"TOTP isn't configured. Please pass totp option on two factor plugin to enable totp",
					);
				return ctx.render(
					{ success: False, message: "TOTP isn't configured" },
					400,
				);
			}
			const code = await createOTP(ctx.req.valid("json").secret, {
				period: opts.period,
				digits: opts.digits,
			}).totp();
			return ctx.json(code, 200);
		},
	);

	const getTOTPURI = createEndpoint(
		createRoute({
			operationId: "getTOTPURI",
			method: "post",
			path: "/two-factor/get-totp-uri",
			summary: "Get TOTP URI",
			description: "Use this endpoint to get the TOTP URI",
			middleware: [
				sessionMiddleware<{
					session: { user: { twoFactorEnabled: boolean } };
				}>(),
			],
			request: req().bdy(getTOTPURISchema).bld(),
			responses: res(getTOTPURIResponseSchema.transform(toSuccess))
				.err(400, "TOTP isn't enabled")
				.zod<typeof getTOTPURISchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const context = ctx.get("context");
			if (options?.disable) {
				context.logger.error(
					"TOTP isn't configured. Please pass totp option on two factor plugin to enable totp",
				);
				return ctx.render(
					{ success: False, message: "TOTP isn't configured" },
					400,
				);
			}
			const session = ctx.get("session");
			const twoFactor = await context.adapter.findOne<TwoFactorTable>({
				model: twoFactorTable,
				where: [{ field: "userId", value: session.user.id }],
			});
			if (!twoFactor) {
				return ctx.render(
					{ success: False, message: TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED },
					400,
				);
			}
			const secret = await symmetricDecrypt({
				key: context.secret,
				data: twoFactor.secret,
			});
			const res = await context.password.checkPassword(session.user.id, ctx);
			if (res instanceof Response) return res;

			const totpURI = createOTP(secret, {
				digits: opts.digits,
				period: opts.period,
			}).url(options?.issuer ?? context.appName, session.user.email);
			return ctx.render(totpURI, 200);
		},
	);

	const verifyTOTP = createEndpoint(
		createRoute({
			operationId: "verifyTOTP",
			method: "post",
			path: "/two-factor/verify-totp",
			summary: "Verify two factor TOTP",
			description: "Verify two factor TOTP",
			request: req().bdy(verifyTOTPSchema).bld(),
			responses: res(SCHEMAS[Definitions.TOKEN_USER].default)
				.err(400, "TOTP isn't enabled or failed to create session")
				.err(401, "TOTP Error")
				.err(500, "Failed to update user")
				.zod<typeof verifyTOTPSchema>()
				.bld(),
		}),
		(authOptions) => async (ctx) => {
			const context = ctx.get("context");
			if (options?.disable === true) {
				context.logger.error(
					"totp isn't configured. please pass totp option on two factor plugin to enable totp",
				);
				return ctx.render(
					{ success: False, message: "TOTP isn't configured" },
					400,
				);
			}
			const result = await verifyTwoFactor<{ twoFactorEnabled: boolean }>(
				ctx,
				authOptions,
			);
			if (result instanceof Response) return result;
			const { session, valid, invalid } = result;
			const twoFactor = await context.adapter.findOne<TwoFactorTable>({
				model: twoFactorTable,
				where: [{ field: "userId", value: session.user.id }],
			});

			if (!twoFactor)
				return ctx.render(
					{ success: False, message: TWO_FACTOR_ERROR_CODES.TOTP_NOT_ENABLED },
					400,
				);

			const decrypted = await symmetricDecrypt({
				key: context.secret,
				data: twoFactor.secret,
			});
			const status = await createOTP(decrypted, {
				period: opts.period,
				digits: opts.digits,
			}).verify(ctx.req.valid("json").code);
			if (!status) return await invalid("INVALID_CODE");

			if (!session.user.twoFactorEnabled) {
				if (!session.session) {
					return ctx.render(
						{
							success: False,
							message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
						},
						400,
					);
				}
				const updatedUser = await context.internalAdapter.updateUser(
					session.user.id,
					{ twoFactorEnabled: true },
				);
				if (updatedUser == null)
					return ctx.render(
						{ success: False, message: BASE_ERROR_CODES.FAILED_TO_UPDATE_USER },
						500,
					);
				const newSession = await context.internalAdapter.createSession(
					session.user.id,
					false,
					session.session,
				);

				await context.internalAdapter.deleteSession(session.session.token);
				await setSessionCookie(ctx, authOptions, {
					session: newSession,
					user: updatedUser as User,
				});
			}
			return await valid(ctx);
		},
	);

	return {
		id: "totp",
		routes: {
			/**
			 * ### Endpoint
			 *
			 * POST `/totp/generate`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.generateTOTP`
			 *
			 * **client:**
			 * `authClient.totp.generate`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/totp#api-method-totp-generate)
			 */
			generateTOTP,
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/get-totp-uri`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.getTOTPURI`
			 *
			 * **client:**
			 * `authClient.twoFactor.getTotpUri`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/two-factor#api-method-two-factor-get-totp-uri)
			 */
			getTOTPURI,
			verifyTOTP,
		},
	} satisfies TwoFactorProvider;
};
