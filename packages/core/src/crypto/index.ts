import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import {
	bytesToHex,
	hexToBytes,
	managedNonce,
	utf8ToBytes,
} from "@noble/ciphers/utils.js";
import { createHash } from "../datatypes/hash";
import { getWebcryptoSubtle } from "./utils";

const algorithm = { name: "HMAC", hash: "SHA-256" };

export const getCryptoKey = async (secret: BufferSource | string) => {
	const secretBuf =
		typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
	return getWebcryptoSubtle().importKey("raw", secretBuf, algorithm, false, [
		"sign",
		"verify",
	]);
};

export const verifySignature = async (
	base64Signature: string,
	value: string,
	secret: CryptoKey,
): Promise<boolean> => {
	try {
		const signatureBinStr = atob(base64Signature);
		const signature = new Uint8Array(signatureBinStr.length);
		for (let i = 0, len = signatureBinStr.length; i < len; i++) {
			signature[i] = signatureBinStr.charCodeAt(i);
		}
		return await getWebcryptoSubtle().verify(
			algorithm,
			secret,
			signature,
			new TextEncoder().encode(value),
		);
	} catch {
		return false;
	}
};

const makeSignature = async (
	value: string,
	secret: BufferSource | string,
): Promise<string> => {
	const key = await getCryptoKey(secret);
	const signature = await getWebcryptoSubtle().sign(
		algorithm.name,
		key,
		new TextEncoder().encode(value),
	);
	// the returned base64 encoded signature will always be 44 characters long and end with one or two equal signs
	return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

export const signCookieValue = async (
	value: string,
	secret: BufferSource | string,
) => {
	const signature = await makeSignature(value, secret);
	value = `${value}.${signature}`;
	value = encodeURIComponent(value);
	return value;
};

export interface SymmetricEncryptOptions {
	key: string;
	data: string;
}

export const symmetricEncrypt = async ({
	key,
	data,
}: SymmetricEncryptOptions) => {
	const keyAsBytes = await createHash("SHA-256").digest(key);
	const dataAsBytes = utf8ToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return bytesToHex(chacha.encrypt(dataAsBytes));
};

export interface SymmetricDecryptOptions {
	key: string;
	data: string;
}

export const symmetricDecrypt = async ({
	key,
	data,
}: SymmetricDecryptOptions) => {
	const keyAsBytes = await createHash("SHA-256").digest(key);
	const dataAsBytes = hexToBytes(data);
	const chacha = managedNonce(xchacha20poly1305)(new Uint8Array(keyAsBytes));
	return new TextDecoder().decode(chacha.decrypt(dataAsBytes));
};

export * from "./jwt";
export * from "./password";
export * from "./random";
export { getWebcryptoSubtle } from "./utils";
