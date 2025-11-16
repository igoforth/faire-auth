/**
 * Constant object containing all route definition keys.
 */
export const Routes = {
	// SERVER ONLY
	SET_PASSWORD: "setPassword",

	// PUBLIC
	CHANGE_EMAIL: "changeEmail",
	CHANGE_PASSWORD: "changePassword",
	DELETE_USER: "deleteUser",
	DELETE_USER_CALLBACK: "deleteUserCallback",
	ERROR: "error",
	GET_ACCESS_TOKEN: "getAccessToken",
	GET_ACCOUNT_INFO: "getAccountInfo",
	GET_SESSION: "getSession",
	LINK_ACCOUNT: "linkAccount",
	LIST_ACCOUNTS: "listAccounts",
	LIST_SESSIONS: "listSessions",
	OAUTH_CALLBACK_GET: "getOAuthCallback",
	OAUTH_CALLBACK_POST: "postOAuthCallback",
	OK: "ok",
	REFRESH_ACCESS_TOKEN: "refreshAccessToken",
	REQUEST_PASSWORD_RESET: "requestPasswordReset",
	REQUEST_PASSWORD_RESET_CALLBACK: "requestPasswordResetCallback",
	RESET_PASSWORD: "resetPassword",
	REVOKE_OTHER_SESSIONS: "revokeOtherSessions",
	REVOKE_SESSION: "revokeSession",
	REVOKE_SESSIONS: "revokeSessions",
	SEND_VERIFICATION_EMAIL: "sendVerificationEmail",
	SIGN_IN_EMAIL: "signInEmail",
	SIGN_IN_SOCIAL: "signInSocial",
	SIGN_OUT: "signOut",
	SIGN_UP_EMAIL: "signUpEmail",
	UNLINK_ACCOUNT: "unlinkAccount",
	UPDATE_USER: "updateUser",
	VERIFY_EMAIL: "verifyEmail",
} as const;

/**
 * Type union of all route definition keys.
 */
export type Routes = (typeof Routes)[keyof typeof Routes];
