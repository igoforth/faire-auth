import { createRoute, req, res } from "@faire-auth/core/factory";
import { describe } from "vitest";
import * as z from "zod";
import { signCookieValue } from "../crypto";
import { getTestInstance } from "../test-utils";
import { createTestEndpoint } from "../test-utils/test-endpoint";
import type { FaireAuthOptions } from "../types/options";
import {
	createCookieCapture,
	getCookie,
	getCookieCache,
	getCookies,
	getSessionCookie,
	getSignedCookie,
	parseCookies,
	setCookie,
	setSignedCookie,
} from "./cookies";

describe("parseCookies", (test) => {
	test("should parse cookies", ({ expect }) => {
		const cookies = parseCookies("test=test; test2=test 2");
		expect(cookies.get("test")).toBe("test");
		expect(cookies.get("test2")).toBe("test 2");
	});

	test("should parse cookies with encoded values", ({ expect }) => {
		const cookies = parseCookies("test=test; test2=test%202");
		expect(cookies.get("test")).toBe("test");
		expect(cookies.get("test2")).toBe("test 2");
	});
});

describe("get-cookies", (test) => {
	test("should get cookies", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				request: req()
					.bdy(z.object({ cookieName: z.string() }))
					.bld(),
				responses: res(z.string().optional()).bld(),
			}),
			(_o) => async (ctx) =>
				ctx.json(getCookie(ctx, ctx.req.valid("json").cookieName), 200),
		);
		const response = await execute(
			{ json: { cookieName: "test" } },
			{ headers: { cookie: "test=test" } },
		);
		expect(response).toBe("test");
	});

	test("should get signed cookies", async ({ expect }) => {
		const secret = "test";
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				request: req()
					.bdy(z.object({ cookieName: z.string() }))
					.bld(),
				responses: res(z.string().or(z.literal(false)).nullish()).bld(),
			}),
			(_o) => async (ctx) =>
				ctx.json(
					await getSignedCookie(ctx, secret, ctx.req.valid("json").cookieName),
					200,
				),
		);
		const response = await execute(
			{ json: { cookieName: "test" } },
			{ headers: { cookie: `test=${await signCookieValue("test", secret)}` } },
		);
		expect(response).toBe("test");
	});

	test("should return null if signature is invalid", async ({ expect }) => {
		const secret = "test";
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				request: req()
					.bdy(z.object({ cookieName: z.string() }))
					.bld(),
				responses: res(z.string().or(z.literal(false)).nullish()).bld(),
			}),
			(_o) => async (ctx) =>
				ctx.json(
					(await getSignedCookie(
						ctx,
						secret,
						ctx.req.valid("json").cookieName,
					)) ?? null,
					200,
				),
		);
		const response = await execute(
			{ json: { cookieName: "test" } },
			{ headers: { cookie: `test=invalid_signature` } },
		);
		expect(response).toBe(null);
	});

	test("should return false if secret is invalid", async ({ expect }) => {
		const secret = "test";
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				request: req()
					.bdy(z.object({ cookieName: z.string() }))
					.bld(),
				responses: res(z.string().or(z.literal(false)).optional()).bld(),
			}),
			(_o) => async (ctx) =>
				ctx.json(
					await getSignedCookie(
						ctx,
						"invalid_secret",
						ctx.req.valid("json").cookieName,
					),
					200,
				),
		);
		const response = await execute(
			{ json: { cookieName: "test" } },
			{ headers: { cookie: `test=${await signCookieValue("test", secret)}` } },
		);
		expect(response).toBe(false);
	});
});

describe("set-cookies", (test) => {
	test("should set cookie", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				responses: res(z.null()).bld(),
			}),
			(_o) => async (ctx) => {
				setCookie(ctx, "test", "test");
				return ctx.newResponse(null, 200);
			},
		);
		const response = await execute({ returnHeaders: true });
		expect(response.headers.getSetCookie()).toContain("test=test; Path=/");
	});

	test("should set multiple cookies", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				responses: res(z.null()).bld(),
			}),
			(_o) => async (ctx) => {
				setCookie(ctx, "test", "test");
				setCookie(ctx, "test2", "test2");
				setCookie(ctx, "test3", "test3");
				return ctx.newResponse(null, 200);
			},
		);
		const response = await execute({ returnHeaders: true });
		expect(response.headers.getSetCookie()).toEqual([
			"test=test; Path=/",
			"test2=test2; Path=/",
			"test3=test3; Path=/",
		]);
	});

	test("should apply options", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				responses: res(z.null()).bld(),
			}),
			(_o) => async (ctx) => {
				setCookie(ctx, "test", "test", {
					secure: true,
					httpOnly: true,
					path: "/",
				});
				return ctx.newResponse(null, 200);
			},
		);
		const response = await execute({ returnHeaders: true });
		expect(response.headers.getSetCookie()).toContain(
			"test=test; Path=/; HttpOnly; Secure",
		);
	});

	test("should apply multiple cookies with options", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				responses: res(z.null()).bld(),
			}),
			(_o) => async (ctx) => {
				setCookie(ctx, "test", "test", {
					secure: true,
					httpOnly: true,
					path: "/",
				});
				setCookie(ctx, "test2", "test2", {
					secure: true,
					httpOnly: true,
					path: "/",
				});
				return ctx.newResponse(null, 200);
			},
		);
		const response = await execute({ returnHeaders: true });
		expect(response.headers.getSetCookie()).toEqual([
			"test=test; Path=/; HttpOnly; Secure",
			"test2=test2; Path=/; HttpOnly; Secure",
		]);
	});

	test("should set signed cookie", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				method: "post",
				path: "/test",
				responses: { 200: { description: "Success" } },
			}),
			(_o) => async (ctx) => {
				await setSignedCookie(ctx, "test", "test", "test");
				return ctx.newResponse(null, 200);
			},
		);
		const response = await execute({ returnHeaders: true });
		const setCookie = response.headers.get("set-cookie");
		const signature = setCookie?.split(".")[1];
		expect(setCookie).toContain("test=test.");
		expect(signature?.length).toBeGreaterThan(10);
	});

	test("should properly sign cookies", async ({ expect }) => {
		const { execute: executeSet } = createTestEndpoint(
			createRoute({
				operationId: "test-set",
				method: "post",
				path: "/test-set",
				responses: res(z.null()).bld(),
			}),
			(_o) => async (ctx) => {
				await setSignedCookie(ctx, "test", "test", "test");
				return ctx.newResponse(null, 200);
			},
		);
		// const response = await executeSet({ returnHeaders: true });
		// const setCookie = response.headers.get("set-cookie");
		const responseSet = await executeSet({ returnHeaders: true });
		const cookies = responseSet.headers.getSetCookie();
		expect(cookies.length).toBe(1);
		const signedValue = cookies[0]!.split("=")[1]!.split(";")[0]!;

		const { execute: executeGet } = createTestEndpoint(
			createRoute({
				operationId: "test-get",
				method: "post",
				path: "/test-get",
				request: req().bdy(z.object({})).bld(),
				responses: res(z.string().or(z.literal(false)).nullish()).bld(),
			}),
			(_o) => async (ctx) =>
				ctx.json((await getSignedCookie(ctx, "test", "test")) ?? null, 200),
		);
		const responseGet = await executeGet(
			{ json: {} },
			{ headers: { cookie: `test=${signedValue}` } },
		);
		expect(responseGet).toBe("test");
	});
});

describe("cookies", async (test) => {
	const { client, testUser } = await getTestInstance();

	test("should set cookies with default options", async ({ expect }) => {
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onResponse(context) {
						const setCookie = context.response.headers.get("set-cookie");
						expect(setCookie).toBeDefined();
						expect(setCookie).toContain("Path=/");
						expect(setCookie).toContain("HttpOnly");
						expect(setCookie).toContain("SameSite=Lax");
						expect(setCookie).toContain("faire-auth");
					},
				},
			},
		);
	});

	test("should set multiple cookies", async ({ expect }) => {
		await client.signIn.social.$post(
			{ json: { provider: "github", callbackURL: "https://example.com" } },
			{
				fetchOptions: {
					onSuccess(context) {
						const cookies = context.response.headers.getSetCookie();
						expect(
							cookies.length,
							JSON.stringify(context.response.url),
						).toBeGreaterThan(1);
					},
				},
			},
		);
	});

	test("should use secure cookies", async ({ expect }) => {
		const { client, testUser } = await getTestInstance({
			advanced: { useSecureCookies: true },
		});
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onResponse(context) {
						const setCookie = context.response.headers.get("set-cookie");
						expect(setCookie).toContain("Secure");
					},
				},
			},
		);
	});

	test("should use secure cookies when the base url is https", async ({
		expect,
	}) => {
		const { client, testUser } = await getTestInstance({
			baseURL: "https://example.com",
		});

		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onResponse(context) {
						const setCookie = context.response.headers.get("set-cookie");
						expect(setCookie).toContain("Secure");
					},
				},
			},
		);
	});
});

describe("crossSubdomainCookies", (test) => {
	test("should update cookies with custom domain", async ({ expect }) => {
		const { client, testUser } = await getTestInstance({
			advanced: {
				crossSubDomainCookies: { enabled: true, domain: "example.com" },
			},
		});

		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onResponse(context) {
						const setCookie = context.response.headers.get("set-cookie");
						expect(setCookie).toContain("Domain=example.com");
						expect(setCookie).toContain("SameSite=Lax");
					},
				},
			},
		);
	});

	test("should use default domain from baseURL if not provided", async ({
		expect,
	}) => {
		const { testUser, client } = await getTestInstance({
			baseURL: "https://example.com",
			advanced: { crossSubDomainCookies: { enabled: true } },
		});

		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onResponse(context) {
						const setCookie = context.response.headers.get("set-cookie");
						expect(setCookie).toContain("Domain=example.com");
					},
				},
			},
		);
	});
});

describe("cookie configuration", (test) => {
	test("should return correct cookie options based on configuration", async ({
		expect,
	}) => {
		const options = {
			baseURL: "https://example.com",
			database: {} as NonNullable<FaireAuthOptions["database"]>,
			advanced: {
				useSecureCookies: true,
				crossSubDomainCookies: { enabled: true, domain: "example.com" },
				cookiePrefix: "test-prefix",
			},
		} satisfies FaireAuthOptions;

		const cookies = getCookies(options);

		expect(cookies.sessionToken.options.secure).toBe(true);
		expect(cookies.sessionToken.name).toContain("test-prefix.session_token");
		expect(cookies.sessionData.options.sameSite).toBe("lax");
		expect(cookies.sessionData.options.domain).toBe("example.com");
	});
});

describe("getSessionCookie", async (test) => {
	test("should return the correct session cookie", async ({ expect }) => {
		const { signIn } = await getTestInstance();
		const { headers } = await signIn();
		const request = new Request("http://localhost:3000/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request);
		expect(cookies).not.toBeNull();
		expect(cookies).toBeDefined();
	});

	test("should return the correct session cookie in production", async ({
		expect,
	}) => {
		const { client, testUser } = await getTestInstance({
			baseURL: "https://example.com",
		});
		const headers = new Headers();
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{ fetchOptions: { onSuccess: createCookieCapture(headers)() } },
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request);
		expect(cookies).not.toBeNull();
		expect(cookies).toBeDefined();
	});

	test("should allow override cookie prefix", async ({ expect }) => {
		const { client, testUser } = await getTestInstance({
			advanced: { useSecureCookies: true, cookiePrefix: "test-prefix" },
		});
		const headers = new Headers();
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{ fetchOptions: { onSuccess: createCookieCapture(headers)() } },
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request, { cookiePrefix: "test-prefix" });
		expect(cookies).not.toBeNull();
	});

	test("should allow override cookie name", async ({ expect }) => {
		const { client, testUser } = await getTestInstance({
			advanced: {
				useSecureCookies: true,
				cookiePrefix: "test",
				cookies: { session_token: { name: "test-session-token" } },
			},
		});
		const headers = new Headers();
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{ fetchOptions: { onSuccess: createCookieCapture(headers)() } },
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request, {
			cookieName: "session-token",
			cookiePrefix: "test",
		});
		expect(cookies).not.toBeNull();
	});

	test("should return cookie cache", async ({ expect }) => {
		const { client, testUser } = await getTestInstance({
			session: { cookieCache: { enabled: true } },
		});
		const headers = new Headers();
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{ fetchOptions: { onSuccess: createCookieCapture(headers)() } },
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cache = await getCookieCache(request, {
			secret: "faire-auth.secret",
		});
		expect(cache).not.toBeNull();
		expect(cache).toMatchObject({
			user: {
				id: expect.any(String),
				email: expect.any(String),
				emailVerified: expect.any(Boolean),
			},
			session: { expiresAt: expect.any(Date), token: expect.any(String) },
		});
	});

	test("should return null if the cookie is invalid", async ({ expect }) => {
		const { client, testUser } = await getTestInstance({
			session: { cookieCache: { enabled: true } },
		});
		const headers = new Headers();
		await client.signIn.email.$post({
			json: { email: testUser.email, password: testUser.password },
		});
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cache = await getCookieCache(request, { secret: "wrong-secret" });
		expect(cache).toBeNull();
	});

	test("should throw an error if the secret is not provided", async ({
		expect,
	}) => {
		const { client, testUser } = await getTestInstance({
			session: { cookieCache: { enabled: true } },
		});
		const headers = new Headers();
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{ fetchOptions: { onSuccess: createCookieCapture(headers)() } },
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		await expect(getCookieCache(request)).rejects.toThrow();
	});
});
