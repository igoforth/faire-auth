import { describe } from "vitest";
import { base64, base64Url } from "./base64";
import { binary } from "./binary";

describe("base64", (test) => {
	const plainText = "Hello, World!";
	const plainBuffer = new TextEncoder().encode(plainText);
	const base64Encoded = "SGVsbG8sIFdvcmxkIQ==";
	const base64UrlEncoded = "SGVsbG8sIFdvcmxkIQ";

	describe("encode", (test) => {
		test("encodes a string to base64 with padding", async ({ expect }) => {
			const result = base64.encode(plainText, { padding: true });
			expect(result).toBe(base64Encoded);
		});

		test("encodes a string to base64 without padding", async ({ expect }) => {
			const result = base64.encode(plainText, { padding: false });
			expect(result).toBe(base64Encoded.replace(/=+$/, ""));
		});

		test("encodes a string to base64 URL-safe", async ({ expect }) => {
			const result = base64Url.encode(plainText, {
				padding: false,
			});
			expect(result).toBe(base64UrlEncoded);
		});

		test("encodes an ArrayBuffer to base64", async ({ expect }) => {
			const result = base64.encode(plainBuffer, { padding: true });
			expect(result).toBe(base64Encoded);
		});
	});

	describe("decode", (test) => {
		test("decodes a base64 string", async ({ expect }) => {
			const encoded = Buffer.from(plainText).toString("base64");
			const result = base64.decode(encoded);
			expect(binary.decode(result)).toBe(plainText);
		});

		test("decodes a base64 URL-safe string", async ({ expect }) => {
			const result = base64.decode(base64UrlEncoded);
			expect(binary.decode(result)).toBe(plainText);
		});
	});
});
