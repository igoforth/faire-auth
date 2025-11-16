/**
 * Constant object containing all schema definition keys.
 */
export const Definitions = {
	// Database schemas
	ACCOUNT: "account",
	USER: "user",
	SESSION: "session",
	VERIFICATION: "verification",
	// Additional schemas
	ACCOUNT_RESPONSE: "accountResponse",
	USER_RESPONSE: "userResponse",
	SESSION_RESPONSE: "sessionResponse",
	VERIFICATION_RESPONSE: "verificationResponse",
	SESSIONS_LIST: "sessionsList",
	SESSION_USER: "sessionUser",
	ACCOUNTS_LIST: "accountsList",
	ACCOUNT_INFO: "accountInfo",
	ACCESS_TOKEN: "accessToken",
	TOKEN_USER: "tokenUser",
	REDIRECT_URL: "redirectUrl",
	SIGN_IN_UP: "signInUp",
	// REDIRECT_HEADER: 'redirect',
	SUCCESS: "success",
	ERROR: "error",
	// NULL: 'null',
} as const;

/**
 * Type union of all schema definition keys.
 */
export type Definitions = (typeof Definitions)[keyof typeof Definitions];
