import { describe } from "vitest";

import { createHash } from "./hash";

describe("digest", (test) => {
	const inputString = "Hello, World!";
	const inputBuffer = new TextEncoder().encode(inputString);

	describe("SHA algorithms", (test) => {
		test("computes SHA-256 hash in raw format", async ({ expect }) => {
			const hash = await createHash("SHA-256").digest(inputString);
			expect(hash).toBeInstanceOf(ArrayBuffer);
		});

		test("computes SHA-512 hash in raw format", async ({ expect }) => {
			const hash = await createHash("SHA-512").digest(inputBuffer);
			expect(hash).toBeInstanceOf(ArrayBuffer);
		});

		test("computes SHA-256 hash in hex encoding", async ({ expect }) => {
			const hash = await createHash("SHA-256", "hex").digest(inputString);
			expect(typeof hash).toBe("string");
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});

		test("computes SHA-512 hash in hex encoding", async ({ expect }) => {
			const hash = await createHash("SHA-512", "hex").digest(inputBuffer);
			expect(typeof hash).toBe("string");
			expect(hash).toMatch(/^[a-f0-9]{128}$/);
		});
	});

	describe("Input variations", (test) => {
		test("handles input as a string", async ({ expect }) => {
			const hash = await createHash("SHA-256").digest(inputString);
			expect(hash).toBeInstanceOf(ArrayBuffer);
		});

		test("handles input as an ArrayBuffer", async ({ expect }) => {
			if (inputBuffer.buffer instanceof SharedArrayBuffer)
				throw new Error("Unsupported input type");
			const hash = await createHash("SHA-256").digest(inputBuffer.buffer);
			expect(hash).toBeInstanceOf(ArrayBuffer);
		});

		test("handles input as an ArrayBufferView", async ({ expect }) => {
			const hash = await createHash("SHA-256").digest(
				new Uint8Array(inputBuffer),
			);
			expect(hash).toBeInstanceOf(ArrayBuffer);
		});
	});

	describe("Error handling", (test) => {
		test("throws an error for unsupported hash algorithms", async ({
			expect,
		}) => {
			await expect(
				createHash("SHA-10" as any).digest(inputString),
			).rejects.toThrow();
		});

		test("throws an error for invalid input types", async ({ expect }) => {
			await expect(createHash("SHA-256").digest({} as any)).rejects.toThrow();
		});
	});
});
