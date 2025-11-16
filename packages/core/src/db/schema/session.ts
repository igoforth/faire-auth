import * as z from "zod";
import {
	dateOrIsoStringSchema,
	stringOrNumberIdSchema,
} from "../../factory/schema";
import type { ExV } from "../../types/helper";
import { coreSchema } from "./shared";

export const sessionSchema = coreSchema.extend({
	// TODO: Secondary storage doesn't generate an id, which I think is pretty dumb
	// but what it means is we can't rely on getting an id back from routes if
	// secondary storage is enabled, so we add optional to id here
	id: coreSchema.shape.id.optional(),
	userId: stringOrNumberIdSchema,
	expiresAt: dateOrIsoStringSchema,
	token: z.string(),
	ipAddress: z.string().nullish(),
	userAgent: z.string().nullish(),
});
export const looseSessionSchema = sessionSchema.loose();

/**
 * Session schema type used by faire-auth, note that it's possible that session could have additional fields
 *
 * todo: we should use generics to extend this type with additional fields from plugins and options in the future
 */
export type Session = ExV<z.output<typeof looseSessionSchema>, undefined>;
export type StrictSession = ExV<z.output<typeof sessionSchema>, undefined>;
export type SessionInput = z.input<typeof looseSessionSchema>;
