import { getWebcryptoSubtle } from "../crypto/utils";
import { base64, base64Url } from "./base64";
import { hex } from "./hex";
import type { EncodingFormat, SHAFamily, TypedArray } from "./types";

export const createHMAC = <E extends EncodingFormat = "none">(
	algorithm: SHAFamily = "SHA-256",
	encoding: E = "none" as E,
) => {
	const hmac = {
		importKey: async (
			key: ArrayBuffer | string | TypedArray,
			keyUsage: "sign" | "verify",
		) =>
			getWebcryptoSubtle().importKey(
				"raw",
				typeof key === "string"
					? new TextEncoder().encode(key)
					: (key as BufferSource),
				{ name: "HMAC", hash: { name: algorithm } },
				false,
				[keyUsage],
			),
		sign: async (
			hmacKey: CryptoKey | string,
			data: ArrayBuffer | string | TypedArray,
		): Promise<E extends "none" ? ArrayBuffer : string> => {
			if (typeof hmacKey === "string") {
				hmacKey = await hmac.importKey(hmacKey, "sign");
			}
			const signature = await getWebcryptoSubtle().sign(
				"HMAC",
				hmacKey,
				typeof data === "string"
					? new TextEncoder().encode(data)
					: (data as BufferSource),
			);
			if (encoding === "hex") {
				return hex.encode(signature) as any;
			}
			if (
				encoding === "base64" ||
				encoding === "base64url" ||
				encoding === "base64urlnopad"
			) {
				return base64Url.encode(signature, {
					padding: encoding !== "base64urlnopad",
				}) as any;
			}
			return signature as any;
		},
		verify: async (
			hmacKey: CryptoKey | string,
			data: ArrayBuffer | string | TypedArray,
			signature: ArrayBuffer | string | TypedArray,
		) => {
			if (typeof hmacKey === "string") {
				hmacKey = await hmac.importKey(hmacKey, "verify");
			}
			if (encoding === "hex") {
				signature = hex.decode(signature);
			}
			if (
				encoding === "base64" ||
				encoding === "base64url" ||
				encoding === "base64urlnopad"
			) {
				signature = await base64.decode(signature);
			}
			return getWebcryptoSubtle().verify(
				"HMAC",
				hmacKey,
				typeof signature === "string"
					? new TextEncoder().encode(signature)
					: (signature as BufferSource),
				typeof data === "string"
					? new TextEncoder().encode(data)
					: (data as BufferSource),
			);
		},
	};
	return hmac;
};
