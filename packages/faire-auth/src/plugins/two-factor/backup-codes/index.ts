import { createRoute, req, res } from "@faire-auth/core/factory";
import { Definitions, False, SCHEMAS, True } from "@faire-auth/core/static";
import { toSuccess } from "@faire-auth/core/utils";
import { createEndpoint } from "../../../api/factory/endpoint";
import { sessionMiddleware } from "../../../api/routes/session";
import { symmetricDecrypt, symmetricEncrypt } from "../../../crypto";
import { generateRandomString } from "../../../utils";
import { safeJSONParse } from "../../../utils/json";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import {
	backupCodesResponseSchema,
	generateBackupCodesSchema,
	verifyBackupCodeSchema,
	viewBackupCodesSchema,
} from "../schema";
import type { TwoFactorProvider, TwoFactorTable } from "../types";
import { verifyTwoFactor } from "../verify-two-factor";

export interface BackupCodeOptions {
	/**
	 * The amount of backup codes to generate
	 *
	 * @default 10
	 */
	amount?: number;
	/**
	 * The length of the backup codes
	 *
	 * @default 10
	 */
	length?: number;
	/**
	 * An optional custom function to generate backup codes
	 */
	customBackupCodesGenerate?: () => string[];
	/**
	 * How to store the backup codes in the database, whether encrypted or plain.
	 */
	storeBackupCodes?:
		| "plain"
		| "encrypted"
		| {
				encrypt: (token: string) => Promise<string>;
				decrypt: (token: string) => Promise<string>;
		  };
}

function generateBackupCodesFn(options?: BackupCodeOptions | undefined) {
	return Array.from({ length: options?.amount ?? 10 })
		.fill(null)
		.map(() => generateRandomString(options?.length ?? 10, "a-z", "0-9", "A-Z"))
		.map((code) => `${code.slice(0, 5)}-${code.slice(5)}`);
}

export async function generateBackupCodes(
	secret: string,
	options?: BackupCodeOptions | undefined,
) {
	const backupCodes = options?.customBackupCodesGenerate
		? options.customBackupCodesGenerate()
		: generateBackupCodesFn(options);
	if (options?.storeBackupCodes === "encrypted") {
		const encCodes = await symmetricEncrypt({
			data: JSON.stringify(backupCodes),
			key: secret,
		});
		return {
			backupCodes,
			encryptedBackupCodes: encCodes,
		};
	}
	if (
		typeof options?.storeBackupCodes === "object" &&
		"encrypt" in options?.storeBackupCodes
	) {
		return {
			backupCodes,
			encryptedBackupCodes: await options?.storeBackupCodes.encrypt(
				JSON.stringify(backupCodes),
			),
		};
	}
	return {
		backupCodes,
		encryptedBackupCodes: JSON.stringify(backupCodes),
	};
}

export async function verifyBackupCode(
	data: {
		backupCodes: string;
		code: string;
	},
	key: string,
	options?: BackupCodeOptions | undefined,
) {
	const codes = await getBackupCodes(data.backupCodes, key, options);
	if (!codes) {
		return {
			status: false,
			updated: null,
		};
	}
	return {
		status: codes.includes(data.code),
		updated: codes.filter((code) => code !== data.code),
	};
}

export async function getBackupCodes(
	backupCodes: string,
	key: string,
	options?: BackupCodeOptions | undefined,
) {
	if (options?.storeBackupCodes === "encrypted") {
		const decrypted = await symmetricDecrypt({ key, data: backupCodes });
		return safeJSONParse<string[]>(decrypted);
	}
	if (
		typeof options?.storeBackupCodes === "object" &&
		"decrypt" in options?.storeBackupCodes
	) {
		const decrypted = await options?.storeBackupCodes.decrypt(backupCodes);
		return safeJSONParse<string[]>(decrypted);
	}

	return safeJSONParse<string[]>(backupCodes);
}

export const backupCode2fa = (options?: BackupCodeOptions) => {
	const twoFactorTable = "twoFactor";

	return {
		id: "backup_code",
		routes: {
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/verify-backup-code`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.verifyBackupCode`
			 *
			 * **client:**
			 * `authClient.twoFactor.verifyBackupCode`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/2fa#api-method-two-factor-verify-backup-code)
			 */
			verifyBackupCode: createEndpoint(
				createRoute({
					operationId: "verifyBackupCode",
					method: "post",
					path: "/two-factor/verify-backup-code",
					description: "Verify a backup code for two-factor authentication",
					request: req().bdy(verifyBackupCodeSchema).bld(),
					responses: res(
						SCHEMAS[Definitions.TOKEN_USER].default,
						"Backup code verified successfully",
					)
						.err(400, "Backup Codes not configured")
						.err(401, "Invalid backup code")
						.err(500, "Failed to create session")
						.zod<typeof verifyBackupCodeSchema>()
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const context = ctx.get("context");
					const response = await verifyTwoFactor<{
						twoFactorEnabled: boolean;
					}>(ctx, authOptions);
					if (response instanceof Response) return response;
					const { session, valid } = response;
					const twoFactor = await context.adapter.findOne<TwoFactorTable>({
						model: twoFactorTable,
						where: [{ field: "userId", value: session.user.id }],
					});
					if (!twoFactor)
						return ctx.render(
							{
								success: False,
								message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
							},
							400,
						);

					const { code, disableSession } = ctx.req.valid("json");

					const validate = await verifyBackupCode(
						{
							backupCodes: twoFactor.backupCodes,
							code,
						},
						context.secret,
						options,
					);
					if (!validate.status)
						return ctx.render(
							{
								success: False,
								message: TWO_FACTOR_ERROR_CODES.INVALID_BACKUP_CODE,
							},
							401,
						);

					const updatedBackupCodes = await symmetricEncrypt({
						key: context.secret,
						data: JSON.stringify(validate.updated),
					});

					await context.adapter.updateMany({
						model: twoFactorTable,
						update: { backupCodes: updatedBackupCodes },
						where: [{ field: "userId", value: session.user.id }],
					});

					if (!disableSession) return await valid(ctx);

					return ctx.render(
						{
							success: True,
							token: session.session?.token ?? null,
							user: session.user,
						},
						200,
					);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/two-factor/generate-backup-codes`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.generateBackupCodes`
			 *
			 * **client:**
			 * `authClient.twoFactor.generateBackupCodes`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/2fa#api-method-two-factor-generate-backup-codes)
			 */
			generateBackupCodes: createEndpoint(
				createRoute({
					operationId: "generateBackupCodes",
					method: "post",
					path: "/two-factor/generate-backup-codes",
					description:
						"Generate new backup codes for two-factor authentication",
					middleware: [
						sessionMiddleware<{
							session: { user: { twoFactorEnabled: boolean } };
						}>(),
					],
					request: req().bdy(generateBackupCodesSchema).bld(),
					responses: res(
						backupCodesResponseSchema.transform(toSuccess),
						"Backup codes generated successfully",
					)
						.err(400, "Backup Codes not configured")
						.zod<typeof generateBackupCodesSchema>()
						.bld(),
				}),
				(_authOptions) => async (ctx) => {
					const { user } = ctx.get("session");
					const context = ctx.get("context");
					if (!user.twoFactorEnabled)
						return ctx.render(
							{
								success: False,
								message: TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED,
							},
							400,
						);

					const res = await context.password.checkPassword(user.id, ctx as any);
					if (res instanceof Response) return res;

					const backupCodes = await generateBackupCodes(
						context.secret,
						options,
					);

					await context.adapter.updateMany({
						model: twoFactorTable,
						update: {
							backupCodes: backupCodes.encryptedBackupCodes,
						},
						where: [
							{
								field: "userId",
								value: user.id,
							},
						],
					});

					return ctx.render(backupCodes.backupCodes, 200);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * GET `/two-factor/view-backup-codes`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.viewBackupCodes`
			 *
			 * **client:**
			 * `authClient.twoFactor.viewBackupCodes`
			 *
			 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/2fa#api-method-two-factor-view-backup-codes)
			 */
			viewBackupCodes: createEndpoint(
				createRoute({
					operationId: "viewBackupCodes",
					method: "post",
					path: "/two-factor/view-backup-codes",
					SERVER_ONLY: true,
					request: req().bdy(viewBackupCodesSchema).bld(),
					responses: res(backupCodesResponseSchema.transform(toSuccess))
						.err(400, "Backup Codes not configured")
						.err(401, "Server only endpoint")
						.zod<typeof viewBackupCodesSchema>()
						.bld(),
				}),
				(_authOptions) => async (ctx) => {
					const context = ctx.get("context");
					if (!ctx.get("isServer"))
						return ctx.render({ success: False, message: "Unauthorized" }, 401);

					const { userId } = ctx.req.valid("json");
					const twoFactor = await context.adapter.findOne<TwoFactorTable>({
						model: twoFactorTable,
						where: [{ field: "userId", value: userId }],
					});
					if (!twoFactor)
						return ctx.render(
							{
								success: False,
								message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
							},
							400,
						);

					const decryptedBackupCodes = await getBackupCodes(
						twoFactor.backupCodes,
						context.secret,
						options,
					);
					if (!decryptedBackupCodes)
						return ctx.render(
							{
								success: False,
								message: TWO_FACTOR_ERROR_CODES.BACKUP_CODES_NOT_ENABLED,
							},
							400,
						);

					return ctx.render(decryptedBackupCodes, 200);
				},
			),
		},
	} satisfies TwoFactorProvider;
};
