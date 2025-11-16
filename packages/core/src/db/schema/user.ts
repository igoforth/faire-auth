import * as z from "zod";
import { callbackURLSchema } from "../../factory/schema";
import type { ExV } from "../../types/helper";
import { coreSchema } from "./shared";

export const userSchema = coreSchema.extend({
	email: z.email().transform((val) => val.toLowerCase()),
	emailVerified: z.coerce.boolean().default(false),
	name: z.string().optional(),
	// TODO: this always puts a relative path after baseURL from env
	// do we want it stored like this?
	image: callbackURLSchema(true).nullable(),
});
export const looseUserSchema = userSchema.loose();

/**
 * User schema type used by faire-auth, note that it's possible that user could have additional fields
 *
 * @todo we should use generics to extend this type with additional fields from plugins and options in the future
 */
export type User = ExV<z.output<typeof looseUserSchema>, undefined>;
export type StrictUser = ExV<z.output<typeof userSchema>, undefined>;
export type UserInput = z.input<typeof looseUserSchema>;
