import * as z from "zod";
import {
	dateOrIsoStringSchema,
	stringOrNumberIdSchema,
} from "../../factory/schema";
import type { ExV } from "../../types/helper";
import { coreSchema } from "./shared";

export const accountSchema = coreSchema.extend({
	providerId: z.string(),
	accountId: stringOrNumberIdSchema,
	userId: z.coerce.string(),
	accessToken: z.string().nullish(),
	refreshToken: z.string().nullish(),
	idToken: z.string().nullish(),
	/**
	 * Access token expires at
	 */
	accessTokenExpiresAt: dateOrIsoStringSchema.nullish(),
	/**
	 * Refresh token expires at
	 */
	refreshTokenExpiresAt: dateOrIsoStringSchema.nullish(),
	/**
	 * The scopes that the user has authorized
	 */
	scope: z.string().min(1).nullish(),
	/**
	 * Password is only stored in the credential provider
	 */
	password: z.string().nullish(),
});
export const looseAccountSchema = accountSchema.loose();

/**
 * Account schema type used by faire-auth, note that it's possible that account could have additional fields
 *
 * todo: we should use generics to extend this type with additional fields from plugins and options in the future
 */
export type Account = ExV<z.output<typeof looseAccountSchema>, undefined>;
export type StrictAccount = ExV<z.output<typeof accountSchema>, undefined>;
export type AccountInput = z.input<typeof looseAccountSchema>;
