import { betterFetch } from "@better-fetch/fetch";
import type { GoogleProfile } from "@faire-auth/core/social-providers";
import { DEFAULT_SECRET } from "@faire-auth/core/static";
import Database from "better-sqlite3";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, afterEach, beforeAll, describe, vi } from "vitest";
import { signJWT } from "./crypto";
import { getMigrations } from "./db";
import { refreshAccessToken } from "./oauth2";
import { getTestInstance } from "./test-utils";
import { runWithContext } from "./test-utils/test-context";
import type { FaireAuthOptions } from "./types";
import { createCookieCapture, parseSetCookieHeader } from "./utils/cookies";

let server = new OAuth2Server();
let port = 8005;

const mswServer = setupServer();
let shouldUseUpdatedProfile = false;

beforeAll(async () => {
	mswServer.listen({ onUnhandledRequest: "bypass" });
	mswServer.use(
		http.post("https://oauth2.googleapis.com/token", async () => {
			const data: GoogleProfile = shouldUseUpdatedProfile
				? {
						email: "user@email.com",
						email_verified: true,
						name: "Updated User",
						picture: "https://test.com/picture.png",
						exp: 1234567890,
						sub: "1234567890",
						iat: 1234567890,
						aud: "test",
						azp: "test",
						nbf: 1234567890,
						iss: "test",
						locale: "en",
						jti: "test",
						given_name: "Updated",
						family_name: "User",
					}
				: {
						email: "user@email.com",
						email_verified: true,
						name: "First Last",
						picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
						exp: 1234567890,
						sub: "1234567890",
						iat: 1234567890,
						aud: "test",
						azp: "test",
						nbf: 1234567890,
						iss: "test",
						locale: "en",
						jti: "test",
						given_name: "First",
						family_name: "Last",
					};
			const testIdToken = await signJWT(data, DEFAULT_SECRET);
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
		http.post(`http://localhost:${port}/token`, async () => {
			const data: GoogleProfile = {
				email: "user@email.com",
				email_verified: true,
				name: "First Last",
				picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
				exp: 1234567890,
				sub: "1234567890",
				iat: 1234567890,
				aud: "test",
				azp: "test",
				nbf: 1234567890,
				iss: "test",
				locale: "en",
				jti: "test",
				given_name: "First",
				family_name: "Last",
			};
			const testIdToken = await signJWT(data, DEFAULT_SECRET);
			return HttpResponse.json({
				access_token: "new-access-token",
				refresh_token: "new-refresh-token",
				id_token: testIdToken,
				token_type: "Bearer",
				expires_in: 3600,
			});
		}),
	);
});

afterEach(() => {
	shouldUseUpdatedProfile = false;
});

afterAll(() => mswServer.close());

describe("Social Providers", async (test) => {
	const { client } = await getTestInstance(
		{
			user: {
				additionalFields: {
					firstName: { type: "string" },
					lastName: { type: "string" },
					isOAuth: { type: "boolean" },
				},
			},
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					mapProfileToUser(profile) {
						return {
							firstName: profile.given_name,
							lastName: profile.family_name,
							isOAuth: true,
						};
					},
				},
				apple: { clientId: "test", clientSecret: "test" },
			},
		},
		{ disableTestUser: true },
	);

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
		server.issuer.on;
		await server.start(port, "localhost");
		console.log("Issuer URL:", server.issuer.url); // -> http://localhost:${port}
	});
	afterAll(async () => {
		await server.stop().catch(console.error);
	});
	server.service.on("beforeResponse", (tokenResponse) => {
		tokenResponse.body = {
			accessToken: "access-token",
			refreshToken: "refresher-token",
		};
		tokenResponse.statusCode = 200;
	});
	server.service.on("beforeUserinfo", (userInfoResponse) => {
		userInfoResponse.body = {
			email: "test@localhost.com",
			name: "OAuth2 Test",
			sub: "oauth2",
			picture: "https://test.com/picture.png",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	server.service.on("beforeTokenSigning", (token) => {
		token.payload.email = "sso-user@localhost:8000.com";
		token.payload.email_verified = true;
		token.payload.name = "Test User";
		token.payload.picture = "https://test.com/picture.png";
	});
	let state = "";

	const headers = new Headers();
	const captureCookies = createCookieCapture(headers);

	describe("signin", async (test) => {
		async function simulateOAuthFlowRefresh(
			authUrl: string,
			_headers: Headers,
			// fetchImpl?: (...args: any) => any,
		) {
			let location: string | null = null;
			await betterFetch(authUrl, {
				method: "GET",
				redirect: "manual",
				onError(context) {
					location = context.response.headers.get("location");
				},
			});
			if (!location) throw new Error("No redirect location found");

			const tokens = await refreshAccessToken({
				refreshToken: "mock-refresh-token",
				options: {
					clientId: "test-client-id",
					clientKey: "test-client-key",
					clientSecret: "test-client-secret",
				},
				tokenEndpoint: `http://localhost:${port}/token`,
			});
			return tokens;
		}
		test("should be able to add social providers", async ({ expect }) => {
			const signInRes = await client.signIn.social.$post({
				json: {
					provider: "google",
					callbackURL: "/callback",
					newUserCallbackURL: "/welcome",
				},
			});
			expect(signInRes.data?.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			state =
				new URL(signInRes.data!.data.url!).searchParams.get("state") || "";
		});

		test("should be able to sign in with social providers", async ({
			expect,
		}) => {
			await client.$fetch("/callback/google", {
				query: { state, code: "test" },
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					expect(location).toContain("/welcome");
					const cookies = parseSetCookieHeader(
						context.response.headers.getSetCookie(),
					);
					expect(cookies.get("faire-auth.session_token")?.value).toBeDefined();
				},
			});
		});

		test("Should use callback URL if the user is already registered", async ({
			expect,
		}) => {
			const signInRes = await client.signIn.social.$post({
				json: {
					provider: "google",
					callbackURL: "/callback",
					newUserCallbackURL: "/welcome",
				},
			});
			expect(signInRes.data?.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			state =
				new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

			await client.$fetch("/callback/google", {
				query: { state, code: "test" },
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					expect(location).toContain("/callback");
					const cookies = parseSetCookieHeader(
						context.response.headers.getSetCookie(),
					);
					expect(cookies.get("faire-auth.session_token")?.value).toBeDefined();
				},
			});
		});

		test("should be able to map profile to user", async ({ expect }) => {
			const signInRes = await client.signIn.social.$post({
				json: { provider: "google", callbackURL: "/callback" },
			});
			expect(signInRes.data?.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			state =
				new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

			const headers = new Headers();
			const captureCookies = createCookieCapture(headers);

			await client.$fetch("/callback/google", {
				query: { state, code: "test" },
				method: "GET",
				onError: captureCookies(),
			});
			const session = await client.getSession.$get({ query: {} }, { headers });
			expect(session.data?.data.user).toMatchObject({
				isOAuth: true,
				firstName: "First",
				lastName: "Last",
			});
		});

		test("should be protected from callback URL attacks", async ({
			expect,
		}) => {
			const signInRes = await client.signIn.social.$post(
				{
					json: {
						provider: "google",
						callbackURL: "https://evil.com/callback",
					},
				},
				{
					fetchOptions: {
						onSuccess: captureCookies(),
					},
				},
			);

			expect(signInRes.error?.status).toBe(403);
			expect(signInRes.error?.message).toBe("Invalid callbackURL");
		});

		test("should refresh the access token", async ({ expect }) => {
			const signInRes = await client.signIn.social.$post({
				json: {
					provider: "google",
					callbackURL: "/callback",
					newUserCallbackURL: "/welcome",
				},
			});
			const headers = new Headers();
			const captureCookies = createCookieCapture(headers);
			expect(signInRes.data?.data).toMatchObject({
				url: expect.stringContaining("google.com"),
				redirect: true,
			});
			state =
				new URL(signInRes.data!.data.url!).searchParams.get("state") || "";
			await client.$fetch("/callback/google", {
				query: { state, code: "test" },
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toBeDefined();
					expect(location).toContain("/callback");
					const cookies = parseSetCookieHeader(
						context.response.headers.getSetCookie(),
					);
					captureCookies()(context);
					expect(cookies.get("faire-auth.session_token")?.value).toBeDefined();
				},
			});
			await client.listAccounts.$get({ headers });
			await client.$fetch("/refresh-token", {
				body: { accountId: "test-id", providerId: "google" },
				headers,
				method: "POST",
				onError: captureCookies(),
			});

			const authUrl = signInRes.data?.data.url;
			if (!authUrl) throw new Error("No auth url found");
			const mockEndpoint = authUrl.replace(
				"https://accounts.google.com/o/oauth2/auth",
				`http://localhost:${port}/authorize`,
			);
			const result = await simulateOAuthFlowRefresh(mockEndpoint, headers);
			const { accessToken, refreshToken } = result;
			expect({ accessToken, refreshToken }).toEqual({
				accessToken: "new-access-token",
				refreshToken: "new-refresh-token",
			});
		});
	});
});

describe("Redirect URI", async (test) => {
	// const { client, auth: rawAuth } = await getTestInstance({
	// 	basePath: "/custom/path",
	// 	socialProviders: {
	// 		google: {
	// 			clientId: "test",
	// 			clientSecret: "test",
	// 			enabled: true,
	// 			redirectURI: undefined,
	// 		},
	// 	},
	// });
	// const auth = rawAuth as typeof rawAuth & { options: FaireAuthOptions };

	// afterEach(() => {
	// 	vi.clearAllMocks();
	// });

	test("should infer redirect uri", async ({ expect }) => {
		const { client } = await getTestInstance(
			{
				basePath: "/custom/path",
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
						enabled: true,
						redirectURI: undefined,
					},
				},
			},
			// TODO: someday figure out why turning this off prevents automatic user creation from working
			// (same in api/endpoints.test.ts)
			{ disableTestUser: true },
		);
		await client.signIn.social.$post(
			{ json: { provider: "google", callbackURL: "/callback" } },
			{
				fetchOptions: {
					onSuccess(context) {
						const redirectURI = context.data.data.url;
						expect(redirectURI).toContain(
							"http%3A%2F%2Flocalhost%3A3000%2Fcustom%2Fpath%2Fcallback%2Fgoogle",
						);
					},
				},
			},
		);
	});

	test("should respect custom redirect uri", async ({ expect }) => {
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					redirectURI: "https://test.com/callback",
				},
			},
		});
		// const basePathMock = vi
		// 	.spyOn(auth.options, "basePath")
		// 	.mockResolvedValueOnce(undefined);
		// const redirectURIMock = vi
		// 	.spyOn(auth.options.socialProviders.google, "redirectURI")
		// 	.mockResolvedValueOnce("https://test.com/callback");

		await client.signIn.social.$post(
			{ json: { provider: "google", callbackURL: "/callback" } },
			{
				fetchOptions: {
					onSuccess(context) {
						const redirectURI = context.data.data.url;
						expect(redirectURI).toContain(
							"redirect_uri=https%3A%2F%2Ftest.com%2Fcallback",
						);
					},
				},
			},
		);
	});
});

describe("Disable implicit signup", async (test) => {
	test("Should not create user when implicit sign up is disabled", async ({
		expect,
	}) => {
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableImplicitSignUp: true,
				},
			},
		});

		const signInRes = await client.signIn.social.$post({
			json: {
				provider: "google",
				callbackURL: "/callback",
				newUserCallbackURL: "/welcome",
			},
		});
		expect(signInRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain(
					"http://localhost:3000/api/auth/error?error=signup_disabled",
				);
			},
		});
	});

	test("Should create user when implicit sign up is disabled but it is requested", async ({
		expect,
	}) => {
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableImplicitSignUp: true,
				},
			},
		});

		const signInRes = await client.signIn.social.$post({
			json: {
				provider: "google",
				callbackURL: "/callback",
				newUserCallbackURL: "/welcome",
				requestSignUp: true,
			},
		});
		expect(signInRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/welcome");
				const cookies = parseSetCookieHeader(
					context.response.headers.getSetCookie(),
				);
				expect(cookies.get("faire-auth.session_token")?.value).toBeDefined();
			},
		});
	});
});

describe("Disable signup", async (test) => {
	test("Should not create user when sign up is disabled", async ({
		expect,
	}) => {
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test",
					clientSecret: "test",
					enabled: true,
					disableSignUp: true,
				},
			},
		});

		const signInRes = await client.signIn.social.$post({
			json: {
				provider: "google",
				callbackURL: "/callback",
				newUserCallbackURL: "/welcome",
			},
		});
		expect(signInRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain(
					"http://localhost:3000/api/auth/error?error=signup_disabled",
				);
			},
		});
	});
});

describe("signin", async (test) => {
	const database = new Database(":memory:");

	beforeAll(async () => {
		const migrations = await getMigrations({ database });
		await migrations.runMigrations();
	});
	test("should allow user info override during sign in", async ({ expect }) => {
		let state = "";
		const { client } = await getTestInstance({
			database,
			socialProviders: {
				google: { clientId: "test", clientSecret: "test", enabled: true },
			},
		});
		const signInRes = await client.signIn.social.$post({
			json: { provider: "google", callbackURL: "/callback" },
		});
		expect(signInRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		state = new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			onError: captureCookies(),
		});

		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data?.data.user).toMatchObject({ name: "First Last" });
	});

	test("should allow user info override during sign in", async ({ expect }) => {
		shouldUseUpdatedProfile = true;
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		let state = "";
		const { client } = await getTestInstance(
			{
				database,
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
						enabled: true,
						overrideUserInfoOnSignIn: true,
					},
				},
			},
			{ disableTestUser: true },
		);
		const signInRes = await client.signIn.social.$post(
			{
				json: { provider: "google", callbackURL: "/callback" },
			},
			{
				fetchOptions: {
					onSuccess: captureCookies(),
				},
			},
		);
		expect(signInRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		state = new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			onError: captureCookies(),
		});

		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data?.data.user).toMatchObject({ name: "Updated User" });
	});
});

describe("updateAccountOnSignIn", async (test) => {
	const { client, auth } = await getTestInstance({
		account: { updateAccountOnSignIn: false },
	});
	const ctx = await auth.$context;
	test("should not update account on sign in", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		const signInRes = await client.signIn.social.$post({
			json: { provider: "google", callbackURL: "/callback" },
		});
		expect(signInRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			new URL(signInRes.data!.data.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			onError: captureCookies(),
		});
		const session = await client.getSession.$get({ query: {} }, { headers });
		const userAccounts = await runWithContext({ context: ctx }, async () => {
			const userAccounts = await ctx.internalAdapter.findAccounts(
				session.data?.data.user.id!,
			);
			await ctx.internalAdapter.updateAccount(userAccounts[0]!.id, {
				accessToken: "new-access-token",
			});
			return userAccounts;
		});

		//re-sign in
		const signInRes2 = await client.signIn.social.$post({
			json: { provider: "google", callbackURL: "/callback" },
		});
		expect(signInRes2.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state2 =
			new URL(signInRes2.data!.data.url!).searchParams.get("state") || "";

		await client.$fetch("/callback/google", {
			query: { state: state2, code: "test" },
			method: "GET",
			onError: captureCookies(),
		});
		const session2 = await client.getSession.$get({ query: {} }, { headers });
		const userAccounts2 = await runWithContext({ context: ctx }, () =>
			ctx.internalAdapter.findAccounts(session2.data?.data.user.id!),
		);
		expect(userAccounts2[0]!.accessToken).toBe("new-access-token");
	});
});
