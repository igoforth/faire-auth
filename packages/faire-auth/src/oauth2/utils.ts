import type { Context } from "hono";
import { symmetricDecrypt, symmetricEncrypt } from "../crypto";
import type { ContextVars } from "../types/hono";
import type { FaireAuthOptions } from "../types/options";

export const decryptOAuthToken = <V extends object>(
	token: string,
	ctx: Context<ContextVars<V>>,
	options: Pick<FaireAuthOptions, "account">,
) => {
	if (!token) return token;
	if (options.account?.encryptOAuthTokens) {
		return symmetricDecrypt({ key: ctx.get("context").secret, data: token });
	}
	return token;
};

export const setTokenUtil = <V extends object>(
	token: string | null | undefined,
	ctx: Context<ContextVars<V>>,
	options: Pick<FaireAuthOptions, "account">,
) => {
	if (options.account?.encryptOAuthTokens && token)
		return symmetricEncrypt({ key: ctx.get("context").secret, data: token });

	return token;
};
