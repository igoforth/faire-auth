import { base64 } from "@faire-auth/core/datatypes";
import type { FaireAuthPluginDBSchema } from "@faire-auth/core/db";
import { logger } from "@faire-auth/core/env";
import { createRoute, emailSchema, req, res } from "@faire-auth/core/factory";
import { Definitions, False, SCHEMAS, True } from "@faire-auth/core/static";
import { toSuccess } from "@faire-auth/core/utils";
import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture,
	CredentialDeviceType,
	PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/server";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import * as z from "zod";
import { createEndpoint } from "../../api/factory/endpoint";
import {
	freshSessionMiddleware,
	getSessionFromCtx,
	sessionMiddleware,
} from "../../api/routes/session";
import { mergeSchema } from "../../db/schema";
import type { FaireAuthPlugin, InferOptionSchema } from "../../types/plugin";
import { generateId, generateRandomString } from "../../utils";
import {
	getSignedCookie,
	setSessionCookie,
	setSignedCookie,
} from "../../utils/cookies";
import type { SetRequired } from "type-fest";

interface WebAuthnChallengeValue {
	expectedChallenge: string;
	userData: { id: string };
}

const getRpID = (options: PasskeyOptions, baseURL?: string) =>
	options.rpID || (baseURL ? new URL(baseURL).hostname : "localhost"); // default rpID

export interface PasskeyOptions {
	/**
	 * A unique identifier for your website. 'localhost' is okay for
	 * local dev
	 *
	 * @default "localhost"
	 */
	rpID?: string;
	/**
	 * Human-readable title for your website
	 *
	 * @default "Better Auth"
	 */
	rpName?: string;
	/**
	 * The URL at which registrations and authentications should occur.
	 * `http://localhost` and `http://localhost:PORT` are also valid.
	 * Do NOT include any trailing /
	 *
	 * if this isn't provided. The client itself will
	 * pass this value.
	 */
	origin?: string | null;

	/**
	 * Allow customization of the authenticatorSelection options
	 * during passkey registration.
	 */
	authenticatorSelection?: AuthenticatorSelectionCriteria;

	/**
	 * Advanced options
	 */
	advanced?: { webAuthnChallengeCookie?: string };
	/**
	 * Schema for the passkey model
	 */
	schema?: InferOptionSchema<typeof schema>;
}

export type Passkey = {
	id: string;
	name?: string;
	publicKey: string;
	userId: string;
	credentialID: string;
	counter: number;
	deviceType: CredentialDeviceType;
	backedUp: boolean;
	transports?: string;
	createdAt: Date;
	aaguid?: string;
};

const passkeySchema = z.object({
	id: z.string(),
	name: z.string().optional(),
	publicKey: z.string(),
	userId: z.string(),
	credentialID: z.string(),
	counter: z.number().int().nonnegative(),
	deviceType: z.enum(["singleDevice", "multiDevice"]),
	backedUp: z.boolean(),
	transports: z.string().optional(),
	createdAt: z.date().or(z.iso.datetime()),
	aaguid: z.string().optional(),
});

export const passkey = (options?: PasskeyOptions) => {
	const opts = {
		origin: null,
		...options,
		advanced: {
			webAuthnChallengeCookie: "better-auth-passkey",
			...options?.advanced,
		},
	};
	const expirationTime = new Date(Date.now() + 1000 * 60 * 5);
	const currentTime = new Date();
	const maxAgeInSeconds = Math.floor(
		(expirationTime.getTime() - currentTime.getTime()) / 1000,
	);

	const ERROR_CODES = {
		CHALLENGE_NOT_FOUND: "Challenge not found",
		YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY:
			"You are not allowed to register this passkey",
		FAILED_TO_VERIFY_REGISTRATION: "Failed to verify registration",
		PASSKEY_NOT_FOUND: "Passkey not found",
		AUTHENTICATION_FAILED: "Authentication failed",
		UNABLE_TO_CREATE_SESSION: "Unable to create session",
		FAILED_TO_UPDATE_PASSKEY: "Failed to update passkey",
	};
	return {
		id: "passkey",
		routes: {
			generatePasskeyRegistrationOptions: createEndpoint(
				createRoute({
					operationId: "generatePasskeyRegistrationOptions",
					method: "get",
					path: "/passkey/generate-register-options",
					client: false,
					description: "Generate registration options for a new passkey",
					middleware: [freshSessionMiddleware],
					request: req()
						.qry(
							z.object({
								authenticatorAttachment: z
									.enum(["platform", "cross-platform"])
									.optional()
									.openapi({
										description: `Type of authenticator to use for registration.
                                  "platform" for device-specific authenticators,
                                  "cross-platform" for authenticators that can be used across devices.`,
									}),
								name: z
									.string()
									.optional()
									.openapi({
										description: `Optional custom name for the passkey.
                                  This can help identify the passkey when managing multiple credentials.`,
									}),
							}),
						)
						.bld(),
					responses: res(
						z
							.object({
								challenge: z.base64url(),
								timeout: z.number().optional(),
								rp: z.object({
									name: z.string(),
									id: z.string().optional(),
								}),
								user: z.object({
									id: z.string(),
									name: z.string(),
									displayName: z.string(),
								}),
								pubKeyCredParams: z.array(
									z.object({ type: z.string(), alg: z.number() }),
								),
								excludeCredentials: z
									.array(
										z.object({
											id: z.string(),
											type: z.string(),
											transports: z
												.array(
													z.enum([
														"ble",
														"cable",
														"hybrid",
														"internal",
														"nfc",
														"smart-card",
														"usb",
													]),
												)
												.optional(),
										}),
									)
									.optional(),
								authenticatorSelection: z
									.object({
										authenticatorAttachment: z.string(),
										requireResidentKey: z.boolean(),
										userVerification: z.string(),
									})
									.partial()
									.optional(),
								attestation: z.string(),
								extensions: z.record(z.string(), z.any()),
							})
							.transform(toSuccess),
					)
						.err(401)
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const session = ctx.get("session");
					const { name, authenticatorAttachment } = ctx.req.valid("query");
					const userPasskeys = await ctx
						.get("context")
						.adapter.findMany<Passkey>({
							model: "passkey",
							where: [{ field: "userId", value: session.user.id }],
						});
					const userID = new TextEncoder().encode(
						generateRandomString(32, "a-z", "0-9"),
					);
					let options: SetRequired<
						PublicKeyCredentialCreationOptionsJSON,
						"attestation" | "extensions"
					>;
					// TODO: always present?
					// @ts-expect-error attestation and extensions required
					options = await generateRegistrationOptions({
						rpName: opts.rpName || ctx.get("context").appName,
						rpID: getRpID(opts, authOptions.baseURL),
						userID,
						userName: name ?? session.user.email ?? session.user.id,
						userDisplayName: session.user.email ?? session.user.id,
						attestationType: "none",
						excludeCredentials: userPasskeys.map((passkey) => ({
							id: passkey.credentialID,
							transports: passkey.transports?.split(
								",",
							) as AuthenticatorTransportFuture[],
						})),
						authenticatorSelection: {
							residentKey: "preferred",
							userVerification: "preferred",
							...(opts.authenticatorSelection ?? {}),
							...(authenticatorAttachment && { authenticatorAttachment }),
						},
					});
					const id = generateId(32);
					const webAuthnCookie = ctx
						.get("context")
						.createAuthCookie(opts.advanced.webAuthnChallengeCookie);
					await setSignedCookie(
						ctx,
						webAuthnCookie.name,
						id,
						ctx.get("context").secret,
						{ ...webAuthnCookie.attributes, maxAge: maxAgeInSeconds },
					);
					await ctx.get("context").internalAdapter.createVerificationValue({
						identifier: id,
						value: JSON.stringify({
							expectedChallenge: options.challenge,
							userData: { id: session.user.id },
						}),
						expiresAt: expirationTime,
					});
					return ctx.render(options, 200);
				},
			),
			generatePasskeyAuthenticationOptions: createEndpoint(
				createRoute({
					operationId: "generatePasskeyAuthenticationOptions",
					method: "post",
					path: "/passkey/generate-authenticate-options",
					description: "Generate authentication options for a passkey",
					request: req()
						.bdy(
							z.object({
								email: emailSchema
									.openapi({
										description: "The email address of the user",
									})
									.optional(),
							}),
						)
						.bld(),
					responses: res(
						z
							.object({
								challenge: z.base64url(),
								timeout: z.number().optional(),
								rpId: z.string().optional(),
								allowCredentials: z
									.array(
										z.object({
											id: z.string(),
											type: z.string(),
											transports: z
												.array(
													z.enum([
														"ble",
														"cable",
														"hybrid",
														"internal",
														"nfc",
														"smart-card",
														"usb",
													]),
												)
												.optional(),
										}),
									)
									.optional(),
								userVerification: z
									.enum(["discouraged", "preferred", "required"])
									.optional(),
								extensions: z.record(z.string(), z.any()).optional(),
							})
							.transform(toSuccess),
					).bld(),
				}),
				(authOptions) => async (ctx) => {
					const session = await getSessionFromCtx(ctx);
					let userPasskeys: Passkey[] = [];
					if (!(session instanceof Response)) {
						userPasskeys = await ctx.get("context").adapter.findMany<Passkey>({
							model: "passkey",
							where: [{ field: "userId", value: session.user.id }],
						});
					}
					const options = await generateAuthenticationOptions({
						rpID: getRpID(opts, authOptions.baseURL),
						userVerification: "preferred",
						...(userPasskeys.length > 0 && {
							allowCredentials: userPasskeys.map((passkey) => ({
								id: passkey.credentialID,
								transports: passkey.transports?.split(
									",",
								) as AuthenticatorTransportFuture[],
							})),
						}),
					});
					const data = {
						expectedChallenge: options.challenge,
						userData: { id: "user" in session ? session.user.id : "" },
					};
					const id = generateId(32);
					const webAuthnCookie = ctx
						.get("context")
						.createAuthCookie(opts.advanced.webAuthnChallengeCookie);
					await setSignedCookie(
						ctx,
						webAuthnCookie.name,
						id,
						ctx.get("context").secret,
						{ ...webAuthnCookie.attributes, maxAge: maxAgeInSeconds },
					);
					await ctx.get("context").internalAdapter.createVerificationValue({
						identifier: id,
						value: JSON.stringify(data),
						expiresAt: expirationTime,
					});
					return ctx.render(options, 200);
				},
			),
			verifyPasskeyRegistration: createEndpoint(
				createRoute({
					operationId: "verifyPasskeyRegistration",
					method: "post",
					path: "/passkey/verify-registration",
					description: "Verify registration of a new passkey",
					middleware: [freshSessionMiddleware],
					request: req()
						.bdy(
							z.object({
								response: z.any(),
								name: z
									.string()
									.openapi({ description: "Name of the passkey" })
									.optional(),
							}),
						)
						.bld(),
					responses: res(passkeySchema.transform(toSuccess))
						.err(400)
						.err(401)
						.err(500, "Failed to verify registration")
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const origin = options?.origin ?? ctx.req.header("origin") ?? "";
					if (!origin) return ctx.render({ success: False }, 400);
					const session = ctx.get("session");
					const { response } = ctx.req.valid("json");
					const webAuthnCookie = ctx
						.get("context")
						.createAuthCookie(opts.advanced.webAuthnChallengeCookie);
					const challengeId = await getSignedCookie(
						ctx,
						ctx.get("context").secret,
						webAuthnCookie.name,
					);
					if (!challengeId)
						return ctx.render(
							{ success: False, message: ERROR_CODES.CHALLENGE_NOT_FOUND },
							400,
						);

					const data = await ctx
						.get("context")
						.internalAdapter.findVerificationValue(challengeId);
					if (!data)
						return ctx.render(
							{
								success: False,
								message: ERROR_CODES.FAILED_TO_VERIFY_REGISTRATION,
							},
							400,
						);

					const { expectedChallenge, userData } = JSON.parse(
						data.value,
					) as WebAuthnChallengeValue;

					if (userData.id !== session.user.id)
						return ctx.render(
							{
								success: False,
								message:
									ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY,
							},
							401,
						);

					try {
						const verification = await verifyRegistrationResponse({
							response,
							expectedChallenge,
							expectedOrigin: origin,
							expectedRPID: getRpID(opts, authOptions.baseURL),
							requireUserVerification: false,
						});
						const { verified, registrationInfo } = verification;
						if (!verified || !registrationInfo)
							return ctx.render(
								{
									success: False,
									message: ERROR_CODES.FAILED_TO_VERIFY_REGISTRATION,
								},
								400,
							);

						const {
							aaguid,
							// credentialID,
							// credentialPublicKey,
							// counter,
							credentialDeviceType,
							credentialBackedUp,
							credential,
							// credentialType,
						} = registrationInfo;
						const pubKey = base64.encode(credential.publicKey);
						const newPasskey: Omit<Passkey, "id"> = {
							name: ctx.body.name,
							userId: userData.id,
							credentialID: credential.id,
							publicKey: pubKey,
							counter: credential.counter,
							deviceType: credentialDeviceType,
							transports: response.response.transports.join(","),
							backedUp: credentialBackedUp,
							createdAt: new Date(),
							aaguid: aaguid,
						};
						const newPasskeyRes = await ctx
							.get("context")
							.adapter.create<Omit<Passkey, "id">, Passkey>({
								model: "passkey",
								data: newPasskey,
							});
						return ctx.render(newPasskeyRes, 200);
					} catch (e) {
						logger.error(String(e));
						return ctx.render(
							{
								success: False,
								message: ERROR_CODES.FAILED_TO_VERIFY_REGISTRATION,
							},
							500,
						);
					}
				},
			),
			verifyPasskeyAuthentication: createEndpoint(
				createRoute({
					operationId: "verifyPasskeyAuthentication",
					method: "post",
					path: "/passkey/verify-authentication",
					description: "Verify authentication of a passkey",
					$Infer: { body: {} as { response: AuthenticationResponseJSON } },
					request: req()
						.bdy(
							z.object({
								response: z.record(z.string(), z.any()),
							}) as unknown as z.ZodType<
								{ response: AuthenticationResponseJSON },
								{ response: AuthenticationResponseJSON }
							>,
						)
						.bld(),
					responses: res(SCHEMAS[Definitions.SESSION_RESPONSE].default)
						.err(400, "Origin missing, challenge not found, or auth failed")
						.err(401, "Passkey not found or auth failed")
						.err(500, "User not found or unable to create session")
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const origin = options?.origin ?? ctx.req.header("origin") ?? "";
					if (!origin)
						return ctx.render(
							{ success: False, message: "Origin missing" },
							400,
						);
					const { response } = ctx.req.valid("json");
					const webAuthnCookie = ctx
						.get("context")
						.createAuthCookie(opts.advanced.webAuthnChallengeCookie);
					const challengeId = await getSignedCookie(
						ctx,
						ctx.get("context").secret,
						webAuthnCookie.name,
					);
					if (!challengeId)
						return ctx.render(
							{ success: False, message: ERROR_CODES.CHALLENGE_NOT_FOUND },
							400,
						);

					const data = await ctx
						.get("context")
						.internalAdapter.findVerificationValue(challengeId);
					if (!data)
						return ctx.render(
							{ success: False, message: ERROR_CODES.CHALLENGE_NOT_FOUND },
							400,
						);

					const { expectedChallenge } = JSON.parse(
						data.value,
					) as WebAuthnChallengeValue;
					const passkey = await ctx.get("context").adapter.findOne<Passkey>({
						model: "passkey",
						where: [{ field: "credentialID", value: response["id"] }],
					});
					if (!passkey)
						return ctx.render(
							{ success: False, message: ERROR_CODES.PASSKEY_NOT_FOUND },
							401,
						);

					try {
						const verification = await verifyAuthenticationResponse({
							response: response as AuthenticationResponseJSON,
							expectedChallenge,
							expectedOrigin: origin,
							expectedRPID: getRpID(opts, authOptions.baseURL),
							credential: {
								id: passkey.credentialID,
								publicKey: base64.decode(
									passkey.publicKey,
								) as Uint8Array<ArrayBuffer>,
								counter: passkey.counter,
								transports: passkey.transports?.split(
									",",
								) as AuthenticatorTransportFuture[],
							},
							requireUserVerification: false,
						});
						const { verified } = verification;
						if (!verified)
							return ctx.render(
								{ success: False, message: ERROR_CODES.AUTHENTICATION_FAILED },
								401,
							);

						await ctx.get("context").adapter.update<Passkey>({
							model: "passkey",
							where: [{ field: "id", value: passkey.id }],
							update: { counter: verification.authenticationInfo.newCounter },
						});
						const s = await ctx
							.get("context")
							.internalAdapter.createSession(passkey.userId);
						if (!s) {
							return ctx.render(
								{
									success: False,
									message: ERROR_CODES.UNABLE_TO_CREATE_SESSION,
								},
								500,
							);
						}
						const user = await ctx
							.get("context")
							.internalAdapter.findUserById(passkey.userId);
						if (!user) {
							return ctx.render(
								{ success: False, message: "User not found" },
								500,
							);
						}
						await setSessionCookie(ctx, authOptions, { session: s, user });
						return ctx.render(s, 200);
					} catch (e) {
						ctx
							.get("context")
							.logger.error("Failed to verify authentication", e);
						return ctx.render(
							{ success: False, message: ERROR_CODES.AUTHENTICATION_FAILED },
							400,
						);
					}
				},
			),
			/**
			 * ### Endpoint
			 *
			 * GET `/passkey/list-user-passkeys`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.listPasskeys`
			 *
			 * **client:**
			 * `authClient.passkey.listUserPasskeys`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/passkey#api-method-passkey-list-user-passkeys)
			 */
			listPasskeys: createEndpoint(
				createRoute({
					operationId: "listPasskeys",
					method: "get",
					path: "/passkey/list-user-passkeys",
					description: "List all passkeys for the authenticated user",
					middleware: [sessionMiddleware()],
					responses: res(
						z
							.array(passkeySchema)
							.openapi({
								description:
									"Array of passkey objects associated with the user",
							})
							.transform(toSuccess),
					)
						.err(401)
						.bld(),
				}),
				(_authOptions) => async (ctx) => {
					const session = ctx.get("session");
					const passkeys = await ctx.get("context").adapter.findMany<Passkey>({
						model: "passkey",
						where: [{ field: "userId", value: session.user.id }],
					});
					return ctx.render(passkeys, 200);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/passkey/delete-passkey`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.deletePasskey`
			 *
			 * **client:**
			 * `authClient.passkey.deletePasskey`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/passkey#api-method-passkey-delete-passkey)
			 */
			deletePasskey: createEndpoint(
				createRoute({
					operationId: "deletePasskey",
					method: "post",
					path: "/passkey/delete-passkey",
					description: "Delete a specific passkey",
					middleware: [sessionMiddleware()],
					request: req()
						.bdy(
							z.object({
								id: z.string().openapi({
									description:
										'The ID of the passkey to delete. Eg: "some-passkey-id"',
								}),
							}),
						)
						.bld(),
					responses: res(
						SCHEMAS[Definitions.SUCCESS].default,
						"Passkey deleted successfully",
					)
						.err(401)
						.bld(),
				}),
				(_authOptions) => async (ctx) => {
					await ctx.get("context").adapter.delete<Passkey>({
						model: "passkey",
						where: [{ field: "id", value: ctx.req.valid("json").id }],
					});
					return ctx.render({ success: True }, 200);
				},
			),
			/**
			 * ### Endpoint
			 *
			 * POST `/passkey/update-passkey`
			 *
			 * ### API Methods
			 *
			 * **server:**
			 * `auth.api.updatePasskey`
			 *
			 * **client:**
			 * `authClient.passkey.updatePasskey`
			 *
			 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/passkey#api-method-passkey-update-passkey)
			 */
			updatePasskey: createEndpoint(
				createRoute({
					operationId: "updatePasskey",
					method: "post",
					path: "/passkey/update-passkey",
					description: "Update a specific passkey's name",
					middleware: [sessionMiddleware()],
					request: req()
						.bdy(
							z.object({
								id: z.string().openapi({
									description: `The ID of the passkey which will be updated. Eg: \"passkey-id\"`,
								}),
								name: z.string().openapi({
									description: `The new name which the passkey will be updated to. Eg: \"my-new-passkey-name\"`,
								}),
							}),
						)
						.bld(),
					responses: res(passkeySchema.transform(toSuccess))
						.err(401, "Invalid session or not allowed to register")
						.err(404, "Passkey not found")
						.err(500, "Failed to update passkey")
						.bld(),
				}),
				(_authOptions) => async (ctx) => {
					const session = ctx.get("session");
					const { id, name } = ctx.req.valid("json");
					const passkey = await ctx.get("context").adapter.findOne<Passkey>({
						model: "passkey",
						where: [{ field: "id", value: id }],
					});

					if (!passkey)
						return ctx.render(
							{ success: False, message: ERROR_CODES.PASSKEY_NOT_FOUND },
							404,
						);

					if (passkey.userId !== session.user.id)
						return ctx.render(
							{
								success: False,
								message:
									ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY,
							},
							401,
						);

					const updatedPasskey = await ctx
						.get("context")
						.adapter.update<Passkey>({
							model: "passkey",
							where: [{ field: "id", value: id }],
							update: { name },
						});

					if (!updatedPasskey)
						return ctx.render(
							{ success: False, message: ERROR_CODES.FAILED_TO_UPDATE_PASSKEY },
							500,
						);

					return ctx.render(updatedPasskey, 200);
				},
			),
		},
		schema: mergeSchema(schema, options?.schema),
		$ERROR_CODES: ERROR_CODES,
	} satisfies FaireAuthPlugin;
};

const schema = {
	passkey: {
		fields: {
			name: { type: "string", required: false },
			publicKey: { type: "string", required: true },
			userId: {
				type: "string",
				references: { model: "user", field: "id" },
				required: true,
			},
			credentialID: { type: "string", required: true },
			counter: { type: "number", required: true },
			deviceType: { type: "string", required: true },
			backedUp: { type: "boolean", required: true },
			transports: { type: "string", required: false },
			createdAt: { type: "date", required: false },
			aaguid: { type: "string", required: false },
		},
	},
} satisfies FaireAuthPluginDBSchema;
