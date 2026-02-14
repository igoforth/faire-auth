import { afterEach, describe, vi } from "vitest";
import { getTestInstance } from "../../test-utils";

describe("sign-up with custom fields", async (test) => {
	const mockFn = vi.fn();

	const { auth, db } = await getTestInstance(
		{
			account: {
				fields: {
					providerId: "provider_id",
					accountId: "account_id",
				},
			},
			user: {
				additionalFields: {
					newField: {
						type: "string",
						required: false,
					},
					newField2: {
						type: "string",
						required: false,
					},
					isAdmin: {
						type: "boolean",
						defaultValue: true,
						input: false,
					},
					role: {
						input: false,
						type: "string",
						required: false,
					},
				},
			},
			emailVerification: {
				sendOnSignUp: true,
				sendVerificationEmail: mockFn,
			},
		},
		{ disableTestUser: true },
	);

	afterEach(() => {
		mockFn.mockReset();
	});

	test("should work with custom fields on account table", async ({
		expect,
	}) => {
		const res = await auth.api.signUpEmail({
			json: {
				email: "email@test.com",
				password: "password",
				name: "Test Name",
				image: "https://picsum.photos/200",
			},
		});
		if (res.success !== true) throw new Error("Expected success response");
		expect(res.data.token).toBeDefined();
		const users = await db.findMany({
			model: "user",
		});
		const accounts = await db.findMany({
			model: "account",
		});
		expect(accounts).toHaveLength(1);

		expect("isAdmin" in (users[0] as any)).toBe(true);
		expect((users[0] as any).isAdmin).toBe(true);

		expect(mockFn).toHaveBeenCalledTimes(1);
		expect(mockFn).toHaveBeenCalledWith(
			expect.objectContaining({
				token: expect.any(String),
				url: expect.any(String),
				user: expect.any(Object),
			}),
			expect.any(Object), // Context
		);
	});

	test("should get the ipAddress and userAgent from headers", async ({
		expect,
	}) => {
		const res = await auth.api.signUpEmail(
			{
				json: {
					email: "email2@test.com",
					password: "password",
					name: "Test Name",
				},
			},
			{
				headers: new Headers({
					"x-forwarded-for": "127.0.0.1",
					"user-agent": "test-user-agent",
				}),
			},
		);
		if (res.success !== true) throw new Error("Expected success response");
		const session = await auth.api.getSession(
			{ query: {} },
			{ headers: new Headers({ authorization: `Bearer ${res.data?.token}` }) },
		);
		if (session.success !== true) throw new Error("Expected success response");
		expect(session.data.session).toMatchObject({
			userAgent: "test-user-agent",
			ipAddress: "127.0.0.1",
		});
	});

	test("should not allow user to set the field that is set to input: false", async ({
		expect,
	}) => {
		const res = await auth.api.signUpEmail({
			json: {
				email: "input-false@test.com",
				password: "password",
				name: "Input False Test",
				role: "admin",
			},
		});

		if (res.success !== false) throw new Error("Expected failure response");
		if (!("message" in res)) throw new Error("Expected error with message");
		expect(res.message).toBe("role is not allowed to be set");
	});
});
