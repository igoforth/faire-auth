import { True } from "@faire-auth/core/static";
import { afterAll, beforeAll, describe } from "vitest";
import { getTestInstance } from "../../test-utils";
import { usernameClient } from "./client";
import { username, USERNAME_ERROR_CODES, type UsernameOptions } from "./index";
import { createCookieCapture } from "../../utils/cookies";

const usernameOptions: UsernameOptions = {
	validationOrder: {
		username: "pre-normalization",
		displayUsername: "pre-normalization",
	},
	minUsernameLength: 4,
};

describe("username", async (test) => {
	const { $Infer, auth, signIn } = await getTestInstance(
		{
			plugins: [username(usernameOptions)],
		},
		{ clientOptions: { plugins: [usernameClient()] } },
	);
	const app = $Infer.app(auth.options);
	const client = $Infer.client(app);
	const headers = new Headers();
	const captureCookies = createCookieCapture(headers);

	test("should sign up with username", async ({ expect }) => {
		await client.signUp.email.$post(
			{
				json: {
					email: "new-email@gamil.com",
					username: "new_username",
					password: "new-password",
					name: "new-name",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data?.success).toBe(True);
		expect(session.data?.data.user.username).toBe("new_username");
	});

	test("should sign-in with username", async ({ expect }) => {
		const res = await client.signIn.username.$post({
			json: { username: "new_username", password: "new-password" },
		});
		expect(res.data?.data.token).toBeDefined();
	});

	test("should update username", async ({ expect }) => {
		await client.updateUser.$post(
			{ json: { username: "new_username_2.1" } },
			{ headers },
		);

		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data?.success).toBe(True);
		expect(session.data?.data.user.username).toBe("new_username_2.1");
	});

	test("should fail on duplicate username in sign-up", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "new-email-2@gamil.com",
				username: "New_username_2.1",
				password: "new_password",
				name: "new-name",
			},
		}); //,JSON.stringify(res)
		expect(res.error?.status).toBe(400);
	});

	test("should fail on duplicate username in update-user if user is different", async ({
		expect,
	}) => {
		const newHeaders = new Headers();
		await client.signUp.email.$post(
			{
				json: {
					email: "new-email-2@gamil.com",
					username: "duplicate-username",
					password: "new_password",
					name: "new-name",
				},
			},
			{ headers: newHeaders },
		);

		const { headers: testUserHeaders } = await signIn();

		const res = await client.updateUser.$post(
			{ json: { username: "duplicate-username" } },
			{ headers: testUserHeaders },
		);
		expect(res.error?.status).toBe(400);
	});

	test("should succeed on duplicate username in update-user if user is the same", async ({
		expect,
	}) => {
		await client.updateUser.$post(
			{ json: { username: "New_username_2.1" } },
			{ headers },
		);

		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data?.success).toBe(True);
		expect(session.data?.data.user.username).toBe("new_username_2.1");
	});

	test("should preserve both username and displayUsername when updating both", async ({
		expect,
	}) => {
		const updateRes = await client.updateUser.$post(
			{
				json: {
					username: "priority_user",
					displayUsername: "Priority Display Name",
				},
			},
			{ headers },
		);

		expect(updateRes.error).toBeNull();

		const session = await client.getSession.$get({ query: {} }, { headers });

		expect(session.data?.success).toBe(True);
		expect(session.data?.data.user.username).toBe("priority_user");
		expect(session.data?.data.user.displayUsername).toBe(
			"Priority Display Name",
		);
	});

	test("should fail on invalid username", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "email-4@email.com",
				username: "new username",
				password: "new_password",
				name: "new-name",
			},
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe(USERNAME_ERROR_CODES.INVALID_USERNAME);
	});

	test("should fail on too short username", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "email-4@email.com",
				username: "new",
				password: "new_password",
				name: "new-name",
			},
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe(USERNAME_ERROR_CODES.USERNAME_TOO_SHORT);
	});

	test("should fail on empty username", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "email-4@email.com",
				username: "",
				password: "new_password",
				name: "new-name",
			},
		});
		expect(res.error?.status).toBe(400);
	});

	test("should check if username is unavailable", async ({ expect }) => {
		const res = await client.isUsernameAvailable.$post({
			json: { username: "priority_user" },
		});
		expect(res.data?.available).toEqual(false);
	});

	test("should check if username is available", async ({ expect }) => {
		const res = await client.isUsernameAvailable.$post({
			json: { username: "new_username_2.2" },
		});
		expect(res.data?.available).toEqual(true);
	});

	test("should not normalize displayUsername", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		await client.signUp.email.$post(
			{
				json: {
					email: "display-test@email.com",
					displayUsername: "Test Username",
					password: "test-password",
					name: "test-name",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);

		const session = await client.getSession.$get({ query: {} }, { headers });

		expect(session.data?.success).toBe(True);
		expect(session.data?.data.user.username).toBe("test username");
		expect(session.data?.data.user.displayUsername).toBe("Test Username");
	});

	test("should preserve both username and displayUsername when both are provided", async ({
		expect,
	}) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		await client.signUp.email.$post(
			{
				json: {
					email: "both-fields@email.com",
					username: "custom_user",
					displayUsername: "Fancy Display Name",
					password: "test-password",
					name: "test-name",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);

		const session = await client.getSession.$get({ query: {} }, { headers });

		expect(session.data?.success).toBe(True);
		expect(session.data?.data.user.username).toBe("custom_user");
		expect(session.data?.data.user.displayUsername).toBe("Fancy Display Name");
	});
});

describe("username custom normalization", async (test) => {
	beforeAll(() => {
		usernameOptions.usernameNormalization = (username) =>
			username.replaceAll("0", "o").replaceAll("4", "a").toLowerCase();
	});
	afterAll(() => {
		delete usernameOptions.usernameNormalization;
	});

	const { $Infer, auth } = await getTestInstance(
		{
			plugins: [username(usernameOptions)],
		},
		{ clientOptions: { plugins: [usernameClient()] } },
	);
	const app = $Infer.app(auth.options);
	const client = $Infer.client(app);

	test("should sign up with username", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "new-email@gamil.com",
				username: "H4XX0R",
				password: "new-password",
				name: "new-name",
			},
		});
		expect(res.error).toBeNull();
	});

	test("should fail on duplicate username", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "new-email-2@gamil.com",
				username: "haxxor",
				password: "new-password",
				name: "new-name",
			},
		});
		expect(res.error?.status).toBe(400);
	});

	test("should normalize displayUsername", async ({ expect }) => {
		const { $Infer, auth } = await getTestInstance({
			plugins: [
				username({
					displayUsernameNormalization: (displayUsername) =>
						displayUsername.toLowerCase(),
				}),
			],
		});
		const app = $Infer.app(auth.options);
		const api = $Infer.api(app);

		const res = await api.signUpEmail({
			json: {
				email: "new-email-3@gmail.com",
				password: "new-password",
				name: "new-name",
				username: "test_username",
				displayUsername: "Test Username",
			},
		});
		const session = await api.getSession(
			{ query: {} },
			{ headers: new Headers({ authorization: `Bearer ${res.data.token}` }) },
		);
		expect(session.success).toBe(True);
		expect(session.data.user.username).toBe("test_username");
		expect(session.data.user.displayUsername).toBe("test username");
	});
});

describe("username with displayUsername validation", async (test) => {
	beforeAll(() => {
		delete usernameOptions.minUsernameLength;
		usernameOptions.displayUsernameValidator = (displayUsername) =>
			/^[a-zA-Z0-9_-]+$/.test(displayUsername);
	});
	afterAll(() => {
		usernameOptions.minUsernameLength = 4;
		delete usernameOptions.displayUsernameValidator;
	});

	const { $Infer, auth } = await getTestInstance(
		{
			plugins: [username(usernameOptions)],
		},
		{ clientOptions: { plugins: [usernameClient()] } },
	);
	const app = $Infer.app(auth.options);
	const client = $Infer.client(app);

	test("should accept valid displayUsername", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "display-valid@email.com",
				displayUsername: "Valid_Display-123",
				password: "test-password",
				name: "test-name",
			},
		});
		expect(res.error).toBeNull();
	});

	test("should reject invalid displayUsername", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "display-invalid@email.com",
				displayUsername: "Invalid Display!",
				password: "test-password",
				name: "test-name",
			},
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe(
			USERNAME_ERROR_CODES.INVALID_DISPLAY_USERNAME,
		);
	});

	test("should update displayUsername with valid value", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		await client.signUp.email.$post(
			{
				json: {
					email: "update-display@email.com",
					displayUsername: "Initial_Name",
					password: "test-password",
					name: "test-name",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);

		const sessionBefore = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(sessionBefore.data?.success).toBe(True);
		expect(sessionBefore.data?.data.user.displayUsername).toBe("Initial_Name");
		expect(sessionBefore.data?.data.user.username).toBe("initial_name");

		const res = await client.updateUser.$post(
			{ json: { displayUsername: "Updated_Name-123" } },
			{ headers },
		);

		expect(res.error).toBeNull();
		const sessionAfter = await client.getSession.$get(
			{ query: {} },
			{ headers },
		);
		expect(sessionAfter.data?.success).toBe(True);
		expect(sessionAfter.data?.data.user.displayUsername).toBe(
			"Updated_Name-123",
		);
		expect(sessionAfter.data?.data.user.username).toBe("updated_name-123");
	});

	test("should reject invalid displayUsername on update", async ({
		expect,
	}) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		await client.signUp.email.$post(
			{
				json: {
					email: "update-invalid@email.com",
					displayUsername: "Valid_Name",
					password: "test-password",
					name: "test-name",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);

		const res = await client.updateUser.$post(
			{ json: { displayUsername: "Invalid Display!" } },
			{ headers },
		);

		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toBe(
			USERNAME_ERROR_CODES.INVALID_DISPLAY_USERNAME,
		);
	});
});

describe("post normalization flow", async (test) => {
	beforeAll(() => {
		usernameOptions.validationOrder.username = "post-normalization";
		usernameOptions.validationOrder.displayUsername = "post-normalization";
		usernameOptions.usernameNormalization = (username) =>
			username.split(" ").join("_").toLowerCase();
	});

	afterAll(() => {
		usernameOptions.validationOrder.username = "pre-normalization";
		usernameOptions.validationOrder.displayUsername = "pre-normalization";
		delete usernameOptions.usernameNormalization;
	});

	test("should set displayUsername to username if only username is provided", async ({
		expect,
	}) => {
		const { $Infer, auth } = await getTestInstance({
			plugins: [username(usernameOptions)],
		});
		const app = $Infer.app(auth.options);
		const api = $Infer.api(app);

		const res = await api.signUpEmail({
			json: {
				email: "test-username@email.com",
				username: "Test Username",
				password: "test-password",
				name: "test-name",
			},
		});
		expect(res.success, JSON.stringify(res)).toBe(True);
		const session = await api.getSession(
			{ query: {} },
			{ headers: new Headers({ authorization: `Bearer ${res.data.token}` }) },
		);
		expect(session.success).toBe(True);
		expect(session.data.user.username).toBe("test_username");
		expect(session.data.user.displayUsername).toBe("Test Username");
	});
});

describe("username email verification flow (no info leak)", async (test) => {
	const { $Infer, auth } = await getTestInstance(
		{
			emailAndPassword: { enabled: true, requireEmailVerification: true },
			plugins: [username()],
		},
		{
			clientOptions: {
				plugins: [usernameClient()],
			},
		},
	);
	const app = $Infer.app(auth.options);
	const client = $Infer.client(app);

	test("returns INVALID_USERNAME_OR_PASSWORD for wrong password even if email is unverified", async ({
		expect,
	}) => {
		await client.signUp.email.$post({
			json: {
				email: "unverified-user@example.com",
				username: "unverified_user",
				password: "correct-password",
				name: "Unverified User",
			},
		});

		const res = await client.signIn.username.$post({
			json: {
				username: "unverified_user",
				password: "wrong-password",
			},
		});

		expect(res.error?.status).toBe(401);
		expect(res.error?.message).toBe(
			USERNAME_ERROR_CODES.INVALID_USERNAME_OR_PASSWORD,
		);
	});

	test("returns EMAIL_NOT_VERIFIED only after a correct password for an unverified user", async ({
		expect,
	}) => {
		const res = await client.signIn.username.$post({
			json: {
				username: "unverified_user",
				password: "correct-password",
			},
		});

		expect(res.error?.status).toBe(403);
		expect(res.error?.message).toBe(USERNAME_ERROR_CODES.EMAIL_NOT_VERIFIED);
	});
});
