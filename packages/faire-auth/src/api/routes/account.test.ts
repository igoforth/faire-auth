import type { Account } from "@faire-auth/core/db";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { DEFAULT_SECRET, True } from "@faire-auth/core/static";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, vi } from "vitest";
import { signJWT } from "../../crypto";
import type { GoogleProfile, socialProviders } from "../../social-providers";
import { getTestInstance } from "../../test-utils";

let email = "";
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	handlers = [
		http.post("https://oauth2.googleapis.com/token", async () => {
			const data: GoogleProfile = {
				email,
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
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("account", async (test) => {
	const { auth, client, signIn } = await getTestInstance({
		socialProviders: {
			google: { clientId: "test", clientSecret: "test", enabled: true },
		},
		account: {
			accountLinking: { allowDifferentEmails: true },
			encryptOAuthTokens: true,
		},
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("should list all accounts", async ({ expect }) => {
		const { headers } = await signIn();
		const accounts = await client.listAccounts.$get({ headers });
		expect(accounts.data?.data.length).toBe(1);
	});

	test("should link first account", async ({ expect }) => {
		const { headers, captureCookies } = await signIn();
		const linkAccountRes = await client.linkSocial.$post(
			{ json: { provider: "google", callbackURL: "/callback" } },
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies((cookies) => {
						const state = cookies.get("faire-auth.state");
						expect(state).toBeDefined();
					}),
				},
			},
		);
		expect(linkAccountRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			linkAccountRes.data && "url" in linkAccountRes.data.data
				? new URL(linkAccountRes.data.data.url!).searchParams.get("state") || ""
				: "";
		email = "test@test.com";
		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			headers,
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/callback");
			},
		});
		const { headers: headers2 } = await signIn();
		const accounts = await client.listAccounts.$get({ headers: headers2 });
		expect(accounts.data).not.toBeNull();
		expect(accounts.data?.data.length).toBe(2);
	});

	test("should encrypt access token and refresh token", async ({ expect }) => {
		const { headers } = await signIn();
		const account = await auth.$context.adapter.findOne<Account>({
			model: "account",
			where: [{ field: "providerId", value: "google" }],
		});
		expect(account).not.toBeNull();
		expect(account?.accessToken).not.toBe("test");
		const accessToken = await client.getAccessToken.$post(
			{ json: { providerId: "google" } },
			{ headers },
		);
		expect(accessToken.data).not.toBeNull();
		expect(accessToken.data?.data.accessToken).toBe("test");
	});

	test("should pass custom scopes to authorization URL", async ({ expect }) => {
		const { headers } = await signIn();
		const customScope = "https://www.googleapis.com/auth/drive.readonly";
		const linkAccountRes = await client.linkSocial.$post(
			{
				json: {
					provider: "google",
					callbackURL: "/callback",
					scopes: [customScope],
				},
			},
			{ headers },
		);

		expect(linkAccountRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});

		const scopesParam =
			linkAccountRes.data && "url" in linkAccountRes.data.data
				? (new URL(linkAccountRes.data.data.url!).searchParams.get("scope") ??
					"")
				: "";
		expect(scopesParam).toContain(customScope);
	});

	test("should link second account from the same provider", async ({
		expect,
	}) => {
		const { headers, captureCookies } = await signIn();
		const linkAccountRes = await client.linkSocial.$post(
			{ json: { provider: "google", callbackURL: "/callback" } },
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies((cookies) => {
						const state = cookies.get("faire-auth.state");
						expect(state).toBeDefined();
					}),
				},
			},
		);
		expect(linkAccountRes.data?.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		const state =
			linkAccountRes.data && "url" in linkAccountRes.data.data
				? new URL(linkAccountRes.data.data.url!).searchParams.get("state") || ""
				: "";
		email = "test2@test.com";
		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			method: "GET",
			headers,
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();
				expect(location).toContain("/callback");
			},
		});

		const { headers: headers2 } = await signIn();
		const accounts = await client.listAccounts.$get({ headers: headers2 });
		expect(accounts.data).not.toBeNull();
		expect(accounts.data?.data.length).toBe(2);
	});

	test("should link third account with idToken", async ({ expect }) => {
		const googleProvider = auth.$context.socialProviders.find(
			(v) => v.id === "google",
		)! as ReturnType<(typeof socialProviders)["google"]>;
		expect(googleProvider).toBeTruthy();

		const user = {
			id: "0987654321",
			name: "test2",
			email: "test2@gmail.com",
			sub: "test2",
			emailVerified: true,
		};
		const userInfo = { user, data: user };

		const googleVerifyIdTokenMock = vi
			.spyOn(googleProvider, "verifyIdToken")
			.mockResolvedValueOnce(true);
		const googleGetUserInfoMock = vi
			.spyOn(googleProvider, "getUserInfo")
			.mockResolvedValueOnce(userInfo);

		const { headers, captureCookies } = await signIn();
		const res = await client.linkSocial.$post(
			{
				json: {
					provider: "google",
					callbackURL: "/callback",
					idToken: { token: "test" },
				},
			},
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies((cookies) => {
						const state = cookies.get("faire-auth.state");
						expect(state).toBeDefined();
					}),
				},
			},
		);
		expect(res.data).not.toBeNull();

		expect(googleVerifyIdTokenMock).toHaveBeenCalledOnce();
		expect(googleGetUserInfoMock).toHaveBeenCalledOnce();

		const { headers: headers2 } = await signIn();
		const accounts = await client.listAccounts.$get({ headers: headers2 });
		expect(accounts.data?.data.length).toBe(3);
	});

	test("should unlink account", async ({ expect }) => {
		const { headers } = await signIn();
		const previousAccounts = await client.listAccounts.$get({ headers });
		expect(previousAccounts.data).not.toBeNull();
		expect(previousAccounts.data?.data.length).toBe(3);
		const unlinkAccountId = previousAccounts.data!.data[1]!.accountId;
		const unlinkRes = await client.unlinkAccount.$post(
			{ json: { providerId: "google", accountId: unlinkAccountId! } },
			{ headers },
		);
		expect(unlinkRes.data?.success).toBe(True);
		const accounts = await client.listAccounts.$get({ headers });
		expect(accounts.data?.data.length).toBe(2);
	});

	test("should fail to unlink the last account of a provider", async ({
		expect,
	}) => {
		const { headers } = await signIn();
		const previousAccounts = await client.listAccounts.$get({ headers });
		expect(previousAccounts.data).not.toBeNull();
		await auth.$context.adapter.delete({
			model: "account",
			where: [{ field: "providerId", value: "google" }],
		});
		const unlinkAccountId = previousAccounts.data!.data[0]!.accountId;
		const unlinkRes = await client.unlinkAccount.$post(
			{ json: { providerId: "credential", accountId: unlinkAccountId } },
			{ headers },
		);
		expect(unlinkRes.error?.message).toBe(
			BASE_ERROR_CODES.FAILED_TO_UNLINK_LAST_ACCOUNT,
		);
	});

	test("should unlink account with specific accountId", async ({ expect }) => {
		const { headers } = await signIn();
		const previousAccounts = await client.listAccounts.$get({ headers });
		expect(previousAccounts.data).not.toBeNull();
		expect(previousAccounts.data?.data.length).toBeGreaterThan(0);

		const accountToUnlink = previousAccounts.data!.data[0]!;
		const unlinkAccountId = accountToUnlink.accountId;
		const providerId = accountToUnlink.providerId!;
		const accountsWithSameProvider = previousAccounts.data!.data.filter(
			(account) => account.providerId === providerId,
		);
		if (accountsWithSameProvider.length <= 1) {
			return;
		}

		const unlinkRes = await client.unlinkAccount.$post(
			{ json: { providerId, accountId: unlinkAccountId! } },
			{ headers },
		);

		expect(unlinkRes.data?.success).toBe(True);

		const accountsAfterUnlink = await client.listAccounts.$get({ headers });

		expect(accountsAfterUnlink.data?.data.length).toBe(
			previousAccounts.data!.data.length - 1,
		);
		expect(
			accountsAfterUnlink.data?.data.find(
				(a) => a.accountId === unlinkAccountId,
			),
		).toBeUndefined();
	});

	test("should unlink all accounts with specific providerId", async ({
		expect,
	}) => {
		const { headers, user } = await signIn();
		await auth.$context.adapter.create({
			model: "account",
			data: {
				providerId: "google",
				accountId: "123",
				userId: user.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		await auth.$context.adapter.create({
			model: "account",
			data: {
				providerId: "google",
				accountId: "345",
				userId: user.id,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		const previousAccounts = await client.listAccounts.$get({ headers });
		expect(previousAccounts.data).not.toBeNull();

		const googleAccounts = previousAccounts.data!.data.filter(
			(account) => account.providerId === "google",
		);
		expect(googleAccounts.length).toBeGreaterThan(1);

		for (let i = 0; i < googleAccounts.length - 1; i++) {
			const unlinkRes = await client.unlinkAccount.$post(
				{
					json: {
						providerId: "google",
						accountId: googleAccounts[i]!.accountId!,
					},
				},
				{ headers },
			);
			expect(unlinkRes.data?.success).toBe(True);
		}

		const accountsAfterUnlink = await client.listAccounts.$get({ headers });

		const remainingGoogleAccounts = accountsAfterUnlink.data!.data.filter(
			(account) => account.providerId === "google",
		);
		expect(remainingGoogleAccounts.length).toBe(1);
	});
});
