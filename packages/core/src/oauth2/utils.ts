import type { OAuth2Tokens } from "./oauth-provider";
import { base64Url } from "../datatypes/base64";
import { createHash } from "../datatypes/hash";
import { getDate } from "../utils/time";

export const getOAuth2Tokens = (
	data: Partial<
		Record<
			| "access_token"
			| "expires_in"
			| "id_token"
			| "refresh_token"
			| "scope"
			| "token_type",
			number | string | string[] | undefined
		>
	>,
): OAuth2Tokens => ({
	...(data.token_type != null && { tokenType: data.token_type as string }),
	...(data.access_token != null && {
		accessToken: data.access_token as string,
	}),
	...(data.refresh_token != null && {
		refreshToken: data.refresh_token as string,
	}),
	...(data.expires_in != null && {
		accessTokenExpiresAt: getDate(data.expires_in as number, "sec"),
	}),
	scopes:
		data.scope != null
			? typeof data.scope === "string"
				? data.scope.split(" ")
				: (data.scope as unknown as string[])
			: [],
	...(data.id_token != null && { idToken: data.id_token as string }),
});

export const generateCodeChallenge = async (codeVerifier: string) => {
	const codeChallengeBytes = await createHash("SHA-256").digest(codeVerifier);
	return base64Url.encode(new Uint8Array(codeChallengeBytes), {
		padding: false,
	});
};
