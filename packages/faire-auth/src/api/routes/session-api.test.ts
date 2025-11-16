import { getDate } from "@faire-auth/core/utils";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { getTestInstance } from "../../test-utils";
import { createCookieCapture, parseSetCookieHeader } from "../../utils/cookies";

describe("session", async (test) => {
	const { client, signIn, createUser, testUser } = await getTestInstance({
		session: { updateAge: 60 * 60 * 24, expiresIn: 60 * 60 * 24 * 7 },
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("should set cookies correctly on sign in", async ({ expect }) => {
		const user = testUser!;
		const headers = new Headers();
		await client.signIn.email.$post(
			{ json: { email: user.email, password: user.password } },
			{
				fetchOptions: {
					onSuccess: (context) => {
						const cookies = parseSetCookieHeader(
							context.response.headers.getSetCookie(),
						);
						const sessionToken = cookies.get("faire-auth.session_token");
						expect(sessionToken).toMatchObject({
							value: expect.any(String),
							"max-age": 60 * 60 * 24 * 7,
							path: "/",
							samesite: "lax",
							httponly: true,
						});
						headers.set(
							"cookie",
							`faire-auth.session_token=${sessionToken!.value}`,
						);
					},
				},
			},
		);
		const { data, error } = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(data).not.toBeNull();
		const expiresAt = new Date(data!.data.session.expiresAt);
		const now = new Date();

		expect(expiresAt.getTime(), JSON.stringify(error)).toBeGreaterThan(
			now.getTime() + 6 * 24 * 60 * 60 * 1000,
		);
	});

	test("should return null when not authenticated", async ({ expect }) => {
		const response = await client.getSession.$get({ query: {} });
		expect(response.data).toBeNull();
	});

	test("should update session when update age is reached", async ({
		expect,
		onTestFinished,
	}) => {
		onTestFinished(() => void vi.useRealTimers());
		const { client, signIn } = await getTestInstance({
			session: {
				updateAge: 60,
				expiresIn: 60 * 2,
			},
		});
		const { headers } = await signIn();

		const { data } = await client.getSession.$get({ query: {} }, { headers });
		expect(data).not.toBeNull();
		const expiresAt = data!.data.session.expiresAt;

		expect(expiresAt).toBeTruthy();
		expect(new Date(expiresAt!).getTime()).toBeGreaterThan(
			new Date(Date.now() + 1000 * 2 * 59).getTime(),
		);
		expect(new Date(expiresAt!).getTime()).toBeLessThan(
			new Date(Date.now() + 1000 * 2 * 60).getTime(),
		);

		for (const t of [60, 80, 100, 121]) {
			const span = new Date();
			span.setSeconds(span.getSeconds() + t);
			vi.setSystemTime(span);
			const response = await client.getSession.$get(
				{ query: {} },
				{
					headers,
					fetchOptions: {
						onSuccess(context) {
							const parsed = parseSetCookieHeader(
								context.response.headers.getSetCookie(),
							);
							const maxAge = parsed.get("faire-auth.session_token")?.[
								"max-age"
							];
							expect(maxAge).toBe(t === 121 ? 0 : 60 * 2);
						},
					},
				},
			);
			if (t === 121)
				// expired
				expect(response.data).toBeNull();
			else
				expect(
					new Date(response.data?.data.session.expiresAt!).getTime(),
				).toBeGreaterThan(new Date(Date.now() + 1000 * 2 * 59).getTime());
		}
	});

	test("should update the session every time when set to 0", async ({
		expect,
		onTestFinished,
	}) => {
		onTestFinished(() => void vi.useRealTimers());
		const { client, signIn } = await getTestInstance({
			session: {
				updateAge: 0,
			},
		});
		const { headers } = await signIn();

		const session = await client.getSession.$get({ query: {} }, { headers });

		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 5);
		const session2 = await client.getSession.$get({ query: {} }, { headers });
		expect(session2.data?.data.session.expiresAt).not.toBe(
			session.data?.data.session.expiresAt,
		);
		expect(
			new Date(session2.data!.data.session.expiresAt).getTime(),
		).toBeGreaterThan(new Date(session.data!.data.session.expiresAt).getTime());
	});

	test("should handle 'don't remember me' option", async ({ expect }) => {
		const user = testUser!;
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		await client.signIn.email.$post(
			{
				json: {
					email: user.email,
					password: user.password,
					rememberMe: false,
				},
			},
			{
				fetchOptions: {
					onSuccess: captureCookies(),
				},
			},
		);
		const { data } = await client.getSession.$get({ query: {} }, { headers });
		if (!data?.success) throw new Error("No session found");

		const { expiresAt } = data.data.session;
		expect(new Date(expiresAt).valueOf()).toBeLessThanOrEqual(
			getDate(1000 * 60 * 60 * 24).valueOf(),
		);
		const response = await client.getSession.$get({ query: {} }, { headers });

		if (!response.data?.data.session) {
			throw new Error("No session found");
		}
		// Check that the session wasn't update
		expect(
			new Date(response.data.data.session.expiresAt).valueOf(),
		).toBeLessThanOrEqual(getDate(1000 * 60 * 60 * 24).valueOf());
	});

	test("should set cookies correctly on sign in after changing config", async ({
		expect,
	}) => {
		const user = testUser!;
		const headers = new Headers();

		await client.signIn.email.$post(
			{ json: { email: user.email, password: user.password } },
			{
				fetchOptions: {
					onSuccess(context) {
						const cookies = parseSetCookieHeader(
							context.response.headers.getSetCookie(),
						);
						expect(cookies.get("faire-auth.session_token")).toMatchObject({
							value: expect.any(String),
							"max-age": 60 * 60 * 24 * 7,
							path: "/",
							httponly: true,
							samesite: "lax",
						});
						headers.set(
							"cookie",
							`faire-auth.session_token=${
								cookies.get("faire-auth.session_token")?.value
							}`,
						);
					},
				},
			},
		);
		const { data } = await client.getSession.$get({ query: {} }, { headers });
		if (!data?.success) throw new Error("No session found");

		const expiresAt = new Date(data.data.session.expiresAt || "");
		const now = new Date();

		expect(expiresAt.getTime()).toBeGreaterThan(
			now.getTime() + 6 * 24 * 60 * 60 * 1000,
		);
	});

	test("should clear session on sign out", async ({ expect }) => {
		const user = testUser!;
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		await client.signIn.email.$post(
			{ json: { email: user.email, password: user.password } },
			{
				fetchOptions: {
					onSuccess: captureCookies(),
				},
			},
		);
		const data = await client.getSession.$get({ query: {} }, { headers });
		if (!data.data?.success) throw new Error("No session found");

		expect(data.data).not.toBeNull();
		await client.signOut.$post({ headers });
		const response = await client.getSession.$get({ query: {} }, { headers });
		expect(response.data);
	});

	test("should list sessions", async ({ expect }) => {
		const { headers } = await createUser();

		const response = await client.listSessions.$get({ headers });

		expect(response.data?.data.length).toBe(2);
	});

	test("should revoke session", async ({ expect }) => {
		const { headers } = await signIn();
		const { headers: headers2 } = await signIn();

		const { data: session } = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(session?.success).toBe(true);
		const { data: res3 } = await client.revokeSession.$post(
			{ json: { token: session!.data.session.token } },
			{ headers },
		);
		expect(res3?.success).toBe(true);
		const newSession = await client.getSession.$get({ query: {} }, { headers });
		expect(newSession.data).toBeNull();
		const { data: res4, error } = await client.revokeSessions.$post({
			headers: headers2,
		});
		expect(res4?.success).toBe(true);
	});
});

describe("session storage", async (test) => {
	const store = new Map<string, string>();
	const { client, signIn } = await getTestInstance({
		secondaryStorage: {
			set(key, value, _ttl) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		},
		rateLimit: { enabled: false },
	});

	beforeEach(() => {
		store.clear();
	});

	test("should store session in secondary storage", async ({ expect }) => {
		expect(store.size).toBe(0);
		const { headers, user } = await signIn();

		// since the instance creates a session on init, we expect the store to have 2 item (1 for session and 1 for active sessions record for the user)
		expect(store.size).toBe(2);
		const { data: session } = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(session?.data).toMatchObject({
			session: {
				userId: expect.any(String),
				token: expect.any(String),
				expiresAt: expect.any(Date),
				ipAddress: expect.any(String),
			},
			user: {
				email: user.email,
				emailVerified: user.emailVerified,
				id: user.id,
				image: user.image,
				name: user.name,
				updatedAt: user.updatedAt,
				createdAt: user.createdAt,
			},
		});
	});

	test("should list sessions", async ({ expect }) => {
		const { headers } = await signIn();

		const response = await client.listSessions.$get({ headers });
		expect(response.data?.data.length).toBe(1);
	});

	test("should revoke session", async ({ expect }) => {
		const { headers } = await signIn();

		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data).not.toBeNull();
		await client.revokeSession.$post(
			{ json: { token: session.data?.data.session.token || "" } },
			{ headers },
		);
		const revokedSession = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(revokedSession.data).toBeNull();
	});
});
