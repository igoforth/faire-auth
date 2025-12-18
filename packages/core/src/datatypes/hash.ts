import { keccak_256 } from "@noble/hashes/sha3.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { constantTimeEqual } from "../crypto/random";
import { getWebcryptoSubtle } from "../crypto/utils";
import { base64, base64Url } from "./base64";
import type { EncodingFormat, SHAFamily, TypedArray } from "./types";

export const createHash = <Encoding extends EncodingFormat = "none">(
	algorithm: SHAFamily,
	encoding?: Encoding,
) => ({
	digest: async (
		input: ArrayBuffer | string | TypedArray,
	): Promise<Encoding extends "none" ? ArrayBuffer : string> => {
		const encoder = new TextEncoder();
		const data = typeof input === "string" ? encoder.encode(input) : input;
		const hashBuffer = await getWebcryptoSubtle().digest(
			algorithm,
			data as BufferSource,
		);

		if (encoding === "hex") {
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hashHex = hashArray
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
			return hashHex as any;
		}

		if (
			encoding === "base64" ||
			encoding === "base64url" ||
			encoding === "base64urlnopad"
		) {
			if (encoding.includes("url")) {
				return base64Url.encode(hashBuffer, {
					padding: encoding !== "base64urlnopad",
				}) as any;
			}
			const hashBase64 = base64.encode(hashBuffer);
			return hashBase64 as any;
		}
		return hashBuffer as any;
	},
});

export const hashToBase64 = async (
	data: ArrayBuffer | string,
): Promise<string> => {
	const buffer = await createHash("SHA-256").digest(data);
	return base64.encode(buffer);
};

export const compareHash = async (
	data: ArrayBuffer | string,
	hash: string,
): Promise<boolean> => {
	const buffer = await createHash("SHA-256").digest(
		typeof data === "string" ? new TextEncoder().encode(data) : data,
	);
	const hashBuffer = base64.decode(hash);
	return constantTimeEqual(buffer, hashBuffer);
};

/**
 * TS implementation of ERC-55 ("Mixed-case checksum address encoding") using @noble/hashes
 * @param address - The address to convert to a checksum address
 * @returns The checksummed address
 */
export function toChecksumAddress(address: string) {
	address = address.toLowerCase().replace("0x", "");
	// Hash the address (treat it as UTF-8) and return as a hex string
	const hash = [...keccak_256(utf8ToBytes(address))]
		.map((v) => v.toString(16).padStart(2, "0"))
		.join("");
	let ret = "0x";

	for (let i = 0; i < 40; i++) {
		if (parseInt(hash[i]!, 16) >= 8) ret += address[i]!.toUpperCase();
		else ret += address[i];
	}

	return ret;
}
