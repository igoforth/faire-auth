import type { StrictSession, StrictUser } from "@faire-auth/core/db";
import type {
	InferFieldsFromOptions,
	InferFieldsFromPlugins,
	StripEmptyObjects,
	UnionToIntersection,
} from "@faire-auth/core/types";
import type { Auth } from "../auth";
import type { FaireAuthOptions } from "./options";
import type { FaireAuthPlugin } from "./plugin";

export type Models =
	| "user"
	| "account"
	| "session"
	| "verification"
	| "rate-limit"
	| "organization"
	| "member"
	| "invitation"
	| "jwks"
	| "passkey"
	| "two-factor";

export type AdditionalUserFieldsInput<Options extends FaireAuthOptions> =
	InferFieldsFromOptions<Options, "user", "input"> &
		InferFieldsFromPlugins<Options, "user", "input">;

export type AdditionalUserFieldsOutput<Options extends FaireAuthOptions> =
	InferFieldsFromOptions<Options, "user"> &
		InferFieldsFromPlugins<Options, "user">;

export type AdditionalSessionFieldsInput<Options extends FaireAuthOptions> =
	InferFieldsFromOptions<Options, "session", "input"> &
		InferFieldsFromPlugins<Options, "session", "input">;

export type AdditionalSessionFieldsOutput<Options extends FaireAuthOptions> =
	InferFieldsFromOptions<Options, "session"> &
		InferFieldsFromPlugins<Options, "session">;

export type InferUser<O extends Auth | FaireAuthOptions> = Record<
	never,
	never
> &
	UnionToIntersection<
		StripEmptyObjects<
			(O extends FaireAuthOptions
				? AdditionalUserFieldsOutput<O>
				: O extends Auth
					? AdditionalUserFieldsOutput<O["options"]>
					: {}) &
				StrictUser
		>
	>;

export type InferSession<O extends Auth | FaireAuthOptions> = Record<
	never,
	never
> &
	UnionToIntersection<
		StripEmptyObjects<
			(O extends FaireAuthOptions
				? AdditionalSessionFieldsOutput<O>
				: O extends Auth
					? AdditionalSessionFieldsOutput<O["options"]>
					: {}) &
				StrictSession
		>
	>;

export type InferPluginTypes<O extends FaireAuthOptions> =
	O["plugins"] extends (infer P)[]
		? UnionToIntersection<
				P extends FaireAuthPlugin
					? P["$Infer"] extends Record<string, any>
						? P["$Infer"]
						: {}
					: {}
			>
		: {};

interface RateLimit {
	/**
	 * The key to use for rate limiting
	 */
	key: string;
	/**
	 * The number of requests made
	 */
	count: number;
	/**
	 * The last request time in milliseconds
	 */
	lastRequest: number;
}

export type { RateLimit };
