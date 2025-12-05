import * as z from "zod";
import { looseAccountSchema } from "../db/schema/account";
import { looseSessionSchema } from "../db/schema/session";
import { looseUserSchema } from "../db/schema/user";
import { looseVerificationSchema } from "../db/schema/verification";
import {
	createSchema,
	createTokenUserSchema,
	dateOrIsoStringSchema,
	emailSchema,
	redirectUrlSchema,
	scopesStringOrArraySchema,
	stringOrNumberIdSchema,
	type SchemaRegistry,
} from "../factory/schema";
import { toSuccess } from "../utils/schema";
import { Definitions } from "./definitions";

const DEFAULT_SCHEMAS = (() => {
	const core = {
		[Definitions.ACCOUNT]: createSchema(looseAccountSchema, {
			id: Definitions.ACCOUNT,
		}),
		[Definitions.USER]: createSchema(looseUserSchema, { id: Definitions.USER }),
		[Definitions.SESSION]: createSchema(looseSessionSchema, {
			id: Definitions.SESSION,
		}),
		[Definitions.VERIFICATION]: createSchema(looseVerificationSchema, {
			id: Definitions.VERIFICATION,
		}),
	};

	const tokenUserSchema = createTokenUserSchema(core[Definitions.USER].schema);

	const dependees = {
		[Definitions.TOKEN_USER]: createSchema(
			tokenUserSchema.transform(toSuccess),
			{ id: Definitions.TOKEN_USER },
			{ _self: Definitions.TOKEN_USER, data: { user: Definitions.USER } },
		),
		[Definitions.REDIRECT_URL]: createSchema(
			redirectUrlSchema.transform(toSuccess),
			{ id: Definitions.REDIRECT_URL },
		),
	};

	return {
		...core,
		...dependees,

		[Definitions.ACCOUNT_RESPONSE]: createSchema(
			core[Definitions.ACCOUNT].schema.transform(toSuccess),
			{ id: Definitions.ACCOUNT_RESPONSE },
			{ _self: Definitions.ACCOUNT_RESPONSE, data: Definitions.ACCOUNT },
		),

		[Definitions.USER_RESPONSE]: createSchema(
			core[Definitions.USER].schema.transform(toSuccess),
			{ id: Definitions.USER_RESPONSE },
			{ _self: Definitions.USER_RESPONSE, data: Definitions.USER },
		),

		[Definitions.SESSION_RESPONSE]: createSchema(
			core[Definitions.SESSION].schema.transform(toSuccess),
			{ id: Definitions.SESSION_RESPONSE },
			{ _self: Definitions.SESSION_RESPONSE, data: Definitions.SESSION },
		),

		[Definitions.VERIFICATION_RESPONSE]: createSchema(
			core[Definitions.VERIFICATION].schema.transform(toSuccess),
			{ id: Definitions.VERIFICATION_RESPONSE },
			{
				_self: Definitions.VERIFICATION_RESPONSE,
				data: Definitions.VERIFICATION,
			},
		),

		[Definitions.SESSIONS_LIST]: createSchema(
			z.array(core[Definitions.SESSION].schema).transform(toSuccess),
			{ id: Definitions.SESSIONS_LIST },
			{
				_self: Definitions.SESSIONS_LIST,
				data: { _inner: Definitions.SESSION },
			},
		),

		[Definitions.SESSION_USER]: createSchema(
			z
				.object({
					session: core[Definitions.SESSION].schema,
					user: core[Definitions.USER].schema,
				})
				.transform(toSuccess),
			{ id: Definitions.SESSION_USER },
			{
				_self: Definitions.SESSION_USER,
				data: { session: Definitions.SESSION, user: Definitions.USER },
			},
		),

		[Definitions.ACCOUNTS_LIST]: createSchema(
			z
				.array(
					core[Definitions.ACCOUNT].schema
						.pick({
							id: true,
							providerId: true,
							accountId: true,
							createdAt: true,
							updatedAt: true,
						})
						.extend({ scopes: scopesStringOrArraySchema }),
				)
				.transform(toSuccess),
			{ id: Definitions.ACCOUNTS_LIST },
		),

		[Definitions.ACCOUNT_INFO]: createSchema(
			z
				.object({
					user: core[Definitions.USER].schema
						.pick({ name: true, image: true, emailVerified: true })
						.extend({
							id: stringOrNumberIdSchema,
							email: emailSchema.nullish(),
						}),
					data: z.record(z.string(), z.any()),
				})
				.transform(toSuccess),
			{ id: Definitions.ACCOUNT_INFO },
		),

		[Definitions.ACCESS_TOKEN]: createSchema(
			z
				.object({
					tokenType: z.string(),
					accessToken: z.string(),
					refreshToken: z.string(),
					accessTokenExpiresAt: dateOrIsoStringSchema,
					refreshTokenExpiresAt: dateOrIsoStringSchema,
					scopes: scopesStringOrArraySchema,
					idToken: z.string(),
				})
				.partial()
				.transform(toSuccess),
			{ id: Definitions.ACCESS_TOKEN },
		),

		[Definitions.SIGN_IN_UP]: createSchema(
			z.intersection(tokenUserSchema, redirectUrlSchema).transform(toSuccess),
			{ id: Definitions.SIGN_IN_UP },
			{ _self: Definitions.SIGN_IN_UP, data: { user: Definitions.USER } },
		),

		[Definitions.SUCCESS]: createSchema(
			z.object({
				success: z
					.literal(true)
					.openapi({ description: "Indicates successful operation" }),
				message: z
					.string()
					.optional()
					.openapi({ description: "An optional message" }),
			}),
			{ id: Definitions.SUCCESS },
		),

		[Definitions.ERROR]: createSchema(
			z.object({
				success: z
					.literal(false)
					.openapi({ description: "Indicates failed operation" }),
				code: z
					.string()
					.optional()
					.openapi({ description: "An optional error code" }),
				message: z
					.string()
					.optional()
					.openapi({ description: "An optional message" }),
			}),
			{ id: Definitions.ERROR },
		),
	};
})();

/**
 * Schema registry with dependencies.
 */
export const SCHEMAS = {
	[Definitions.SUCCESS]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.SUCCESS].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.SUCCESS].build(options),
	},

	[Definitions.ERROR]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.ERROR].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.ERROR].build(options),
	},

	[Definitions.ACCOUNT]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.ACCOUNT].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.ACCOUNT].build(options),
	},

	[Definitions.ACCOUNT_RESPONSE]: {
		dependencies: [Definitions.ACCOUNT, Definitions.SUCCESS],
		default: DEFAULT_SCHEMAS[Definitions.ACCOUNT_RESPONSE].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.ACCOUNT_RESPONSE].build(options),
	},

	[Definitions.USER]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.USER].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.USER].build(options),
	},

	[Definitions.USER_RESPONSE]: {
		dependencies: [Definitions.USER],
		default: DEFAULT_SCHEMAS[Definitions.USER_RESPONSE].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.USER_RESPONSE].build(options),
	},

	[Definitions.SESSION]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.SESSION].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.SESSION].build(options),
	},

	[Definitions.SESSION_RESPONSE]: {
		dependencies: [Definitions.SESSION],
		default: DEFAULT_SCHEMAS[Definitions.SESSION_RESPONSE].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.SESSION_RESPONSE].build(options),
	},

	[Definitions.VERIFICATION]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.VERIFICATION].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.VERIFICATION].build(options),
	},

	[Definitions.VERIFICATION_RESPONSE]: {
		dependencies: [Definitions.VERIFICATION],
		default: DEFAULT_SCHEMAS[Definitions.VERIFICATION_RESPONSE].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.VERIFICATION_RESPONSE].build(options),
	},

	[Definitions.SESSIONS_LIST]: {
		dependencies: [Definitions.SESSION],
		default: DEFAULT_SCHEMAS[Definitions.SESSIONS_LIST].schema,
		build: (schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.SESSIONS_LIST].build(options, {
				schema: z.array(schemas[Definitions.SESSION]).transform(toSuccess),
			}),
	},

	[Definitions.SESSION_USER]: {
		dependencies: [Definitions.SESSION, Definitions.USER],
		default: DEFAULT_SCHEMAS[Definitions.SESSION_USER].schema,
		build: (schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.SESSION_USER].build(options, {
				schema: z
					.object({
						session: schemas[Definitions.SESSION],
						user: schemas[Definitions.USER],
					})
					.transform(toSuccess),
			}),
	},

	[Definitions.ACCESS_TOKEN]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.ACCESS_TOKEN].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.ACCESS_TOKEN].build(options),
	},

	[Definitions.ACCOUNTS_LIST]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.ACCOUNTS_LIST].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.ACCOUNTS_LIST].build(options),
	},

	[Definitions.ACCOUNT_INFO]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.ACCOUNT_INFO].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.ACCOUNT_INFO].build(options),
	},

	[Definitions.TOKEN_USER]: {
		dependencies: [Definitions.USER],
		default: DEFAULT_SCHEMAS[Definitions.TOKEN_USER].schema,
		build: (schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.TOKEN_USER].build(options, {
				schema: z
					.discriminatedUnion("success", [
						z.object({
							success: z.literal(true),
							token: z
								.string()
								.nullable()
								.default(null)
								.openapi({ description: "Session token" }),
							user: schemas[Definitions.USER],
						}),
						z.object({
							success: z.literal(false),
							token: z.null().default(null),
							user: z.null().default(null),
						}),
					])
					.transform(toSuccess),
			}),
	},

	[Definitions.REDIRECT_URL]: {
		dependencies: [],
		default: DEFAULT_SCHEMAS[Definitions.REDIRECT_URL].schema,
		build: (_schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.REDIRECT_URL].build(options),
	},

	[Definitions.SIGN_IN_UP]: {
		dependencies: [Definitions.USER],
		default: DEFAULT_SCHEMAS[Definitions.SIGN_IN_UP].schema,
		build: (schemas, options) =>
			DEFAULT_SCHEMAS[Definitions.SIGN_IN_UP].build(options, {
				schema: z
					.intersection(
						// TODO: This would be great if it worked but the toSuccess
						// transforms still run even though we dig for 'in'
						// schemas[Definitions.TOKEN_USER].def.in,
						// schemas[Definitions.REDIRECT_URL].def.in,
						z.discriminatedUnion("success", [
							z.object({
								success: z.literal(true),
								token: z
									.string()
									.nullable()
									.default(null)
									.openapi({ description: "Session token" }),
								user: schemas[Definitions.USER],
							}),
							z.object({
								success: z.literal(false),
								token: z.null().default(null),
								user: z.null().default(null),
							}),
						]),
						z.discriminatedUnion("redirect", [
							z.object({
								redirect: z.literal(false),
								url: z.null().default(null),
							}),
							z.object({ redirect: z.literal(true), url: z.url() }),
						]),
					)
					.transform(toSuccess),
			}),
	},

	// TODO: header validation is cool but maybe too much for right now
	// [Definitions.REDIRECT_HEADER]: (() => {
	//   const def = registerSchema(
	//     z.object({
	//       location: z
	//         .url()
	//         .openapi({
	//           description:
	//             'Redirects to a callbackURL depending on the state of the request.',
	//         }),
	//     }),
	//     Definitions.REDIRECT_HEADER,
	//   )

	//   return {
	//     dependencies: [],
	//     default: def,
	//     build: (_schemas, options) => {
	//       const built = applyDTOTransform(
	//         def,
	//         Definitions.REDIRECT_HEADER,
	//         options,
	//       )
	//       registry.register(Definitions.REDIRECT_HEADER, built)
	//       return built
	//     },
	//   }
	// })(),
} as const satisfies SchemaRegistry;
