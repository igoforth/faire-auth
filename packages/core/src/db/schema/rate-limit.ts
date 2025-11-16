import * as z from "zod";
import type { ExV } from "../../types/helper";

export const rateLimitSchema = z.object({
	/**
	 * The key to use for rate limiting
	 */
	key: z.string(),
	/**
	 * The number of requests made
	 */
	count: z.number(),
	/**
	 * The last request time in milliseconds
	 */
	lastRequest: z.number(),
});
export const looseRateLimitSchema = rateLimitSchema.loose();

/**
 * Rate limit schema type used by faire-auth for rate limiting
 */
export type RateLimit = ExV<z.output<typeof looseRateLimitSchema>, undefined>;
export type StrictRateLimit = ExV<z.output<typeof rateLimitSchema>, undefined>;
export type RateLimitInput = z.input<typeof looseRateLimitSchema>;
