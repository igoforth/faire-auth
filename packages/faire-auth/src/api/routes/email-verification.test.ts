import { False, True } from "@faire-auth/core/static";
import { beforeEach, describe, expect, vi } from "vitest";
import { getTestInstance } from "../../test-utils";
import type { FaireAuthOptions } from "../../types";
import { createCookieCapture } from "../../utils/cookies";

describe("Email Verification", async (test) => {
	const onEmailVerificationMock = vi.fn();
	const mockSendEmail = vi.fn();
	let token: string;

	// Shared secondary storage
	const store = new Map<string, string>();

	const {
		auth: rawAuth,
		testUser,
		signIn,
		createUser,
		client,
	} = await getTestInstance({
		secondaryStorage: undefined as any,
		rateLimit: { enabled: false },
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false as boolean,
		},
		emailVerification: {
			expiresIn: 3600,
			autoSignInAfterVerification: false as boolean,
			onEmailVerification: undefined as any,
			async sendVerificationEmail({ user, url, token: _token }) {
				token = _token;
				mockSendEmail(user.email, url);
			},
		},
		user: {
			changeEmail: {
				enabled: false as boolean,
				async sendChangeEmailVerification({ token: _token }) {
					token = _token;
				},
			},
		},
	});
	const auth = rawAuth as typeof rawAuth & { options: FaireAuthOptions };

	const sendVerificationEmail = async (email = testUser!.email) => {
		const res = await auth.api.sendVerificationEmail({
			json: { email },
		});
		expect(res.success, JSON.stringify(res)).toBe(true);
		return res;
	};

	// Helper to reset token and mocks before each relevant test
	beforeEach(() => {
		token = undefined!;
		mockSendEmail.mockClear();
		onEmailVerificationMock.mockClear();
	});

	test("should send a verification email when enabled", async ({ expect }) => {
		vi.spyOn(
			auth.options.emailAndPassword,
			"requireEmailVerification",
			"get",
		).mockReturnValue(true);

		await sendVerificationEmail();

		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser!.email,
			expect.any(String),
		);
	});

	test("should send a verification email if verification is required and user is not verified", async ({
		expect,
	}) => {
		vi.spyOn(
			auth.options.emailAndPassword,
			"requireEmailVerification",
			"get",
		).mockReturnValue(true);

		await expect(signIn()).rejects.toThrow(Error);

		expect(mockSendEmail).toHaveBeenCalledWith(
			testUser!.email,
			expect.any(String),
		);
	});

	test("should verify email", async ({ expect }) => {
		vi.spyOn(
			auth.options.emailAndPassword,
			"requireEmailVerification",
			"get",
		).mockReturnValue(true);

		await sendVerificationEmail();

		if (!token) throw new Error("Token not populated");
		const res = await client.verifyEmail.$get({ query: { token } });
		expect(res.data?.data.success).toBe(False); // because autoSignInAfterVerification is off
	});

	test("should redirect to callback", async ({ expect }) => {
		vi.spyOn(
			auth.options.emailAndPassword,
			"requireEmailVerification",
			"get",
		).mockReturnValue(true);

		await sendVerificationEmail();

		if (!token) throw new Error("Token not populated");
		await client.verifyEmail.$get(
			{ query: { token, callbackURL: "/callback" } },
			{
				fetchOptions: {
					onError: (ctx) => {
						const location = ctx.response.headers.get("location");
						expect(location).toBe("/callback");
					},
				},
			},
		);
	});

	test("should sign in after verification when autoSignInAfterVerification is true", async ({
		expect,
	}) => {
		vi.spyOn(
			auth.options.emailAndPassword,
			"requireEmailVerification",
			"get",
		).mockReturnValue(true);
		vi.spyOn(
			auth.options.emailVerification,
			"autoSignInAfterVerification",
			"get",
		).mockReturnValue(true);

		await sendVerificationEmail();

		let sessionToken = "";
		if (!token) throw new Error("Token not populated");
		await client.verifyEmail.$get(
			{ query: { token } },
			{
				fetchOptions: {
					onSuccess(context) {
						sessionToken = context.response.headers.get("set-auth-token") || "";
					},
				},
			},
		);
		expect(sessionToken.length).toBeGreaterThan(10);
	});

	test("should use custom expiresIn and reject expired tokens", async ({
		expect,
		onTestFinished,
	}) => {
		vi.useFakeTimers();
		onTestFinished(() => void vi.useRealTimers());

		vi.spyOn(
			auth.options.emailAndPassword,
			"requireEmailVerification",
			"get",
		).mockReturnValue(true);
		vi.spyOn(
			auth.options.emailVerification,
			"expiresIn",
			"get",
		).mockReturnValue(10);

		await sendVerificationEmail();

		await vi.advanceTimersByTimeAsync(10 * 1000);

		if (!token) throw new Error("Token not populated");
		const res = await client.verifyEmail.$get({ query: { token } });
		expect((res.error as { code?: string })?.code, JSON.stringify(res)).toBe(
			"TOKEN_EXPIRED",
		);
	});

	test("should call onEmailVerification callback when email is verified", async ({
		expect,
	}) => {
		vi.spyOn(
			auth.options.emailAndPassword,
			"requireEmailVerification",
			"get",
		).mockReturnValue(true);
		vi.spyOn(
			auth.options.emailVerification,
			"onEmailVerification",
			"get",
		).mockReturnValue(onEmailVerificationMock);

		await sendVerificationEmail();

		if (!token) throw new Error("Token not populated");
		const res = await client.verifyEmail.$get({ query: { token } });
		expect(res.data?.success, JSON.stringify(res)).toBe(True);
		expect(onEmailVerificationMock).toHaveBeenCalledWith(
			expect.objectContaining({ email: testUser!.email }),
			expect.any(Object),
		);
	});

	describe("Secondary Storage", async (test) => {
		test("should verify email and update session correctly using secondary storage", async ({
			expect,
		}) => {
			vi.spyOn(
				auth.options.emailVerification,
				"autoSignInAfterVerification",
				"get",
			).mockReturnValue(true);
			vi.spyOn(auth.options, "secondaryStorage", "get").mockReturnValue({
				set(key: string, value: string, _ttl?: number) {
					store.set(key, value);
				},
				get(key: string) {
					return store.get(key) || null;
				},
				delete(key: string) {
					store.delete(key);
				},
			});

			await sendVerificationEmail();

			const headers = new Headers();
			const captureCookies = createCookieCapture(headers);
			if (!token) throw new Error("Token not populated");
			const res2 = await client.verifyEmail.$get(
				{ query: { token } },
				{ fetchOptions: { onSuccess: captureCookies() } },
			);
			expect(res2.data?.success, JSON.stringify(res2)).toBe(true);

			const session = await client.getSession.$get({ query: {} }, { headers });
			expect(session.data?.data.user.email).toBe(testUser!.email);
			expect(session.data?.data.user.emailVerified).toBe(true);
		});

		test("should change email and verify with secondary storage", async ({
			expect,
		}) => {
			vi.spyOn(auth.options.user.changeEmail, "enabled", "get").mockReturnValue(
				true,
			);
			vi.spyOn(
				auth.options.emailVerification,
				"autoSignInAfterVerification",
				"get",
			).mockReturnValue(true);
			vi.spyOn(auth.options, "secondaryStorage", "get").mockReturnValue({
				set(key: string, value: string, _ttl?: number) {
					store.set(key, value);
				},
				get(key: string) {
					return store.get(key) || null;
				},
				delete(key: string) {
					store.delete(key);
				},
			});

			const { headers } = await signIn();

			await auth.api.changeEmail(
				{ json: { newEmail: "new@email.com" } },
				{ headers },
			);

			const newHeaders = new Headers();
			const captureCookies = createCookieCapture(newHeaders);
			if (!token) throw new Error("Token not populated");
			const res = await client.verifyEmail.$get(
				{ query: { token } },
				{
					headers,
					fetchOptions: { onSuccess: captureCookies() },
				},
			);
			expect(res.data?.success, JSON.stringify(res)).toBe(true);

			const session = await client.getSession.$get(
				{ query: {} },
				{ headers: newHeaders },
			);
			expect(session.data?.data.user.email).toBe("new@email.com");
			expect(session.data?.data.user.emailVerified).toBe(false);
		});

		test("should set emailVerified on all sessions across devices", async ({
			expect,
		}) => {
			vi.spyOn(
				auth.options.emailVerification,
				"autoSignInAfterVerification",
				"get",
			).mockReturnValue(true);
			vi.spyOn(auth.options, "secondaryStorage", "get").mockReturnValue({
				set(key: string, value: string, _ttl?: number) {
					store.set(key, value);
				},
				get(key: string) {
					return store.get(key) || null;
				},
				delete(key: string) {
					store.delete(key);
				},
			});

			const { user, headers: secondSignInHeaders } = await createUser();

			await sendVerificationEmail(user.email);

			const headers = new Headers();
			const captureCookies = createCookieCapture(headers);

			if (!token) throw new Error("Token not populated");
			await client.verifyEmail.$get(
				{ query: { token } },
				{ fetchOptions: { onSuccess: captureCookies() } },
			);

			const session = await client.getSession.$get({ query: {} }, { headers });
			expect(session.data?.data.user.email).toBe(user.email);
			expect(session.data?.data.user.emailVerified).toBe(true);

			const secondSignInSession = await client.getSession.$get(
				{ query: {} },
				{ headers: secondSignInHeaders },
			);
			expect(secondSignInSession.data?.data.user.email).toBe(user.email);
			expect(secondSignInSession.data?.data.user.emailVerified).toBe(true);
		});
	});
});
