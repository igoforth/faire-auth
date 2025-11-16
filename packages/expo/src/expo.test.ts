import { faireAuth, defineOptions } from "faire-auth";
import { oAuthProxy } from "faire-auth/plugins";
import { getTestInstance } from "faire-auth/test";
import { describe, expect, it, vi } from "vitest";
import { expoClient } from "./client";
import { expo } from "./index";

vi.mock("expo-web-browser", async () => {
	return {
		openAuthSessionAsync: vi.fn(async (...args) => {
			fn(...args);
			return {
				type: "success",
				url: "faire-auth://?cookie=faire-auth.session_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYxMzQwZj",
			};
		}),
	};
});

vi.mock("react-native", async () => {
	return {
		Platform: {
			OS: "android",
		},
	};
});

vi.mock("expo-constants", async () => {
	return {
		default: {
			platform: {
				scheme: "faire-auth",
			},
		},
	};
});

vi.mock("expo-linking", async () => {
	return {
		createURL: vi.fn((url) => `faire-auth://${url}`),
	};
});

const fn = vi.fn();

describe("expo", async () => {
	const storage = new Map<string, string>();
	const opts = defineOptions({
		baseURL: "http://localhost:3000",
		// database: new Database(":memory:"),
		emailAndPassword: {
			enabled: true,
		},
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
			},
		},
		plugins: [expo(), oAuthProxy()],
		trustedOrigins: ["faire-auth://"],
	});
	const { $Infer, auth } = await getTestInstance(opts, {
		disableTestUser: true,
		clientOptions: {
			plugins: [
				expoClient({
					storage: {
						getItem: (key) => storage.get(key) || null,
						setItem: async (key, value) => storage.set(key, value),
					},
				}),
			],
		},
	});
	const app = $Infer.app(opts);
	const client = $Infer.client(app);

	// beforeAll(async () => {
	// 	// const { runMigrations } = await getMigrations(auth.options);
	// 	// await runMigrations();
	// 	vi.useFakeTimers();
	// });
	// afterAll(() => {
	// 	vi.useRealTimers();
	// });

	it("should store cookie with expires date", async () => {
		const testUser = {
			email: "test@test.com",
			password: "password",
			name: "Test User",
		};
		await client.signUp.email.$post({ json: testUser });
		const storedCookie = storage.get("faire-auth_cookie");
		expect(storedCookie, JSON.stringify(storage)).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["faire-auth.session_token"]).toMatchObject({
			value: expect.stringMatching(/.+/),
			expires: expect.any(String),
		});
	});

	it("should send cookie and get session", async () => {
		const { data } = await client.getSession.$get({ query: {} });
		expect(data?.data).toMatchObject({
			session: expect.any(Object),
			user: expect.any(Object),
		});
	});

	it("should use the scheme to open the browser", async () => {
		const res = await client.signIn.social.$post({
			json: {
				provider: "google",
				callbackURL: "/dashboard",
			},
		});
		const stateId = res.data?.data.url?.split("state=")[1].split("&")[0];
		const ctx = await auth.$context;
		if (!stateId) throw new Error("State ID not found");

		const state = await ctx.internalAdapter.findVerificationValue(stateId);
		// TODO: this fails due to our normalization of callback URLs
		// see packages/call/src/static/schema.ts
		const callbackURL = JSON.parse(state?.value || "{}").callbackURL;
		expect(callbackURL).toBe("faire-auth:///dashboard");
		expect(res.data?.data).toMatchObject({
			url: expect.stringContaining("accounts.google"),
		});
		expect(fn).toHaveBeenCalledWith(
			expect.stringContaining("accounts.google"),
			"faire-auth:///dashboard",
		);
	});

	it("should get cookies", async () => {
		const c = client.getCookie();
		expect(c).includes("faire-auth.session_token");
	});

	it("should correctly parse multiple Set-Cookie headers with Expires commas", async () => {
		const header =
			"faire-auth.session_token=abc; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Path=/, faire-auth.session_data=xyz; Expires=Thu, 22 Oct 2015 07:28:00 GMT; Path=/";
		const map = (await import("./client")).parseSetCookieHeader(header);
		expect(map.get("faire-auth.session_token")?.value).toBe("abc");
		expect(map.get("faire-auth.session_data")?.value).toBe("xyz");
	});

	it("should preserve unchanged client store session properties on signout", async () => {
		const before = client.$store.atoms.session.get();
		await client.signOut.$post();
		const after = client.$store.atoms.session.get();

		expect(after).toMatchObject({
			...before,
			data: null,
			error: null,
			isPending: false,
		});
	});
});

describe("expo with cookieCache", async () => {
	const storage = new Map<string, string>();
	const opts = defineOptions({
		baseURL: "http://localhost:3000",
		// database: new Database(":memory:"),
		emailAndPassword: {
			enabled: true,
		},
		socialProviders: {
			google: {
				clientId: "test",
				clientSecret: "test",
			},
		},
		plugins: [expo(), oAuthProxy()],
		trustedOrigins: ["faire-auth://"],
		session: {
			expiresIn: 5,
			cookieCache: {
				enabled: true,
				maxAge: 1,
			},
		},
	});
	const { $Infer, auth } = await getTestInstance(opts, {
		disableTestUser: true,
		clientOptions: {
			plugins: [
				expoClient({
					storage: {
						getItem: (key) => storage.get(key) || null,
						setItem: async (key, value) => storage.set(key, value),
					},
				}),
			],
		},
	});
	const app = $Infer.app(opts);
	const client = $Infer.client(app);

	// beforeAll(async () => {
	// 	// const { runMigrations } = await getMigrations(auth.options);
	// 	// await runMigrations();
	// 	vi.useFakeTimers();
	// });
	// afterAll(() => {
	// 	vi.useRealTimers();
	// });

	it("should store cookie with expires date", async () => {
		const testUser = {
			email: "test@test.com",
			password: "password",
			name: "Test User",
		};
		await client.signUp.email.$post({ json: testUser });
		const storedCookie = storage.get("faire-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["faire-auth.session_token"]).toMatchObject({
			value: expect.stringMatching(/.+/),
			expires: expect.any(String),
		});
		expect(parsedCookie["faire-auth.session_data"]).toMatchObject({
			value: expect.stringMatching(/.+/),
			expires: expect.any(String),
		});
	});

	it("should refresh session_data when it expired without erasing session_token", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(1000);
		const { data } = await client.getSession.$get({ query: {} });
		expect(data?.data).toMatchObject({
			session: expect.any(Object),
			user: expect.any(Object),
		});
		const storedCookie = storage.get("faire-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["faire-auth.session_token"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
		expect(parsedCookie["faire-auth.session_data"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
		vi.useRealTimers();
	});

	it("should erase both session_data and session_token when token expired", async () => {
		vi.useFakeTimers();
		vi.advanceTimersByTime(5000);
		const { data } = await client.getSession.$get({ query: {} });
		expect(data).toBeNull();
		const storedCookie = storage.get("faire-auth_cookie");
		expect(storedCookie).toBeDefined();
		const parsedCookie = JSON.parse(storedCookie || "");
		expect(parsedCookie["faire-auth.session_token"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
		expect(parsedCookie["faire-auth.session_data"]).toMatchObject({
			value: expect.any(String),
			expires: expect.any(String),
		});
		vi.useRealTimers();
	});

	it("should add `exp://` to trusted origins", async () => {
		vi.stubEnv("NODE_ENV", "development");
		const auth = faireAuth({
			plugins: [expo()],
			trustedOrigins: ["http://localhost:3000"],
		});
		const ctx = await auth.$context;
		expect(auth.options.trustedOrigins).toContain("exp://");
		expect(auth.options.trustedOrigins).toContain("http://localhost:3000");
	});
});
