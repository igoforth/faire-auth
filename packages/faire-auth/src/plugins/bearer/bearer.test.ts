import { describe } from "vitest";
import { getTestInstance } from "../../test-utils";

describe("bearer", async (test) => {
	const { auth, client } = await getTestInstance({}, { disableTestUser: true });

	let token: string;
	test("should get session", async ({ expect }) => {
		await client.signUp.email.$post(
			{
				json: {
					email: "test@test.com",
					password: "password54321",
					name: "test user",
				},
			},
			{
				fetchOptions: {
					onSuccess: (ctx) => {
						token = ctx.response.headers.get("set-auth-token") || "";
					},
				},
			},
		);
		const session = await client.getSession.$get(
			{ query: {} },
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		expect(session.data?.data.session).toBeDefined();
	});

	test("should list session", async ({ expect }) => {
		const sessions = await client.listSessions.$get({
			headers: { Authorization: `Bearer ${token}` },
		});
		expect(sessions.data?.data).toHaveLength(1);
	});

	test("should work on server actions", async ({ expect }) => {
		const session = await auth.api.getSession(
			{ query: {} },
			{ headers: new Headers({ authorization: `Bearer ${token}` }) },
		);
		expect(session).not.toMatchObject({ success: false });
		if (session.success === false) throw new Error("failed to get session");
		expect(session?.data.session).toBeDefined();
	});

	test("should work with ", async ({ expect }) => {
		const session = await client.getSession.$get(
			{ query: {} },
			{ headers: { authorization: `Bearer ${token.split(".")[0]}` } },
		);
		expect(session.data?.data.session).toBeDefined();
	});

	test("should work if valid cookie is provided even if authorization header isn't valid", async ({
		expect,
	}) => {
		const session = await client.getSession.$get(
			{ query: {} },
			{
				headers: {
					Authorization: `Bearer invalid.token`,
					cookie: `faire-auth.session_token=${token}`,
				},
			},
		);
		expect(session.data?.data.session).toBeDefined();
	});
});
