import { describe, expect, test, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils";
import { magicLinkClient } from "./client";
import { magicLink } from "./index";
import { createCookieCapture } from "../../utils/cookies";

interface VerificationEmail {
	email: string;
	token: string;
	url: string;
}

describe("magic link", async (test) => {
	let verificationEmail: VerificationEmail = { email: "", token: "", url: "" };
	const { $Infer, auth, customFetchImpl, testUser } = await getTestInstance({
		plugins: [
			magicLink({
				siteUrl: "http://localhost:3000",
				async sendMagicLink(data) {
					verificationEmail = data;
				},
			}),
		],
	});
	const app = $Infer.app(auth.options);

	const client = createAuthClient<typeof app>()({
		plugins: [magicLinkClient()],
		fetchOptions: { customFetchImpl },
		baseURL: "http://localhost:3000/api/auth",
	});

	test("should send magic link", async ({ expect }) => {
		await client.signIn.magicLink.$post({ json: { email: testUser.email } });
		expect(verificationEmail).toMatchObject({
			email: testUser.email,
			url: expect.stringContaining(
				"http://localhost:3000/api/auth/magic-link/verify",
			),
		});
	});
	test("should verify magic link", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		const response = await client.magicLink.verify.$get(
			{
				query: {
					token: new URL(verificationEmail.url).searchParams.get("token") || "",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);
		expect(response.data?.data.session.token).toBeDefined();
		const faireAuthCookie = headers.get("set-cookie");
		expect(faireAuthCookie).toBeDefined();
	});

	test("shouldn't verify magic link with the same token", async ({
		expect,
	}) => {
		await client.magicLink.verify.$get(
			{
				query: {
					token: new URL(verificationEmail.url).searchParams.get("token") || "",
				},
			},
			{
				fetchOptions: {
					onError(context) {
						expect(context.response.status).toBe(302);
						const location = context.response.headers.get("location");
						expect(location).toContain("?error=INVALID_TOKEN");
					},
				},
			},
		);
	});

	test("shouldn't verify magic link with an expired token", async ({
		expect,
	}) => {
		await client.signIn.magicLink.$post({ json: { email: testUser.email } });
		const { token } = verificationEmail;
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1000 * 60 * 5 + 1);
		await client.magicLink.verify.$get(
			{ query: { token, callbackURL: "/callback" } },
			{
				fetchOptions: {
					onError(context) {
						expect(context.response.status).toBe(302);
						const location = context.response.headers.get("location");
						expect(location).toContain("?error=EXPIRED_TOKEN");
					},
				},
			},
		);
	});

	test("should sign up with magic link", async ({ expect }) => {
		const email = "new-email@email.com";
		await client.signIn.magicLink.$post({ json: { email, name: "test" } });
		expect(verificationEmail).toMatchObject({
			email,
			url: expect.stringContaining(
				"http://localhost:3000/api/auth/magic-link/verify",
			),
		});
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		await client.magicLink.verify.$get(
			{
				query: {
					token: new URL(verificationEmail.url).searchParams.get("token") || "",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data?.data.user).toMatchObject({
			name: "test",
			email: "new-email@email.com",
			emailVerified: true,
		});
	});

	test("should use custom generateToken function", async ({ expect }) => {
		const customGenerateToken = vi.fn(() => "custom_token");

		const { $Infer, auth, customFetchImpl } = await getTestInstance({
			plugins: [
				magicLink({
					siteUrl: "http://localhost:3000",
					async sendMagicLink(data) {
						verificationEmail = data;
					},
					generateToken: customGenerateToken,
				}),
			],
		});
		const app = $Infer.app(auth.options);

		const customClient = createAuthClient<typeof app>()({
			plugins: [magicLinkClient()],
			fetchOptions: { customFetchImpl },
			baseURL: "http://localhost:3000/api/auth",
		});

		await customClient.signIn.magicLink.$post({
			json: { email: testUser.email },
		});

		expect(customGenerateToken).toHaveBeenCalled();
		expect(verificationEmail.token).toBe("custom_token");
	});
});

describe("magic link verify", async (test) => {
	const verificationEmail: VerificationEmail[] = [
		{ email: "", token: "", url: "" },
	];
	const { $Infer, auth, customFetchImpl, testUser } = await getTestInstance({
		plugins: [
			magicLink({
				siteUrl: "http://localhost:3000",
				async sendMagicLink(data) {
					verificationEmail.push(data);
				},
			}),
		],
	});
	const app = $Infer.app(auth.options);

	const client = createAuthClient<typeof app>()({
		plugins: [magicLinkClient()],
		fetchOptions: { customFetchImpl },
		baseURL: "http://localhost:3000/api/auth",
	});

	test("should verify last magic link", async ({ expect }) => {
		await client.signIn.magicLink.$post({ json: { email: testUser.email } });
		await client.signIn.magicLink.$post({ json: { email: testUser.email } });
		await client.signIn.magicLink.$post({ json: { email: testUser.email } });
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		const lastEmail = verificationEmail.pop()!;
		const response = await client.magicLink.verify.$get(
			{
				query: {
					token: new URL(lastEmail.url).searchParams.get("token") || "",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);
		expect(response.data?.data.session.token).toBeDefined();
		const faireAuthCookie = headers.get("set-cookie");
		expect(faireAuthCookie).toBeDefined();
	});
});
