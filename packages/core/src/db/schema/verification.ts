import * as z from "zod";
import { dateOrIsoStringSchema } from "../../factory/schema";
import type { ExV } from "../../types/helper";
import { coreSchema } from "./shared";

export const verificationSchema = coreSchema.extend({
	value: z.string(),
	expiresAt: dateOrIsoStringSchema,
	identifier: z.string(),
});
export const looseVerificationSchema = verificationSchema.loose();

/**
 * Verification schema type used by faire-auth, note that it's possible that verification could have additional fields
 *
 * todo: we should use generics to extend this type with additional fields from plugins and options in the future
 */
export type Verification = ExV<
	z.output<typeof looseVerificationSchema>,
	undefined
>;
export type StrictVerification = ExV<
	z.output<typeof verificationSchema>,
	undefined
>;
export type VerificationInput = z.input<typeof looseVerificationSchema>;
