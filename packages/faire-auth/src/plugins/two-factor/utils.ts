import { base64Url, createHash } from "@faire-auth/core/datatypes";

export const defaultKeyHasher = async (token: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(token),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), { padding: false });
	return hashed;
};
