import { afterEach, beforeEach, describe, vi } from "vitest";
import { getTestInstance } from "../../test-utils";
import type { RateLimit } from "../../types";

describe("rate-limiter", { timeout: 10000 }, async (test) => {
	const { client, testUser } = await getTestInstance({
		rateLimit: { enabled: true, window: 10, max: 20 },
	});

	test("should return 429 after 3 request for sign-in", async ({ expect }) => {
		for (let i = 0; i < 5; i++) {
			const response = await client.signIn.email.$post({
				json: { email: testUser.email, password: testUser.password },
			});
			if (i >= 3) expect(response.error?.status).toBe(429);
			else expect(response.error).toBeNull();
		}
	});

	test("should reset the limit after the window period", async ({ expect }) => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(11000);
		for (let i = 0; i < 5; i++) {
			const res = await client.signIn.email.$post({
				json: { email: testUser.email, password: testUser.password },
			});
			if (i >= 3) expect(res.error?.status).toBe(429);
			else expect(res.error).toBeNull();
		}
	});

	test("should respond the correct retry-after header", async ({ expect }) => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(3000);
		let retryAfter = "";
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onError(context) {
						retryAfter = context.response.headers.get("X-Retry-After") ?? "";
					},
				},
			},
		);
		expect(retryAfter).toBe("7");
	});

	test("should rate limit based on the path", async ({ expect }) => {
		const signInRes = await client.signIn.email.$post({
			json: { email: testUser.email, password: testUser.password },
		});
		expect(signInRes.error?.status).toBe(429);

		const signUpRes = await client.signUp.email.$post({
			json: {
				email: "new-test@email.com",
				password: testUser.password,
				name: "test",
			},
		});
		expect(signUpRes.error).toBeNull();
	});

	test("non-special-rules limits", async ({ expect }) => {
		for (let i = 0; i < 25; i++) {
			const response = await client.getSession.$get({ query: {} });
			expect(
				response.error?.status,
				`${i}: ${JSON.stringify(response.error)}`,
			).toBe(i >= 20 ? 429 : 401);
		}
	});

	test("query params should be ignored", async ({ expect }) => {
		for (let i = 0; i < 25; i++) {
			const response = await client.listSessions.$get({
				fetchOptions: { query: { "test-query": Math.random().toString() } },
			});

			if (i >= 20) expect(response.error?.status).toBe(429);
			else expect(response.error?.status).toBe(401);
		}
	});
});

describe("custom rate limiting storage", async (test) => {
	const store = new Map<string, string>();
	const expirationMap = new Map<string, number>();
	const { client, testUser } = await getTestInstance({
		rateLimit: { enabled: true },
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
				if (ttl) expirationMap.set(key, ttl);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
				expirationMap.delete(key);
			},
		},
	});

	test("should use custom storage", async ({ expect }) => {
		await client.getSession.$get({ query: {} });
		expect(store.size).toBe(3);
		let lastRequest = Date.now();
		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email.$post({
				json: { email: testUser.email, password: testUser.password },
			});
			const rateLimitData: RateLimit = JSON.parse(
				store.get("127.0.0.1/sign-in/email") ?? "{}",
			);
			expect(rateLimitData.lastRequest).toBeGreaterThanOrEqual(lastRequest);
			lastRequest = rateLimitData.lastRequest;
			if (i >= 3) {
				expect(response.error?.status).toBe(429);
				expect(rateLimitData.count).toBe(3);
			} else {
				expect(response.error).toBeNull();
				expect(rateLimitData.count).toBe(i + 1);
			}
		}
	});
});

describe("should work with custom rules", async (test) => {
	const { client, testUser } = await getTestInstance({
		rateLimit: {
			enabled: true,
			storage: "database",
			customRules: {
				"/sign-in/*": {
					window: 10,
					max: 2,
				},
				"/sign-up/email": {
					window: 10,
					max: 3,
				},
				"/get-session": false,
			},
		},
	});

	test("should use custom rules", async ({ expect }) => {
		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email.$post({
				json: { email: testUser.email, password: testUser.password },
			});
			if (i >= 2) expect(response.error?.status).toBe(429);
			else expect(response.error).toBeNull();
		}

		for (let i = 0; i < 5; i++) {
			const response = await client.signUp.email.$post({
				json: {
					email: `${Math.random()}@test.com`,
					password: testUser.password,
					name: "test",
				},
			});
			if (i >= 3) expect(response.error?.status).toBe(429);
			else expect(response.error).toBeNull();
		}
	});

	test("should use default rules if custom rules are not defined", async ({
		expect,
	}) => {
		for (let i = 0; i < 5; i++) {
			const response = await client.getSession.$get({ query: {} });
			if (i >= 20) expect(response.error?.status).toBe(429);
			else expect(response.error?.status).toBe(401);
		}
	});

	test("should not rate limit if custom rule is false", async ({ expect }) => {
		let i = 0;
		let response = null;
		for (; i < 110; i++) {
			response = await client.getSession
				.$get({ query: {} })
				.then((res) => res.error);
		}
		expect(response?.status).toBe(401);
		expect(i).toBe(110);
	});
});

describe("should work in development/test environment", (test) => {
	const LOCALHOST_IP = "127.0.0.1";
	const REQUEST_PATH = "/sign-in/email";

	let originalNodeEnv: string | undefined;
	beforeEach(() => {
		originalNodeEnv = process.env.NODE_ENV;
	});
	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv!;
		vi.unstubAllEnvs();
	});

	test("should work in development environment", async ({ expect }) => {
		vi.stubEnv("NODE_ENV", "development");

		const store = new Map<string, string>();
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				window: 10,
				max: 3,
			},
			secondaryStorage: {
				set(key, value) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
		});

		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email.$post({
				json: {
					email: testUser.email,
					password: testUser.password,
				},
			});

			if (i >= 3) expect(response.error?.status).toBe(429);
			else expect(response.error).toBeNull();
		}

		const signInKeys = Array.from(store.keys()).filter((key) =>
			key.endsWith(REQUEST_PATH),
		);

		expect(signInKeys.length).toBeGreaterThan(0);
		expect(signInKeys[0]).toBe(`${LOCALHOST_IP}${REQUEST_PATH}`);
	});

	test("should work in test environment", async ({ expect }) => {
		vi.stubEnv("NODE_ENV", "test");

		const store = new Map<string, string>();
		const { client, testUser } = await getTestInstance({
			rateLimit: {
				enabled: true,
				window: 10,
				max: 3,
			},
			secondaryStorage: {
				set(key, value) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
		});

		for (let i = 0; i < 4; i++) {
			const response = await client.signIn.email.$post({
				json: {
					email: testUser.email,
					password: testUser.password,
				},
			});

			if (i >= 3) expect(response.error?.status).toBe(429);
			else expect(response.error).toBeNull();
		}

		const signInKeys = Array.from(store.keys()).filter((key) =>
			key.endsWith(REQUEST_PATH),
		);

		expect(signInKeys.length).toBeGreaterThan(0);
		expect(signInKeys[0]).toBe(`${LOCALHOST_IP}${REQUEST_PATH}`);
	});
});
