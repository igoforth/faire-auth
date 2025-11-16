import type { FaireAuthPluginDBSchema } from "./plugin";
import type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPrimitive,
	FaireAuthDBSchema,
} from "./type";

export type { FaireAuthPluginDBSchema } from "./plugin";
// export { coreSchema } from "./schema/shared";
export {
	accountSchema,
	looseAccountSchema,
	type Account,
	type AccountInput,
	type StrictAccount,
} from "./schema/account";
export {
	rateLimitSchema,
	looseRateLimitSchema,
	type RateLimit,
	type RateLimitInput,
	type StrictRateLimit,
} from "./schema/rate-limit";
export {
	sessionSchema,
	looseSessionSchema,
	type Session,
	type SessionInput,
	type StrictSession,
} from "./schema/session";
export {
	userSchema,
	looseUserSchema,
	type StrictUser,
	type User,
	type UserInput,
} from "./schema/user";
export {
	verificationSchema,
	looseVerificationSchema,
	type StrictVerification,
	type Verification,
	type VerificationInput,
} from "./schema/verification";
export type {
	DBFieldAttribute,
	DBFieldAttributeConfig,
	DBFieldType,
	DBPreservedModels,
	DBPrimitive,
	FaireAuthDBSchema,
	SecondaryStorage,
} from "./type";

/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type AuthPluginSchema = FaireAuthPluginDBSchema;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type FieldAttribute = DBFieldAttribute;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type FieldAttributeConfig = DBFieldAttributeConfig;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type FieldType = DBFieldType;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type Primitive = DBPrimitive;
/**
 * @deprecated Backport for 1.3.x, we will remove this in 1.4.x
 */
export type FaireAuthDbSchema = FaireAuthDBSchema;
