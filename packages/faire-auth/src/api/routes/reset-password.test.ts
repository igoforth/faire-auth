import type { Account } from "@faire-auth/core/db";
import { True } from "@faire-auth/core/static";
import { afterEach, describe, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { beforeEach } from "vitest";
import { createCookieCapture } from "../../utils/cookies";

describe("forget password", async (test) => {
	const mockSendEmail = vi.fn();
	const mockOnPasswordReset = vi.fn();
	let token = "";

	// Shared instance initialized once for all tests
	const { client, testUser, db } = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			async sendResetPassword({ url }) {
				token = url.split("?")[0]?.split("/").pop() || "";
				await mockSendEmail();
			},
			onPasswordReset: async ({ user }) => {
				await mockOnPasswordReset(user);
			},
		},
	});

	beforeEach(() => {
		// Reset mocks and token before each test
		mockSendEmail.mockClear();
		mockOnPasswordReset.mockClear();
		token = "";
		vi.useRealTimers();
	});

	test("should send a reset password email when enabled", async ({
		expect,
	}) => {
		let capturedToken = "";

		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url }) {
					capturedToken = url.split("?")[0]?.split("/").pop() || "";
					await mockSendEmail();
				},
			},
		});

		await client.requestPasswordReset.$post({
			json: { email: testUser!.email, redirectTo: "http://localhost:3000" },
		});

		expect(mockSendEmail).toHaveBeenCalledOnce();
		expect(capturedToken.length).toBeGreaterThan(10);
	});

	test("should fail on invalid password", async ({ expect }) => {
		let token = "";

		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword({ url }) {
					token = url.split("?")[0]?.split("/").pop() || "";
				},
			},
		});

		// Request reset to get token
		await client.requestPasswordReset.$post({
			json: { email: testUser!.email, redirectTo: "http://localhost:3000" },
		});

		// Attempt reset with invalid password
		const res = await client.resetPassword.$post({
			json: { newPassword: "short", token },
			query: {},
		});

		expect(res.error?.status).toBe(400);
	});

	test("should verify the token and reset password", async ({ expect }) => {
		let token = "";

		const { client, testUser } = await getTestInstance(
			{
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ url }) {
						token = url.split("?")[0]?.split("/").pop() || "";
					},
				},
			},
			{ testWith: "sqlite" },
		);

		// Request reset
		await client.requestPasswordReset.$post({
			json: { email: testUser!.email, redirectTo: "http://localhost:3000" },
		});

		// Reset with valid password
		const newPassword = "valid-new-password";
		const res = await client.resetPassword.$post({
			json: { newPassword, token },
			query: {},
		});

		expect(res.data?.success).toBe(True); // Fixed: lowercase 'true'
	});

	test("should update account's updatedAt when resetting password", async ({
		expect,
	}) => {
		// Create a new user
		const newHeaders = new Headers();
		const cookieCapture = createCookieCapture(newHeaders);
		const signUpRes = await client.signUp.email.$post(
			{
				json: {
					name: "Test Reset User",
					email: "test-reset-updated@email.com",
					password: "originalPassword123",
				},
			},
			{
				fetchOptions: {
					onSuccess: cookieCapture(),
				},
			},
		);

		const userId = signUpRes.data?.data.user?.id;
		expect(userId).toBeDefined();

		// Get initial account data
		const initialAccounts: Account[] = await db.findMany({
			model: "account",
			where: [
				{ field: "userId", value: userId! },
				{ field: "providerId", value: "credential" },
			],
		});

		expect(initialAccounts.length).toBe(1);
		const initialUpdatedAt = initialAccounts[0]!.updatedAt;

		// Request password reset
		await client.requestPasswordReset.$post({
			json: {
				email: "test-reset-updated@email.com",
				redirectTo: "http://localhost:3000",
			},
		});
		expect(token).toBeDefined();

		// Wait to ensure timestamp difference
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Reset password
		const resetRes = await client.resetPassword.$post({
			json: { newPassword: "newResetPassword123", token },
			query: {},
		});
		expect(resetRes.data?.success).toBe(True);

		// Verify account was updated
		const updatedAccounts: Account[] = await db.findMany({
			model: "account",
			where: [
				{ field: "userId", value: userId! },
				{ field: "providerId", value: "credential" },
			],
		});

		expect(updatedAccounts.length).toBe(1);
		const newUpdatedAt = updatedAccounts[0]!.updatedAt;

		expect(newUpdatedAt).not.toBe(initialUpdatedAt);
		expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(
			new Date(initialUpdatedAt).getTime(),
		);

		// Verify sign-in with new password works
		const signInRes = await client.signIn.email.$post({
			json: {
				email: "test-reset-updated@email.com",
				password: "newResetPassword123",
			},
		});
		expect(signInRes.data?.data.user).toBeDefined();
	});

	test("should sign-in with new password and reject old password", async ({
		expect,
	}) => {
		// Request and perform password reset
		await client.requestPasswordReset.$post({
			json: { email: testUser!.email, redirectTo: "http://localhost:3000" },
		});

		const newPassword = "new-secure-password";
		await client.resetPassword.$post({
			json: { newPassword, token },
			query: {},
		});

		// Old password should fail
		const withOldCred = await client.signIn.email.$post({
			json: { email: testUser!.email, password: testUser!.password },
		});
		expect(withOldCred.error?.status).toBe(401);

		// New password should work
		const withNewCred = await client.signIn.email.$post({
			json: { email: testUser!.email, password: newPassword },
		});
		expect(withNewCred.data?.data.user).toBeDefined();
	});

	test("shouldn't allow the token to be used twice", async ({ expect }) => {
		// Request reset
		await client.requestPasswordReset.$post({
			json: { email: testUser!.email, redirectTo: "http://localhost:3000" },
		});

		// First use should succeed
		const newPassword = "first-reset-password";
		const firstReset = await client.resetPassword.$post({
			json: { newPassword, token },
			query: {},
		});
		expect(firstReset.data?.success).toBe(True);

		// Second use should fail
		const secondReset = await client.resetPassword.$post({
			json: { newPassword: "second-attempt", token },
			query: {},
		});
		expect(secondReset.error?.status).toBe(400);
	});

	test("should expire token after configured time", async ({ expect }) => {
		// This test needs its own instance with custom expiration
		let expireToken = "";

		const { client: expireClient, testUser: expireUser } =
			await getTestInstance({
				emailAndPassword: {
					enabled: true,
					async sendResetPassword({ token: _token }) {
						expireToken = _token;
						await mockSendEmail();
					},
					onPasswordReset: async ({ user }) => {
						await mockOnPasswordReset(user);
					},
					resetPasswordTokenExpiresIn: 10, // 10 seconds
				},
			});

		// Request password reset
		await expireClient.requestPasswordReset.$post({
			json: { email: expireUser!.email, redirectTo: "/sign-in" },
		});

		// Test 1: Token should work before expiration (9 seconds)
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(9000);

		const validReset = await expireClient.resetPassword.$post({
			json: { newPassword: "valid-password", token: expireToken },
			query: {},
		});
		expect(validReset.data?.success).toBe(True);
		expect(mockOnPasswordReset).toHaveBeenCalledOnce();

		// Test 2: New token should fail after expiration (11 seconds)
		mockOnPasswordReset.mockClear();

		await expireClient.requestPasswordReset.$post({
			json: { email: expireUser!.email, redirectTo: "/sign-in" },
		});

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(11000);

		const expiredReset = await expireClient.resetPassword.$post({
			json: { newPassword: "expired-password", token: expireToken },
			query: {},
		});
		expect(expiredReset.error?.status).toBe(400);
		expect(mockOnPasswordReset).not.toHaveBeenCalled();
	});

	test("should preserve multiple query params in callbackURL", async ({
		expect,
	}) => {
		// This test needs its own instance to capture the URL
		let capturedUrl = "";

		const { client: urlClient, testUser: urlUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				async sendResetPassword(context) {
					capturedUrl = context.url;
					await mockSendEmail();
				},
			},
		});

		const queryParams = "foo=bar&baz=qux";
		const redirectTo = `http://localhost:3000/?${queryParams}`;

		const res = await urlClient.requestPasswordReset.$post({
			json: { email: urlUser!.email, redirectTo },
		});

		expect(res.data?.success).toBe(True);
		expect(capturedUrl).toContain(
			`callbackURL=${encodeURIComponent(redirectTo)}`,
		);
		// The original query params should be encoded within the callbackURL param
		expect(capturedUrl).not.toContain(`?${queryParams}`);
	});
});

describe("revoke sessions on password reset", async (test) => {
	const mockSendEmail = vi.fn();
	let token = "";

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const {
		client,
		createUser,
		auth: { options },
	} = await getTestInstance({
		emailAndPassword: {
			enabled: true,
			async sendResetPassword({ url }) {
				token = url.split("?")[0]?.split("/").pop() || "";
				await mockSendEmail();
			},
			revokeSessionsOnPasswordReset: true,
		},
	});

	test("should revoke other sessions when revokeSessionsOnPasswordReset is enabled", async ({
		expect,
	}) => {
		const { headers, user } = await createUser();

		const res = await client.requestPasswordReset.$post({
			json: { email: user.email, redirectTo: "http://localhost:3000" },
		});
		expect(res.data).not.toBeNull();

		const res2 = await client.resetPassword.$post({
			json: { newPassword: "new-password", token },
			query: {},
		});
		expect(res2.data).not.toBeNull();

		const sessionAttempt = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(sessionAttempt.data).toBeNull();
	});

	test("should not revoke other sessions by default", async ({ expect }) => {
		const { headers, user } = await createUser();

		vi.spyOn(
			options.emailAndPassword,
			"revokeSessionsOnPasswordReset",
			"get",
		).mockReturnValue(false);

		await client.requestPasswordReset.$post({
			json: { email: user.email, redirectTo: "http://localhost:3000" },
		});

		await client.resetPassword.$post({
			json: { newPassword: "new-password", token },
			query: {},
		});

		const sessionAttempt = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(sessionAttempt.data?.data.user).toBeDefined();
	});
});
