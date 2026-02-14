import { createRoute, req, res } from "@faire-auth/core/factory";
import { describe } from "vitest";
import * as z from "zod";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils";
import { createEndpoint } from "../factory/endpoint";
import { originCheck } from "./origin-check";

describe("Origin Check", async (test) => {
	const { $Infer, auth, customFetchImpl, testUser, client } =
		await getTestInstance({
			trustedOrigins: [
				"http://localhost:5000",
				"https://trusted.com",
				"*.my-site.com",
			],
			emailAndPassword: {
				enabled: true,
				async sendResetPassword(_url, _user) {},
			},
			advanced: { disableCSRFCheck: false },
		});
	const app = $Infer.app(auth.options);

	test("should allow trusted origins", async ({ expect }) => {
		const res = await client.signIn.email.$post(
			{
				json: {
					email: testUser.email,
					password: testUser.password,
					callbackURL: "http://localhost:3000/callback",
				},
			},
			{ headers: { origin: "http://localhost:3000" } },
		);
		expect(res.data?.data.user).toBeDefined();
	});

	test("should not allow untrusted origins", async ({ expect }) => {
		const res = await client.signIn.email.$post({
			json: {
				email: "test@test.com",
				password: "password",
				callbackURL: "http://malicious.com",
			},
		});
		expect(res.error?.status).toBe(403);
		expect((res.error as { message?: string })?.message).toBe(
			"Invalid callbackURL",
		);
	});

	test("should allow query params in callback url", async ({ expect }) => {
		const res = await client.signIn.email.$post(
			{
				json: {
					email: testUser.email,
					password: testUser.password,
					callbackURL: "/dashboard?test=123",
				},
			},
			{ headers: { origin: "http://localhost:3000" } },
		);

		expect(res.data?.data.user).toBeDefined();
	});

	test("should allow plus signs in the callback url", async ({ expect }) => {
		const res = await client.signIn.email.$post(
			{
				json: {
					email: testUser.email,
					password: testUser.password,
					callbackURL: "/dashboard+page?test=123+456",
				},
			},
			{ headers: { origin: "https://localhost:3000" } },
		);
		expect(res.data?.data.user).toBeDefined();
	});

	test("should reject callback url with double slash", async ({ expect }) => {
		const res = await client.signIn.email.$post(
			{
				json: {
					email: testUser.email,
					password: testUser.password,
					callbackURL: "//evil.com",
				},
			},
			{ headers: { origin: "https://localhost:3000" } },
		);
		expect(res.error?.status).toBe(403);
	});

	test("should reject callback urls with encoded malicious content", async ({
		expect,
	}) => {
		const maliciousPatterns = [
			"/%5C/evil.com",
			`/\\/\\/evil.com`,
			"/%5C/evil.com",
			"/..%2F..%2Fevil.com",
			"javascript:alert('xss')",
			"data:text/html,<script>alert('xss')</script>",
		];

		for (const pattern of maliciousPatterns) {
			const res = await client.signIn.email.$post(
				{
					json: {
						email: testUser.email,
						password: testUser.password,
						callbackURL: pattern,
					},
				},
				{ headers: { origin: "https://localhost:3000" } },
			);
			expect(res.error?.status).toBe(403);
		}
	});

	test("should reject untrusted origin headers", async ({ expect }) => {
		const res = await client.signIn.email.$post(
			{
				json: { email: testUser.email, password: testUser.password },
			},
			{ headers: { origin: "malicious.com", cookie: "session=123" } },
		);
		expect(res.error?.status).toBe(403);
	});

	test("should reject untrusted origin headers which start with trusted origin", async ({
		expect,
	}) => {
		const res = await client.signIn.email.$post(
			{
				json: { email: testUser.email, password: testUser.password },
			},
			{
				headers: {
					origin: "https://trusted.com.malicious.com",
					cookie: "session=123",
				},
			},
		);
		expect(res.error?.status).toBe(403);
	});

	test("should reject untrusted origin subdomains", async ({ expect }) => {
		const res = await client.signIn.email.$post(
			{
				json: { email: testUser.email, password: testUser.password },
			},
			{
				headers: {
					origin: "http://sub-domain.trusted.com",
					cookie: "session=123",
				},
			},
		);
		expect(res.error?.status).toBe(403);
	});

	test("should allow untrusted origin if they don't contain cookies", async ({
		expect,
	}) => {
		const res = await client.signIn.email.$post(
			{
				json: { email: testUser.email, password: testUser.password },
			},
			{ headers: { origin: "http://sub-domain.trusted.com" } },
		);
		expect(res.data?.data.user).toBeDefined();
	});

	test("should reject untrusted redirectTo", async ({ expect }) => {
		const res = await client.requestPasswordReset.$post({
			json: { email: testUser.email, redirectTo: "http://malicious.com" },
		});
		expect(res.error?.status).toBe(403);
		expect((res.error as { message?: string })?.message).toBe(
			"Invalid redirectURL",
		);
	});

	test("should work with list of trusted origins", async ({ expect }) => {
		const res = await client.requestPasswordReset.$post(
			{
				json: {
					email: testUser.email,
					redirectTo: "http://localhost:5000/reset-password",
				},
			},
			{ headers: { origin: "https://trusted.com" } },
		);
		expect(res.data?.success).toBeTruthy();

		const res2 = await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{ fetchOptions: { query: { currentURL: "http://localhost:5000" } } },
		);
		expect(res2.data?.data.user).toBeDefined();
	});

	test("should work with wildcard trusted origins", async ({ expect }) => {
		const client = createAuthClient<typeof app>()({
			baseURL: "https://sub-domain.my-site.com",
			fetchOptions: {
				customFetchImpl,
				headers: { origin: "https://sub-domain.my-site.com" },
			},
		});
		const res = await client.signIn.email.$post({
			json: {
				email: testUser.email,
				password: testUser.password,
				callbackURL: "https://sub-domain.my-site.com/callback",
			},
		});
		expect(res.data?.data.user).toBeDefined();

		// Test another subdomain with the wildcard pattern
		const client2 = createAuthClient<typeof app>()({
			baseURL: "https://another-sub.my-site.com",
			fetchOptions: {
				customFetchImpl,
				headers: { origin: "https://another-sub.my-site.com" },
			},
		});
		const res2 = await client2.signIn.email.$post({
			json: {
				email: testUser.email,
				password: testUser.password,
				callbackURL: "https://another-sub.my-site.com/callback",
			},
		});
		expect(res2.data?.data.user).toBeDefined();
	});

	test("should work with GET requests", async ({ expect }) => {
		const client = createAuthClient<typeof app>()({
			baseURL: "https://sub-domain.my-site.com",
			fetchOptions: {
				customFetchImpl,
				headers: { origin: "https://google.com", cookie: "value" },
			},
		});
		const res = await client.$fetch("/ok");
		expect(res.data, JSON.stringify(res.error)).toMatchObject({
			success: true,
		});
	});

	test("should handle POST requests with proper origin validation", async ({
		expect,
	}) => {
		// Test with valid origin
		const validRes = await client.signIn.email.$post(
			{
				json: { email: testUser.email, password: testUser.password },
			},
			{ headers: { origin: "http://localhost:5000", cookie: "session=123" } },
		);
		expect(validRes.data?.data.user).toBeDefined();

		// Test with invalid origin
		const invalidRes = await client.signIn.email.$post(
			{
				json: { email: testUser.email, password: testUser.password },
			},
			{
				headers: {
					origin: "http://untrusted-domain.com",
					cookie: "session=123",
				},
			},
		);
		expect(invalidRes.error?.status).toBe(403);
	});

	test("should work with relative callbackURL with query params", async ({
		expect,
	}) => {
		const res = await client.signIn.email.$post({
			json: {
				email: testUser.email,
				password: testUser.password,
				callbackURL: "/dashboard?email=123@email.com",
			},
		});
		expect(res.data?.data.user).toBeDefined();
	});
});

describe("origin check middleware", async (test) => {
	test("should return invalid origin", async ({ expect }) => {
		const { $Infer, auth } = await getTestInstance({
			trustedOrigins: ["https://trusted-site.com"],
			plugins: [
				{
					id: "test",
					routes: {
						test: createEndpoint(
							createRoute({
								operationId: "test",
								method: "get",
								path: "/test",
								middleware: [
									originCheck((ctx) => ctx.req.query("callbackURL")!),
								],
								request: req()
									.qry(z.object({ callbackURL: z.string() }))
									.bld(),
								responses: res(z.string()).bld(),
							}),
							(_o) => async (ctx) =>
								ctx.render(ctx.req.valid("query").callbackURL, 200),
						),
					},
				},
			],
		});
		const app = $Infer.app(auth.options);
		const client = $Infer.client(app);
		const invalid = await client.$fetch(
			"/test?callbackURL=https://malicious-site.com",
		);
		expect(invalid.error?.status).toBe(403);
		const valid = await client.$fetch("/test?callbackURL=/dashboard");
		expect(valid.data).toBe("/dashboard");
		const validTrusted = await client.$fetch(
			"/test?callbackURL=https://trusted-site.com/path",
		);
		expect(validTrusted.data).toBe("https://trusted-site.com/path");

		const sampleInternalEndpointInvalid = await client.$fetch(
			"/verify-email?callbackURL=https://malicious-site.com&token=xyz",
		);
		expect(sampleInternalEndpointInvalid.error?.status).toBe(403);
	});
});
