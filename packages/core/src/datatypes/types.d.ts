export type TypedArray =
	| BigInt64Array
	| BigUint64Array
	| Float32Array
	| Float64Array
	| Int16Array
	| Int32Array
	| Int8Array
	| Uint16Array
	| Uint32Array
	| Uint8Array;

export type SHAFamily = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";
export type EncodingFormat =
	| "base64"
	| "base64url"
	| "base64urlnopad"
	| "hex"
	| "none";
export type ECDSACurve = "P-256" | "P-384" | "P-521";
export type ExportKeyFormat = "jwk" | "pkcs8" | "raw" | "spki";
