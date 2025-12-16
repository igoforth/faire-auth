import { describe } from "vitest";
import { createHMAC } from "./hmac";

describe("hmac module", (test) => {
	const algorithm = "SHA-256";
	const testKey = "super-secret-key";
	const testData = "Hello, HMAC!";
	let signature: ArrayBuffer;

	test("imports a key for HMAC", async ({ expect }) => {
		const cryptoKey = await createHMAC().importKey(testKey, "sign");
		expect(cryptoKey).toBeDefined();
		expect(cryptoKey.algorithm.name).toBe("HMAC");
		expect((cryptoKey.algorithm as HmacKeyAlgorithm).hash.name).toBe(algorithm);
	});

	test("signs data using HMAC", async ({ expect }) => {
		signature = await createHMAC().sign(testKey, testData);
		expect(signature).toBeInstanceOf(ArrayBuffer);
		expect(signature.byteLength).toBeGreaterThan(0);
	});

	test("verifies HMAC signature", async ({ expect }) => {
		const isValid = await createHMAC().verify(testKey, testData, signature);
		expect(isValid).toBe(true);
	});

	test("fails verification for modified data", async ({ expect }) => {
		const isValid = await createHMAC(algorithm).verify(
			testKey,
			"Modified data",
			signature,
		);
		expect(isValid).toBe(false);
	});

	test("fails verification for a different key", async ({ expect }) => {
		const differentKey = "different-secret-key";
		const isValid = await createHMAC(algorithm).verify(
			differentKey,
			testData,
			signature,
		);
		expect(isValid).toBe(false);
	});
});
