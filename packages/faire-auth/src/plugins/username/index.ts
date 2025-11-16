import type { Account, Session, User } from "@faire-auth/core/db";
import { logger } from "@faire-auth/core/env";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import { Definitions, False, SCHEMAS, True } from "@faire-auth/core/static";
import type { LiteralStringUnion } from "@faire-auth/core/types";
import type { Context } from "hono";
import * as z from "zod";
import { createEndpoint } from "../../api/factory/endpoint";
import { createEmailVerificationToken } from "../../api/routes/email-verification";
import { mergeSchema } from "../../db/schema";
import type {
	ContextVars,
	FaireAuthPlugin,
	InferOptionSchema,
} from "../../types";
import { setSessionCookie } from "../../utils/cookies";
import { USERNAME_ERROR_CODES as ERROR_CODES } from "./error-codes";
import type { UsernameSchema } from "./schema";
import { getSchema } from "./schema";

export * from "./error-codes";
export interface UsernameOptions {
	schema?: InferOptionSchema<UsernameSchema>;
	/**
	 * The minimum length of the username
	 *
	 * @default 3
	 */
	minUsernameLength?: number;
	/**
	 * The maximum length of the username
	 *
	 * @default 30
	 */
	maxUsernameLength?: number;
	/**
	 * A function to validate the username
	 *
	 * By default, the username should only contain alphanumeric characters and underscores
	 */
	usernameValidator?: (username: string) => boolean | Promise<boolean>;
	/**
	 * A function to validate the display username
	 *
	 * By default, no validation is applied to display username
	 */
	displayUsernameValidator?: (
		displayUsername: string,
	) => boolean | Promise<boolean>;
	/**
	 * A function to normalize the username
	 *
	 * @default (username) => username.toLowerCase()
	 */
	usernameNormalization?: ((username: string) => string) | false;
	/**
	 * A function to normalize the display username
	 *
	 * @default false
	 */
	displayUsernameNormalization?: ((displayUsername: string) => string) | false;
	/**
	 * The order of validation
	 *
	 * @default { username: "pre-normalization", displayUsername: "pre-normalization" }
	 */
	validationOrder?: {
		/**
		 * The order of username validation
		 *
		 * @default "pre-normalization"
		 */
		username?: "pre-normalization" | "post-normalization";
		/**
		 * The order of display username validation
		 *
		 * @default "pre-normalization"
		 */
		displayUsername?: "pre-normalization" | "post-normalization";
	};
}

function defaultUsernameValidator(username: string) {
	return /^[a-zA-Z0-9_.]+$/.test(username);
}

export const username = (options?: UsernameOptions) => {
	const normalizer = (username: string) => {
		if (options?.usernameNormalization === false) return username;

		if (options?.usernameNormalization)
			return options.usernameNormalization(username);

		return username.toLowerCase();
	};

	const displayUsernameNormalizer = (displayUsername: string) => {
		return options?.displayUsernameNormalization
			? options.displayUsernameNormalization(displayUsername)
			: displayUsername;
	};

	// TODO: Created updateJson in utils/hono to move back to hooks if desired
	const shimUsername = async <V extends object>(
		input:
			| {
					target: LiteralStringUnion<"json">;
					success: true;
					data: {
						username?: string | undefined;
						displayUsername?: string | undefined;
						[x: string]: unknown;
					};
			  }
			| { success: false; error: z.ZodError<unknown> },
		ctx: Context<
			ContextVars<V & { session: { session: Session; user: User } }>
		>,
	) => {
		// return if validation unsuccessful
		if (input.success === false) return;
		// return with warning if context not available
		if (!ctx.get("context")) {
			logger.warn("Context not available for username plugin in route hook");
			return;
		}

		const session = ctx.get("session");
		const username =
			typeof input.data.username === "string" &&
			options?.validationOrder?.username === "post-normalization"
				? normalizer(input.data.username)
				: input.data.username;

		if (username !== undefined && typeof username === "string") {
			const minUsernameLength = options?.minUsernameLength || 3;
			const maxUsernameLength = options?.maxUsernameLength || 30;
			if (username.length < minUsernameLength)
				return ctx.render(
					{ success: False, message: ERROR_CODES.USERNAME_TOO_SHORT },
					400,
				);

			if (username.length > maxUsernameLength)
				return ctx.render(
					{ success: False, message: ERROR_CODES.USERNAME_TOO_LONG },
					400,
				);

			const validator = options?.usernameValidator ?? defaultUsernameValidator;

			const valid = await validator(username);
			if (!valid)
				return ctx.render(
					{ success: False, message: ERROR_CODES.INVALID_USERNAME },
					400,
				);

			const user = await ctx.get("context")!.adapter.findOne<User>({
				model: "user",
				where: [{ field: "username", value: username }],
			});

			const blockChangeSignUp = ctx.get("path") === "/sign-up/email" && user;
			const blockChangeUpdateUser =
				ctx.get("path") === "/update-user" &&
				user &&
				session &&
				user.id !== session.session.userId;
			if (blockChangeSignUp || blockChangeUpdateUser)
				return ctx.render(
					{ success: False, message: ERROR_CODES.USERNAME_IS_ALREADY_TAKEN },
					400,
				);
		}

		const displayUsername =
			typeof input.data.displayUsername === "string" &&
			options?.validationOrder?.displayUsername === "post-normalization"
				? displayUsernameNormalizer(input.data.displayUsername)
				: input.data.displayUsername;

		if (displayUsername !== undefined && typeof displayUsername === "string") {
			if (options?.displayUsernameValidator) {
				const valid = await options.displayUsernameValidator(displayUsername);
				if (!valid)
					return ctx.render(
						{ success: False, message: ERROR_CODES.INVALID_DISPLAY_USERNAME },
						400,
					);
			}
		}

		input.data.displayUsername ||= input.data.username;
		input.data.username ||= input.data.displayUsername;

		return;
	};

	return {
		id: "username",
		init: (_ctx) => {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async before(user, _context) {
									const username =
										"username" in user ? (user["username"] as string) : null;
									const displayUsername =
										"displayUsername" in user
											? (user["displayUsername"] as string)
											: null;

									return {
										data: {
											...user,
											...(username ? { username: normalizer(username) } : {}),
											...(displayUsername
												? {
														displayUsername:
															displayUsernameNormalizer(displayUsername),
													}
												: {}),
										},
									};
								},
							},
							update: {
								async before(user, _context) {
									const username =
										"username" in user ? (user["username"] as string) : null;
									const displayUsername =
										"displayUsername" in user
											? (user["displayUsername"] as string)
											: null;

									return {
										data: {
											...user,
											...(username ? { username: normalizer(username) } : {}),
											...(displayUsername
												? {
														displayUsername:
															displayUsernameNormalizer(displayUsername),
													}
												: {}),
										},
									};
								},
							},
						},
					},
				},
			};
		},
		routes: {
			signInUsername: createEndpoint(
				createRoute({
					operationId: "signInUsername",
					method: "post",
					path: "/sign-in/username",
					summary: "Sign in with username",
					description: "Sign in with username",
					request: req()
						.bdy(
							z.object({
								username: z
									.string()
									.openapi({ description: "The username of the user" }),
								password: z
									.string()
									.openapi({ description: "The password of the user" }),
								rememberMe: z
									.boolean()
									.openapi({ description: "Remember the user session" })
									.optional(),
								callbackURL: z
									.string()
									.openapi({
										description:
											"The URL to redirect to after email verification",
									})
									.optional(),
							}),
						)
						.bld(),
					responses: res(SCHEMAS[Definitions.TOKEN_USER].default)
						.err(400, "Invalid username")
						.err(401, "Invalid email or password")
						.err(403, "Email not verified")
						.err(500, "Failed to create session")
						.bld(),
				}),
				(authOptions) => async (ctx) => {
					const context = ctx.get("context");
					let { username, password, rememberMe, callbackURL } =
						ctx.req.valid("json");

					if (!username || !password) {
						context.logger.error("Username or password not found");
						return ctx.render(
							{
								success: False,
								message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
							},
							401,
						);
					}

					username =
						options?.validationOrder?.username === "pre-normalization"
							? normalizer(username)
							: username;

					const minUsernameLength = options?.minUsernameLength ?? 3;
					const maxUsernameLength = options?.maxUsernameLength ?? 30;

					if (username.length < minUsernameLength) {
						context.logger.error("Username too short", { username });
						return ctx.render(
							{ success: False, message: ERROR_CODES.USERNAME_TOO_SHORT },
							400,
						);
					}

					if (username.length > maxUsernameLength) {
						context.logger.error("Username too long", { username });
						return ctx.render(
							{ success: False, message: ERROR_CODES.USERNAME_TOO_LONG },
							400,
						);
					}

					const validator =
						options?.usernameValidator ?? defaultUsernameValidator;

					if (!validator(username)) {
						return ctx.render(
							{ success: False, message: ERROR_CODES.INVALID_USERNAME },
							400,
						);
					}

					const user = await context.adapter.findOne<
						User & { username: string; displayUsername: string }
					>({
						model: "user",
						where: [{ field: "username", value: normalizer(username) }],
					});
					if (!user) {
						// Hash password to prevent timing attacks from revealing valid usernames
						// By hashing passwords for invalid usernames, we ensure consistent response times
						await context.password.hash(password);
						context.logger.error("User not found", { username });
						return ctx.render(
							{
								success: False,
								message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
							},
							401,
						);
					}

					const account = await context.adapter.findOne<Account>({
						model: "account",
						where: [
							{ field: "userId", value: user.id },
							{ field: "providerId", value: "credential" },
						],
					});
					if (!account) {
						return ctx.render(
							{
								success: False,
								message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
							},
							401,
						);
					}
					const currentPassword = account?.password;
					if (!currentPassword) {
						context.logger.error("Password not found", { username });
						return ctx.render(
							{
								success: False,
								message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
							},
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
							{
								success: False,
								message: ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
							},
							401,
						);
					}

					if (
						authOptions?.emailAndPassword?.requireEmailVerification &&
						!user.emailVerified
					) {
						if (!authOptions?.emailVerification?.sendVerificationEmail)
							return ctx.render(
								{ success: False, message: ERROR_CODES.EMAIL_NOT_VERIFIED },
								403,
							);

						if (authOptions?.emailVerification?.sendOnSignIn) {
							const token = await createEmailVerificationToken(
								context.secret,
								user.email,
								undefined,
								authOptions.emailVerification?.expiresIn,
							);
							const url = `${context.baseURL}/verify-email?token=${token}${
								callbackURL ? `&callbackURL=${callbackURL}` : ""
							}`;
							await authOptions.emailVerification.sendVerificationEmail(
								{
									user: user,
									url,
									token,
								},
								ctx,
							);
						}
						return ctx.render(
							{ success: False, message: ERROR_CODES.EMAIL_NOT_VERIFIED },
							403,
						);
					}

					const session = await context.internalAdapter.createSession(
						user.id,
						rememberMe === false,
					);
					if (!session) {
						return ctx.render(
							{
								success: False,
								message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
							},
							500,
						);
					}
					await setSessionCookie(
						ctx,
						authOptions,
						{ session, user },
						rememberMe === false,
					);
					return ctx.render(
						{
							success: True,
							token: session.token,
							user: {
								id: user.id,
								email: user.email,
								emailVerified: user.emailVerified,
								username: user.username,
								displayUsername: user.displayUsername,
								...(user.name && { name: user.name }),
								...(user.image !== undefined && {
									image: user.image as string | null,
								}),
								createdAt: user.createdAt,
								updatedAt: user.updatedAt,
							},
						},
						200,
					);
				},
			),
			isUsernameAvailable: createEndpoint(
				createRoute({
					operationId: "isUsernameAvailable",
					method: "post",
					path: "/is-username-available",
					request: req()
						.bdy(
							z.object({
								username: z
									.string()
									.openapi({ description: "The username to check" }),
							}),
						)
						.bld(),
					responses: res(
						z.object({ available: z.boolean() }),
						"Whether or not the username is available",
					)
						.err(400, "Invalid username")
						.bld(),
				}),
				(_authOptions) => async (ctx) => {
					const context = ctx.get("context");
					const { username } = ctx.req.valid("json");
					// if (!username)
					//   return ctx.render('UNPROCESSABLE_ENTITY', {
					//     message: ERROR_CODES.INVALID_USERNAME,
					//   })

					const minUsernameLength = options?.minUsernameLength || 3;
					const maxUsernameLength = options?.maxUsernameLength || 30;

					if (username.length < minUsernameLength)
						return ctx.render(
							{ success: False, message: ERROR_CODES.USERNAME_TOO_SHORT },
							400,
						);

					if (username.length > maxUsernameLength)
						return ctx.render(
							{ success: False, message: ERROR_CODES.USERNAME_TOO_LONG },
							400,
						);

					const validator =
						options?.usernameValidator || defaultUsernameValidator;

					if (!(await validator(username)))
						return ctx.render(
							{ success: False, message: ERROR_CODES.INVALID_USERNAME },
							400,
						);

					const user = await context.adapter.findOne<User>({
						model: "user",
						where: [{ field: "username", value: normalizer(username) }],
					});
					if (user) return ctx.render({ available: false }, 200);

					return ctx.render({ available: true }, 200);
				},
			),
		},
		schema: mergeSchema(
			getSchema({
				username: normalizer,
				displayUsername: displayUsernameNormalizer,
			}),
			options?.schema,
		),
		routeHooks: { signUpEmail: shimUsername, updateUser: shimUsername },

		// hooks: {
		//   before: [
		//     {
		//       matcher: (ctx) =>
		//         ctx.get('path') === '/sign-up/email'
		//         || ctx.get('path') === '/update-user',
		//       handler: (_opts) =>
		//         createHook<
		//           { session?: { session: Session; user: User } },
		//           string,
		//           {
		//             out: {
		//               json: {
		//                 username?: string | undefined
		//                 displayUsername?: string | undefined
		//               }
		//             }
		//           }
		//         >()(async (ctx) => {
		//           const session = ctx.get('session')
		//           let validJson = ctx.req.valid('json')
		//           const username =
		//             (
		//               typeof validJson.username === 'string'
		//               && options?.validationOrder?.username === 'post-normalization'
		//             ) ?
		//               normalizer(validJson.username)
		//             : validJson.username

		//           if (username !== undefined && typeof username === 'string') {
		//             const minUsernameLength = options?.minUsernameLength || 3
		//             const maxUsernameLength = options?.maxUsernameLength || 30
		//             if (username.length < minUsernameLength) {
		//               return ctx.json(
		//                 { success: False, message: ERROR_CODES.USERNAME_TOO_SHORT },
		//                 400,
		//               )
		//             }

		//             if (username.length > maxUsernameLength) {
		//               return ctx.json(
		//                 { success: False, message: ERROR_CODES.USERNAME_TOO_LONG },
		//                 400,
		//               )
		//             }

		//             const validator =
		//               options?.usernameValidator ?? defaultUsernameValidator

		//             const valid = await validator(username)
		//             if (!valid)
		//               return ctx.json(
		//                 { success: False, message: ERROR_CODES.INVALID_USERNAME },
		//                 400,
		//               )

		//             const user = await ctx.get("context").adapter.findOne<User>({
		//               model: 'user',
		//               where: [{ field: 'username', value: username }],
		//             })

		//             const blockChangeSignUp =
		//               ctx.get('path') === '/sign-up/email' && user
		//             const blockChangeUpdateUser =
		//               ctx.get('path') === '/update-user'
		//               && user
		//               && session
		//               && user.id !== session.session.userId
		//             if (blockChangeSignUp || blockChangeUpdateUser) {
		//               return ctx.json(
		//                 {
		//                   success: False,
		//                   message: ERROR_CODES.USERNAME_IS_ALREADY_TAKEN,
		//                 },
		//                 400,
		//               )
		//             }
		//           }

		//           const displayUsername =
		//             (
		//               typeof validJson.displayUsername === 'string'
		//               && options?.validationOrder?.displayUsername
		//                 === 'post-normalization'
		//             ) ?
		//               displayUsernameNormalizer(validJson.displayUsername)
		//             : validJson.displayUsername

		//           if (
		//             displayUsername !== undefined
		//             && typeof displayUsername === 'string'
		//           ) {
		//             if (options?.displayUsernameValidator) {
		//               const valid =
		//                 await options.displayUsernameValidator(displayUsername)
		//               if (!valid)
		//                 return ctx.json(
		//                   {
		//                     success: False,
		//                     message: ERROR_CODES.INVALID_DISPLAY_USERNAME,
		//                   },
		//                   400,
		//                 )
		//             }
		//           }

		//           return
		//         }),
		//     },
		//     {
		//       matcher: (ctx) =>
		//         ctx.get('path') === '/sign-up/email'
		//         || ctx.get('path') === '/update-user',
		//       handler: (_opts) =>
		//         createHook<
		//           object,
		//           string,
		//           {
		//             out: {
		//               json: {
		//                 username?: string | undefined
		//                 displayUsername?: string | undefined
		//               }
		//             }
		//           }
		//         >()(async (ctx) => {
		//           const validJson = ctx.req.valid('json')
		//           validJson.displayUsername ||= validJson.username
		//           validJson.username ||= validJson.displayUsername
		//           return
		//         }),
		//     },
		//   ],
		// },
		$ERROR_CODES: ERROR_CODES,
	} satisfies FaireAuthPlugin;
};
