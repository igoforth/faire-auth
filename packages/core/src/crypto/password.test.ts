import { describe } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("Password hashing and verification", (test) => {
	test("should hash a password", async ({ expect }) => {
		const password = "mySecurePassword123!";
		const hash = await hashPassword(password);
		expect(hash).toBeTruthy();
		expect(hash.split(":").length).toBe(2);
	});

	test("should verify a correct password", async ({ expect }) => {
		const password = "correctPassword123!";
		const hash = await hashPassword(password);
		const isValid = await verifyPassword({ hash, password });
		expect(isValid).toBe(true);
	});

	test("should reject an incorrect password", async ({ expect }) => {
		const correctPassword = "correctPassword123!";
		const incorrectPassword = "wrongPassword456!";
		const hash = await hashPassword(correctPassword);
		const isValid = await verifyPassword({ hash, password: incorrectPassword });
		expect(isValid).toBe(false);
	});

	test("should generate different hashes for the same password", async ({
		expect,
	}) => {
		const password = "samePassword123!";
		const hash1 = await hashPassword(password);
		const hash2 = await hashPassword(password);
		expect(hash1).not.toBe(hash2);
	});

	test("should handle long passwords", async ({ expect }) => {
		const password = "a".repeat(1000);
		const hash = await hashPassword(password);
		const isValid = await verifyPassword({ hash, password });
		expect(isValid).toBe(true);
	});

	test("should be case-sensitive", async ({ expect }) => {
		const password = "CaseSensitivePassword123!";
		const hash = await hashPassword(password);
		const isValidLower = await verifyPassword({
			hash,
			password: password.toLowerCase(),
		});
		const isValidUpper = await verifyPassword({
			hash,
			password: password.toUpperCase(),
		});
		expect(isValidLower).toBe(false);
		expect(isValidUpper).toBe(false);
	});

	test("should handle Unicode characters", async ({ expect }) => {
		const password = "пароль123!";
		const hash = await hashPassword(password);
		const isValid = await verifyPassword({ hash, password });
		expect(isValid).toBe(true);
	});
});
