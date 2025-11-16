/**
 * Default secret used for faire-auth if not provided.
 */
export const DEFAULT_SECRET = "faire-auth-secret-123456789";

/**
 * Constant for true value.
 */
export const True = true as const;
/**
 * Constant for false value.
 */
export const False = false as const;

/**
 * Converts a value to boolean, checking for "true" string or true.
 */
export const toBoolean = (value: any): boolean =>
	value === "true" || value === true;

/**
 * Checks if a value is a Promise.
 */
export const isPromise = <T>(value: T | Promise<T>): value is Promise<T> =>
	value != null && typeof (value as any).then === "function";
