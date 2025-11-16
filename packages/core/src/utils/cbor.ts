import type { Decoder as DecoderType, Encoder as EncoderType } from "cbor-x";
import type { CBORRespond, CBORRespondReturn } from "../types/cbor";

let Decoder: typeof DecoderType | null = null;
let Encoder: typeof EncoderType | null = null;

export const ensureInit = () => {
	if (!Decoder || !Encoder)
		return import("cbor-x").then(
			({ Decoder: ResolvedDecoder, Encoder: ResolvedEncoder }) => {
				Decoder = ResolvedDecoder;
				Encoder = ResolvedEncoder;
			},
		);
};

export const decode = <T>(data: Uint8Array): T => {
	if (!Decoder) throw new Error("ensureInit() must be called to import cbor-x");
	return new Decoder({ bundleStrings: true }).decode(data) as T;
};

export const encode = (data: unknown): Uint8Array => {
	if (!Encoder) throw new Error("ensureInit() must be called to import cbor-x");
	return new Encoder({ bundleStrings: true }).encode(data);
};

// @ts-expect-error Target signature provides too few arguments. Expected 3 or more, but got 2.
export const cborRespond: CBORRespond = (object, statusOrInit, headers) => {
	try {
		// Encode the input object to CBOR format
		const encodedBody = encode(object);

		// Initialize response initialization object
		let responseInit: ResponseInit = {};

		// Handle the two overloads
		if (typeof statusOrInit === "number")
			// First overload: status is a number, headers is optional
			responseInit = {
				status: statusOrInit,
				headers: headers
					? Object.fromEntries(
							Object.entries(headers).map(([k, v]) => [
								k,
								Array.isArray(v) ? v.join(", ") : v,
							]),
						)
					: {},
			};
		// Second overload: statusOrInit is a ResponseInit object
		else responseInit = statusOrInit ?? {};

		// Ensure headers include CBOR content type
		responseInit.headers = {
			"Content-Type": "application/cbor",
			...(responseInit.headers ?? {}),
		};

		// Create response with the expected format for CBORRespondReturn
		// encodedBody satisfies NodeJS.ArrayBufferView
		const response = new Response(encodedBody as any, responseInit);

		// Add required properties to match CBORRespondReturn type
		Object.defineProperties(response, {
			_data: { value: object, enumerable: true },
			_status: { value: responseInit.status ?? 200, enumerable: true },
			_format: { value: "cbor", enumerable: true },
		});

		return response as CBORRespondReturn<
			typeof object,
			NonNullable<typeof statusOrInit>
		>;
	} catch (error) {
		// Handle CBOR encoding errors or invalid inputs
		throw new Error(`CBOR encoding failed: ${(error as Error).message}`);
	}
};
