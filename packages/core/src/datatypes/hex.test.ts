import { describe } from "vitest";

import { hex } from "./hex";

describe("hex", (test) => {
	describe("encode", (test) => {
		test("should encode a string to hexadecimal", ({ expect }) => {
			const input = "Hello, World!";
			expect(hex.encode(input)).toBe(Buffer.from(input).toString("hex"));
		});

		test("should encode an ArrayBuffer to hexadecimal", ({ expect }) => {
			const input = new TextEncoder().encode("Hello").buffer;
			if (input instanceof SharedArrayBuffer)
				throw new Error("SharedArrayBuffer is not supported");
			expect(hex.encode(input)).toBe(Buffer.from(input).toString("hex"));
		});

		test("should encode a TypedArray to hexadecimal", ({ expect }) => {
			const input = new Uint8Array([72, 101, 108, 108, 111]);
			expect(hex.encode(input)).toBe(Buffer.from(input).toString("hex"));
		});
	});

	describe("decode", (test) => {
		test("should decode a hexadecimal string to its original value", ({
			expect,
		}) => {
			const expected = "Hello, World!";
			expect(hex.decode(Buffer.from(expected).toString("hex"))).toBe(expected);
		});

		test("should handle decoding of a hexadecimal string to binary data", ({
			expect,
		}) => {
			const expected = "Hello";
			expect(hex.decode(Buffer.from(expected).toString("hex"))).toBe(expected);
		});

		test("should throw an error for an odd-length string", ({ expect }) => {
			const input = "123";
			expect(() => hex.decode(input)).toThrow(Error);
		});

		test("should throw an error for a non-hexadecimal string", ({ expect }) => {
			const input = "zzzz";
			expect(() => hex.decode(input)).toThrow(Error);
		});
	});

	describe("round-trip tests", (test) => {
		test("should return the original string after encoding and decoding", ({
			expect,
		}) => {
			const input = "Hello, Hex!";
			const encoded = hex.encode(input);
			const decoded = hex.decode(encoded);
			expect(decoded).toBe(input);
		});

		test("should handle empty strings", ({ expect }) => {
			const input = "";
			const encoded = hex.encode(input);
			const decoded = hex.decode(encoded);
			expect(decoded).toBe(input);
		});
	});
});
