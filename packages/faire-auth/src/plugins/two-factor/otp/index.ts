import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import { Definitions, False, SCHEMAS, True } from "@faire-auth/core/static";
import type { Context, HonoRequest } from "hono";
import { createEndpoint } from "../../../api/factory/endpoint";
import {
	generateRandomString,
	symmetricDecrypt,
	symmetricEncrypt,
} from "../../../crypto";
import type { ContextVars } from "../../../types/hono";
import { setSessionCookie } from "../../../utils/cookies";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import { sendTwoFactorOTPSchema, verifyTwoFactorOTPSchema } from "../schema";
import type { TwoFactorProvider, UserWithTwoFactor } from "../types";
import { defaultKeyHasher } from "../utils";
import { verifyTwoFactor } from "../verify-two-factor";
import type { User } from "@faire-auth/core/db";

export interface OTPOptions {
	/**
	 * How long the opt will be valid for in
	 * minutes
	 *
	 * @default "3 mins"
	 */
	period?: number;
	/**
	 * Number of digits for the OTP code
	 *
	 * @default 6
	 */
	digits?: number;
	/**
	 * Send the otp to the user
	 *
	 * @param user - The user to send the otp to
	 * @param otp - The otp to send
	 * @param request - The request object
	 * @returns void | Promise<void>
	 */
	sendOTP?: (
		/**
		 * The user to send the otp to
		 * @type UserWithTwoFactor
		 * @default UserWithTwoFactors
		 */
		data: { user: UserWithTwoFactor; otp: string },
		/**
		 * The request object
		 */
		request?: HonoRequest,
	) => Promise<void> | void;
	/**
	 * The number of allowed attempts for the OTP
	 *
	 * @default 5
	 */
	allowedAttempts?: number;
	storeOTP?:
		| "plain"
		| "encrypted"
		| "hashed"
		| { hash: (token: string) => Promise<string> }
		| {
				encrypt: (token: string) => Promise<string>;
				decrypt: (token: string) => Promise<string>;
		  };
}

/**
 * The otp adapter is created from the totp adapter.
 */
export const otp2fa = (options?: OTPOptions) => {
	const opts = {
		storeOTP: "plain",
		digits: 6,
		...options,
		period: (options?.period || 3) * 60 * 1000,
	};

	async function storeOTP(ctx: Context<ContextVars>, otp: string) {
		if (opts.storeOTP === "hashed") return await defaultKeyHasher(otp);

		if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP)
			return await opts.storeOTP.hash(otp);

		if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP)
			return await opts.storeOTP.encrypt(otp);

		if (opts.storeOTP === "encrypted")
			return await symmetricEncrypt({
				key: ctx.get("context").secret,
				data: otp,
			});

		return otp;
	}

	async function decryptOTP(ctx: Context<ContextVars>, otp: string) {
		if (opts.storeOTP === "hashed") return await defaultKeyHasher(otp);

		if (opts.storeOTP === "encrypted")
			return await symmetricDecrypt({
				key: ctx.get("context").secret,
				data: otp,
			});

		if (typeof opts.storeOTP === "object" && "encrypt" in opts.storeOTP)
			return await opts.storeOTP.decrypt(otp);

		if (typeof opts.storeOTP === "object" && "hash" in opts.storeOTP)
			return await opts.storeOTP.hash(otp);

		return otp;
	}

	/**
	 * Generate OTP and send it to the user.
	 */
	const send2FaOTP = createEndpoint(
		createRoute({
			operationId: "sendTwoFactorOTP",
			method: "post",
			path: "/two-factor/send-otp",
			summary: "Send two factor OTP",
			description: "Send two factor OTP to the user",
			request: req().bdy(sendTwoFactorOTPSchema).bld(),
			responses: res(SCHEMAS[Definitions.SUCCESS].default)
				.err(400, "OTP isn't configured")
				.err(401, "OTP error")
				.zod<typeof sendTwoFactorOTPSchema>()
				.bld(),
		}),
		(authOptions) => async (ctx) => {
			const context = ctx.get("context");
			if (!options || !options.sendOTP) {
				context.logger.error(
					"send otp isn't configured. Please configure the send otp function on otp options.",
				);
				return ctx.render(
					{ success: False, message: "OTP isn't configured" },
					400,
				);
			}
			const response = await verifyTwoFactor<{ twoFactorEnabled: boolean }>(
				ctx,
				authOptions,
			);
			if (response instanceof Response) return response;
			const { session, key } = response;
			if (!session.user.twoFactorEnabled) {
				return ctx.render(
					{ success: False, message: TWO_FACTOR_ERROR_CODES.OTP_NOT_ENABLED },
					400,
				);
			}
			const code = generateRandomString(opts.digits, "0-9");
			const hashedCode = await storeOTP(ctx, code);
			await context.internalAdapter.createVerificationValue({
				value: `${hashedCode}:0`,
				identifier: `2fa-otp-${key}`,
				expiresAt: new Date(Date.now() + opts.period),
			});
			await options.sendOTP({ user: session.user, otp: code }, ctx.req);
			return ctx.render({ success: True }, 200);
		},
	);

	const verifyOTP = createEndpoint(
		createRoute({
			operationId: "verifyTwoFactorOTP",
			method: "post",
			path: "/two-factor/verify-otp",
			summary: "Verify two factor OTP",
			description: "Verify two factor OTP",
			request: req().bdy(verifyTwoFactorOTPSchema).bld(),
			responses: res(
				SCHEMAS[Definitions.TOKEN_USER].default,
				"Two-factor OTP verified successfully",
			)
				.err(400, "OTP isn't enabled or failed to create session")
				.err(401, "OTP Error")
				.err(500, "Failed to update user")
				.zod<typeof verifyTwoFactorOTPSchema>()
				.bld(),
		}),
		(authOptions) => async (ctx) => {
			const context = ctx.get("context");
			const response = await verifyTwoFactor<{ twoFactorEnabled: boolean }>(
				ctx,
				authOptions,
			);
			if (response instanceof Response) return response;
			const { session, key, valid, invalid } = response;
			const toCheckOtp = await context.internalAdapter.findVerificationValue(
				`2fa-otp-${key}`,
			);
			const [otp, counter] = toCheckOtp?.value?.split(":") || [];
			if (!counter || !otp)
				return ctx.render(
					{ success: False, message: TWO_FACTOR_ERROR_CODES.INVALID_CODE },
					400,
				);
			const decryptedOtp = await decryptOTP(ctx, otp);
			if (!toCheckOtp || toCheckOtp.expiresAt < new Date()) {
				if (toCheckOtp) {
					await context.internalAdapter.deleteVerificationValue(toCheckOtp.id);
				}
				return ctx.render(
					{ success: False, message: TWO_FACTOR_ERROR_CODES.OTP_HAS_EXPIRED },
					400,
				);
			}
			const allowedAttempts = options?.allowedAttempts ?? 5;
			if (parseInt(counter) >= allowedAttempts) {
				await context.internalAdapter.deleteVerificationValue(toCheckOtp.id);
				return ctx.render(
					{
						success: False,
						message: TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE,
					},
					400,
				);
			}
			if (decryptedOtp === ctx.req.valid("json").code) {
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
						{
							twoFactorEnabled: true,
						},
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
						session.user.id,
						false,
						session.session,
					);
					await context.internalAdapter.deleteSession(session.session.token);
					await setSessionCookie(ctx, authOptions, {
						session: newSession,
						user: updatedUser as User,
					});
					return ctx.render(
						{ success: True, token: newSession.token, user: updatedUser },
						200,
					);
				}
				return await valid(ctx);
			} else {
				await context.internalAdapter.updateVerificationValue(toCheckOtp.id, {
					value: `${otp}:${(parseInt(counter, 10) ?? 0) + 1}`,
				});
				return await invalid("INVALID_CODE");
			}
		},
	);

	return {
		id: "otp",
		routes: {
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/send-otp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.send2FaOTP`
			 *
			 * **client:**
			 * `authClient.twoFactor.sendOtp`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/2fa#api-method-two-factor-send-otp)
			 */
			sendTwoFactorOTP: send2FaOTP,
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/verify-otp`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyOTP`
			 *
			 * **client:**
			 * `authClient.twoFactor.verifyOtp`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/2fa#api-method-two-factor-verify-otp)
			 */
			verifyTwoFactorOTP: verifyOTP,
		},
	} satisfies TwoFactorProvider;
};
