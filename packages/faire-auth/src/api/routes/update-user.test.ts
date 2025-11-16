import { True } from "@faire-auth/core/static";
import { afterEach, describe, vi } from "vitest";
import { getTestInstance } from "../../test-utils";
import type { FaireAuthOptions } from "../../types";
import { createCookieCapture } from "../../utils/cookies";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("updateUser", async (test) => {
	const sendChangeEmail = vi.fn();
	let emailVerificationToken = "";

	const {
		auth: rawAuth,
		client,
		signIn,
		createUser,
		db,
	} = await getTestInstance({
		secondaryStorage: undefined,
		emailVerification: {
			async sendVerificationEmail({ token }) {
				emailVerificationToken = token;
			},
		},
		user: {
			additionalFields: undefined,
			changeEmail: {
				enabled: true,
				sendChangeEmailVerification: async ({ user, newEmail, url, token }) => {
					sendChangeEmail(user, newEmail, url, token);
				},
			},
		},
	});
	const auth = rawAuth as typeof rawAuth & { options: FaireAuthOptions };

	const { user, headers, captureCookies } = await signIn();
	const session = await client.signIn.email.$post(
		{ json: { email: user.email, password: user.password } },
		{
			fetchOptions: {
				onSuccess: captureCookies(),
				onRequest(context) {
					return context;
				},
			},
		},
	);
	if (!session.data?.success) throw new Error("No session");

	test("should update the user's name", async ({ expect }) => {
		const updated = await client.updateUser.$post(
			{ json: { name: "newName", image: "https://example.com/image.jpg" } },
			{ headers },
		);
		const session = await client.getSession.$get({ query: {} }, { headers });
		if (!session.data?.success) throw new Error("No session");
		expect(updated.data?.success).toBe(True);
		expect(session?.data.data.user.name).toBe("newName");
	});

	test("should unset image", async ({ expect }) => {
		await client.updateUser.$post({ json: { image: null } }, { headers });
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session?.data?.data.user.image).toBeNull();
	});

	test("should update user email", async ({ expect }) => {
		const newEmail = "new-email@email.com";
		await client.changeEmail.$post({ json: { newEmail } }, { headers });
		const session = await client.getSession.$get({ query: {} }, { headers });
		if (!session.data?.success) throw new Error("No session");
		expect(session?.data.data.user.email).toBe(newEmail);
		expect(session?.data.data.user.emailVerified).toBe(false);
	});

	test("should verify email", async ({ expect }) => {
		await client.verifyEmail.$get(
			{ query: { token: emailVerificationToken } },
			{ headers },
		);
		const session = await client.getSession.$get({ query: {} }, { headers });
		if (!session.data?.success) throw new Error("No session");
		expect(session?.data.data.user.emailVerified).toBe(true);
	});

	test("should send email verification before update", async ({ expect }) => {
		await db.update({
			model: "user",
			update: { emailVerified: true },
			where: [{ field: "email", value: "new-email@email.com" }],
		});
		await client.changeEmail.$post(
			{ json: { newEmail: "new-email-2@email.com" } },
			{ headers },
		);
		expect(sendChangeEmail).toHaveBeenCalledWith(
			expect.objectContaining({ email: "new-email@email.com" }),
			"new-email-2@email.com",
			expect.any(String),
			expect.any(String),
		);
	});

	test("should update the user's password", async ({ expect }) => {
		const newEmail = "new-email@email.com";
		const updated = await client.changePassword.$post(
			{
				json: {
					newPassword: "newPassword",
					currentPassword: user.password,
					revokeOtherSessions: true,
				},
			},
			{ headers },
		);
		expect(updated).toBeDefined();
		const signInRes = await client.signIn.email.$post({
			json: { email: newEmail, password: "newPassword" },
		});
		expect(signInRes.data?.data.user).toBeDefined();
		const signInCurrentPassword = await client.signIn.email.$post({
			json: { email: user.email, password: user.password },
		});
		expect(signInCurrentPassword.data).toBeNull();
	});

	test("should not update password if current password is wrong", async ({
		expect,
	}) => {
		const newHeaders = new Headers();
		const captureCookies = createCookieCapture(newHeaders);

		await client.signUp.email.$post(
			{
				json: {
					name: "name",
					email: "new-email-2@email.com",
					password: "password",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);
		const res = await client.changePassword.$post(
			{
				json: { newPassword: "newPassword", currentPassword: "wrongPassword" },
			},
			{ headers: newHeaders },
		);
		expect(res.data).toBeNull();
		const signInAttempt = await client.signIn.email.$post({
			json: { email: "new-email-2@email.com", password: "newPassword" },
		});
		expect(signInAttempt.data).toBeNull();
	});

	test("should revoke other sessions", async ({ expect }) => {
		// const { headers, user } = await createUser();
		const newHeaders = new Headers();
		const captureCookies = createCookieCapture(newHeaders);

		await client.changePassword.$post(
			{
				json: {
					newPassword: "newPassword",
					currentPassword: user.password,
					revokeOtherSessions: true,
				},
			},
			{ headers, fetchOptions: { onSuccess: captureCookies() } },
		);
		const cookie = newHeaders.get("cookie");
		const oldCookie = headers.get("cookie");
		expect(cookie).not.toBe(oldCookie);
		const sessionAttempt = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(sessionAttempt.data).toBeNull();
	});

	test("shouldn't pass defaults", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		const { client, db } = await getTestInstance(
			{
				user: {
					additionalFields: {
						newField: { type: "string", defaultValue: "default" },
					},
				},
			},
			{ disableTestUser: true },
		);
		await client.signUp.email.$post(
			{
				json: {
					email: "new-email@emial.com",
					name: "name",
					password: "password",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);

		const res = await db.update<{ newField: string }>({
			model: "user",
			update: { newField: "new" },
			where: [{ field: "email", value: "new-email@emial.com" }],
		});
		expect(res?.newField).toBe("new");

		await client.updateUser.$post({ json: { name: "newName" } }, { headers });
		const session = await client.getSession.$get({ query: {} }, { headers });
		if (!session.data?.success) throw new Error("No session");
		expect(session.data.data.user.newField).toBe("new");
	});

	test("should propagate updates across sessions when secondaryStorage is enabled", async ({
		expect,
	}) => {
		const store = new Map<string, string>();
		vi.spyOn(auth.options, "secondaryStorage", "get").mockReturnValue({
			set(key, value) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		});

		const { headers: headers1, signIn } = await createUser();
		const { headers: headers2 } = await signIn();

		await client.updateUser.$post(
			{ json: { name: "updatedName" } },
			{ headers: headers1 },
		);

		const secondSession = await client.getSession.$get(
			{ query: {} },
			{ headers: headers2 },
		);
		expect(secondSession.data?.data.user.name).toBe("updatedName");

		const firstSession = await client.getSession.$get(
			{ query: {} },
			{ headers: headers1 },
		);

		expect(firstSession.data?.data.user.name).toBe("updatedName");
	});
});

describe("delete user", async (test) => {
	let token = "";

	const {
		auth: rawAuth,
		client,
		signIn,
		createUser,
	} = await getTestInstance({
		user: {
			deleteUser: {
				enabled: false,
				sendDeleteAccountVerification: undefined,
			},
		},
		session: { freshAge: 60 * 60 * 24 },
	});
	const auth = rawAuth as typeof rawAuth & { options: FaireAuthOptions };

	afterEach(() => {
		token = "";
	});

	test("should not delete user if deleteUser is disabled", async ({
		expect,
	}) => {
		const { headers } = await signIn();
		const res = await client.deleteUser.$post(
			{ json: {} },
			{
				headers,
			},
		);
		expect(res.error?.message).toBe("Delete user is disabled");
	});

	test("should delete the user with a fresh session", async ({ expect }) => {
		vi.spyOn(auth.options.user!.deleteUser!, "enabled", "get").mockReturnValue(
			true,
		);
		vi.spyOn(auth.options.session!, "freshAge", "get").mockReturnValue(1000);
		const { headers } = await createUser();

		const res = await client.deleteUser.$post({ json: {} }, { headers });
		expect(res.data?.success, JSON.stringify(res.error)).toBe(true);
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data).toBeNull();
	});

	test("should delete with verification flow and password", async ({
		expect,
	}) => {
		vi.spyOn(auth.options.user!.deleteUser!, "enabled", "get").mockReturnValue(
			true,
		);
		vi.spyOn(
			auth.options.user!.deleteUser!,
			"sendDeleteAccountVerification",
			"get",
		).mockReturnValue((data, _) => {
			token = data.token;
		});
		const { headers, user } = await signIn();

		const res = await client.deleteUser.$post(
			{ json: { password: user!.password } },
			{ headers },
		);
		expect(res.data?.success).toBe(True);
		expect(token.length).toBe(32);
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data).toBeDefined();
		const deleteCallbackRes = await client.deleteUser.$post(
			{ json: { token } },
			{ headers },
		);
		expect(deleteCallbackRes.data?.success).toBe(True);
		const nullSession = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(nullSession.data).toBeNull();
	});
});
