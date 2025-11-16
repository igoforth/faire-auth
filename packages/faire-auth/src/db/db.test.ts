import { afterEach, describe, vi } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { defineOptions } from "../auth";
import { getBaseURLFromEnv } from "../utils/url";

describe("db", async (test) => {
	let abort = false;
	let callback = false;
	const hookUserDeleteBefore = vi.fn();
	const hookUserDeleteAfter = vi.fn();
	const hookSessionDeleteBefore = vi.fn();
	const hookSessionDeleteAfter = vi.fn();

	const opts = defineOptions({
		user: {
			modelName: "users",
			fields: {
				email: "email_address",
			},
			deleteUser: {
				enabled: true,
			},
		},
		session: {
			modelName: "sessions",
			storeSessionInDatabase: true,
		},
		account: {
			modelName: "accounts",
		},
		databaseHooks: {
			user: {
				create: {
					async before(user) {
						return {
							data: {
								...user,
								image: "test-image",
							} as any,
						};
					},
					async after() {
						callback = true;
					},
				},
				delete: {
					async before(user, context) {
						hookUserDeleteBefore(user, context);
						if (abort === true) return false;
					},
					async after(user, context) {
						hookUserDeleteAfter(user, context);
					},
				},
			},
			session: {
				delete: {
					async before(session, context) {
						hookSessionDeleteBefore(session, context);
					},
					async after(session, context) {
						hookSessionDeleteAfter(session, context);
					},
				},
			},
		},
	});

	afterEach(() => {
		callback = false;
		abort = false;
		vi.clearAllMocks();
	});

	const { client, db } = await getTestInstance(opts);

	test("should work with custom model names", async ({ expect }) => {
		const res = await client.signUp.email.$post({
			json: {
				email: "test@email1.com",
				password: "password",
				name: "Test User",
			},
		});
		const users = await db.findMany({
			model: "user",
		});
		const session = await db.findMany({
			model: "session",
		});
		const accounts = await db.findMany({
			model: "account",
		});
		expect(res.data).toBeDefined();
		//including the user that was created in the test instance
		expect(users).toHaveLength(2);
		expect(session).toHaveLength(2);
		expect(accounts).toHaveLength(2);
	});

	test("db hooks", async ({ expect }) => {
		const { data: res } = await client.signUp.email.$post({
			json: {
				email: "test@email2.com",
				name: "test",
				password: "password",
			},
		});

		const token = res?.data?.token;
		expect(token).toBeDefined();

		const { data: session } = await client.getSession.$get(
			{ query: {} },
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);
		expect(session?.data.user?.image).toBe(`${getBaseURLFromEnv()}/test-image`);
		expect(callback).toBe(true);
	});

	test("should work with custom field names", async ({ expect }) => {
		const { data: res } = await client.signUp.email.$post({
			json: {
				email: "test@email3.com",
				password: "password",
				name: "Test User",
			},
		});

		const token = res?.data?.token;
		expect(token).toBeDefined();

		const { data: session } = await client.getSession.$get(
			{ query: {} },
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);
		expect(session?.data.user.email).toBe("test@email3.com");
	});

	test("delete hooks", async ({ expect }) => {
		const { data: res } = await client.signUp.email.$post({
			json: {
				email: "delete-test@email.com",
				password: "password",
				name: "Delete Test User",
			},
		});

		const userId = res?.data?.user?.id;
		const token = res?.data?.token;
		expect(userId).toBeDefined();
		expect(token).toBeDefined();

		const res1 = await client.deleteUser.$post(
			{ json: {} },
			{
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		);

		expect(hookUserDeleteBefore).toHaveBeenCalledOnce();
		expect(hookUserDeleteAfter).toHaveBeenCalledOnce();
		expect(hookSessionDeleteBefore).toHaveBeenCalledOnce();
		expect(hookSessionDeleteAfter).toHaveBeenCalledOnce();

		expect(hookUserDeleteBefore).toHaveBeenCalledWith(
			expect.objectContaining({
				id: userId,
				email: "delete-test@email.com",
				name: "Delete Test User",
			}),
			expect.any(Object),
		);

		expect(hookUserDeleteAfter).toHaveBeenCalledWith(
			expect.objectContaining({
				id: userId,
				email: "delete-test@email.com",
				name: "Delete Test User",
			}),
			expect.any(Object),
		);
	});

	test("delete hooks abort", async ({ expect }) => {
		abort = true;

		const { data: res } = await client.signUp.email.$post({
			json: {
				email: "abort-delete-test@email.com",
				password: "password",
				name: "Abort Delete Test User",
			},
		});

		const userId = res?.data?.user?.id;
		const token = res?.data?.token;
		expect(userId).toBeDefined();
		expect(token).toBeDefined();

		try {
			await client.deleteUser.$post(
				{ json: {} },
				{
					headers: {
						Authorization: `Bearer ${token}`,
					},
				},
			);
		} catch (error) {
			// Expected to fail due to hook returning false
		}

		expect(hookUserDeleteBefore).toHaveBeenCalledOnce();
		expect(hookUserDeleteAfter).not.toHaveBeenCalled();

		expect(hookUserDeleteBefore).toHaveBeenCalledWith(
			expect.objectContaining({
				id: userId,
				email: "abort-delete-test@email.com",
				name: "Abort Delete Test User",
			}),
			expect.any(Object),
		);
	});
});
// import { describe, expect, test, vi, onTestFinished } from "vitest";
// import { getTestInstance } from "../test-utils/test-instance";
// import { getBaseURLFromEnv } from "../utils/url";
// import { defineOptions } from "../auth";
// import type { FaireAuthOptions } from "../types";

// describe("db", async (test) => {
// 	const opts = defineOptions({
// 		user: {
// 			modelName: "users",
// 			deleteUser: { enabled: true },
// 		},
// 		session: {
// 			modelName: "sessions",
// 			storeSessionInDatabase: true,
// 		},
// 		account: {
// 			modelName: "accounts",
// 		},
// 		databaseHooks: {},
// 	});
// 	const rawOpts: FaireAuthOptions = opts;

// 	// Setup instance once at describe level, using current `opts`
// 	const setup = await getTestInstance(opts);

// 	test("should work with custom model names", async ({ expect }) => {
// 		// rawOpts.user!.modelName = "users";
// 		// rawOpts.session!.modelName = "sessions";
// 		// rawOpts.account!.modelName = "accounts";
// 		// onTestFinished(() => {
// 		// 	delete rawOpts.user!.modelName;
// 		// 	delete rawOpts.session!.modelName;
// 		// 	delete rawOpts.account!.modelName;
// 		// });

// 		const res = await setup.client.signUp.email.$post({
// 			json: {
// 				email: "test@email2.com",
// 				password: "password",
// 				name: "Test User",
// 			},
// 		});
// 		const users = await setup.db.findMany({ model: "user" });
// 		const sessions = await setup.db.findMany({ model: "session" });
// 		const accounts = await setup.db.findMany({ model: "account" });

// 		expect(res.data).toBeDefined();
// 		expect(users).toHaveLength(2); // includes test user
// 		expect(sessions).toHaveLength(2);
// 		expect(accounts).toHaveLength(2);
// 	});

// 	test("db hooks", async ({ expect }) => {
// 		let callback = false;

// 		rawOpts.databaseHooks = {
// 			user: {
// 				create: {
// 					async before(user) {
// 						return {
// 							data: {
// 								...user,
// 								image: "test-image",
// 							} as any,
// 						};
// 					},
// 					async after() {
// 						callback = true;
// 					},
// 				},
// 			},
// 		};
// 		onTestFinished(() => {
// 			rawOpts.databaseHooks = undefined;
// 		});

// 		const { data: res } = await setup.client.signUp.email.$post({
// 			json: {
// 				email: "test@email.com",
// 				name: "test",
// 				password: "password",
// 			},
// 		});

// 		const token = res?.data.token;
// 		expect(token).toBeDefined();

// 		const { data: session } = await setup.client.getSession.$get(
// 			{ query: {} },
// 			{
// 				headers: {
// 					Authorization: `Bearer ${token}`,
// 				},
// 			},
// 		);

// 		expect(session?.data.user?.image).toBe(`${getBaseURLFromEnv()}/test-image`);
// 		expect(callback).toBe(true);
// 	});

// 	test("should work with custom field names", async ({ expect }) => {
// 		rawOpts.user!.fields = {
// 			email: "email_address",
// 		};
// 		onTestFinished(() => {
// 			delete rawOpts.user!.fields;
// 		});

// 		const { data: res } = await setup.client.signUp.email.$post({
// 			json: {
// 				email: "test@email.com",
// 				password: "password",
// 				name: "Test User",
// 			},
// 		});

// 		const token = res?.data.token;
// 		expect(token).toBeDefined();

// 		const { data: session } = await setup.client.getSession.$get(
// 			{ query: {} },
// 			{
// 				headers: {
// 					Authorization: `Bearer ${token}`,
// 				},
// 			},
// 		);

// 		expect(session?.data.user.email).toBe("test@email.com");
// 	});

// 	test("delete hooks", async ({ expect }) => {
// 		const hookUserDeleteBefore = vi.fn();
// 		const hookUserDeleteAfter = vi.fn();
// 		const hookSessionDeleteBefore = vi.fn();
// 		const hookSessionDeleteAfter = vi.fn();

// 		rawOpts.databaseHooks = {
// 			user: {
// 				delete: {
// 					async before(user, context) {
// 						hookUserDeleteBefore(user, context);
// 					},
// 					async after(user, context) {
// 						hookUserDeleteAfter(user, context);
// 					},
// 				},
// 			},
// 			session: {
// 				delete: {
// 					async before(session, context) {
// 						hookSessionDeleteBefore(session, context);
// 					},
// 					async after(session, context) {
// 						hookSessionDeleteAfter(session, context);
// 					},
// 				},
// 			},
// 		};
// 		onTestFinished(() => {
// 			rawOpts.databaseHooks!.user!.delete = undefined;
// 			rawOpts.databaseHooks!.session!.delete = undefined;
// 		});

// 		const { data: res } = await setup.client.signUp.email.$post({
// 			json: {
// 				email: "delete-test@email.com",
// 				password: "password",
// 				name: "Delete Test User",
// 			},
// 		});

// 		const userId = res?.data?.user?.id;
// 		const token = res?.data?.token;
// 		expect(userId).toBeDefined();
// 		expect(token).toBeDefined();

// 		await setup.client.deleteUser.$post(
// 			{ json: {} },
// 			{
// 				headers: {
// 					Authorization: `Bearer ${token}`,
// 				},
// 			},
// 		);

// 		expect(hookUserDeleteBefore).toHaveBeenCalledOnce();
// 		expect(hookUserDeleteAfter).toHaveBeenCalledOnce();
// 		expect(hookSessionDeleteBefore).toHaveBeenCalledOnce();
// 		expect(hookSessionDeleteAfter).toHaveBeenCalledOnce();

// 		expect(hookUserDeleteBefore).toHaveBeenCalledWith(
// 			expect.objectContaining({
// 				id: userId,
// 				email: "delete-test@email.com",
// 				name: "Delete Test User",
// 			}),
// 			expect.any(Object),
// 		);

// 		expect(hookUserDeleteAfter).toHaveBeenCalledWith(
// 			expect.objectContaining({
// 				id: userId,
// 				email: "delete-test@email.com",
// 				name: "Delete Test User",
// 			}),
// 			expect.any(Object),
// 		);
// 	});

// 	test("delete hooks abort", async ({ expect }) => {
// 		const hookUserDeleteBefore = vi.fn();
// 		const hookUserDeleteAfter = vi.fn();

// 		rawOpts.databaseHooks = {
// 			user: {
// 				delete: {
// 					async before(user, context) {
// 						hookUserDeleteBefore(user, context);
// 						return false;
// 					},
// 					async after(user, context) {
// 						hookUserDeleteAfter(user, context);
// 					},
// 				},
// 			},
// 		};
// 		onTestFinished(() => {
// 			rawOpts.databaseHooks!.user!.delete = undefined;
// 		});

// 		const { data: res } = await setup.client.signUp.email.$post({
// 			json: {
// 				email: "abort-delete-test@email.com",
// 				password: "password",
// 				name: "Abort Delete Test User",
// 			},
// 		});

// 		const userId = res?.data?.user?.id;
// 		const token = res?.data?.token;
// 		expect(userId).toBeDefined();
// 		expect(token).toBeDefined();

// 		try {
// 			await setup.client.deleteUser.$post(
// 				{ json: {} },
// 				{
// 					headers: {
// 						Authorization: `Bearer ${token}`,
// 					},
// 				},
// 			);
// 		} catch (error) {
// 			// Expected to fail due to hook returning false
// 		}

// 		expect(hookUserDeleteBefore).toHaveBeenCalledOnce();
// 		expect(hookUserDeleteAfter).not.toHaveBeenCalled();

// 		expect(hookUserDeleteBefore).toHaveBeenCalledWith(
// 			expect.objectContaining({
// 				id: userId,
// 				email: "abort-delete-test@email.com",
// 				name: "Abort Delete Test User",
// 			}),
// 			expect.any(Object),
// 		);
// 	});
// });
