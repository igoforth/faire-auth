import { describe, expect, test } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils";
import { createCookieCapture } from "../../../utils/cookies";
import { organizationClient } from "../client";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

describe("listMembers", async (test) => {
	const { $Infer, auth, signIn, customFetchImpl } = await getTestInstance({
		plugins: [organization()],
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);
	const ctx = await auth.$context;
	const { headers } = await signIn();
	const client = createAuthClient<typeof app>()({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: { customFetchImpl },
	});
	const org = await client.organization.create.$post(
		{ json: { name: "test", slug: "test", metadata: { test: "test" } } },
		{ headers },
	);
	const secondOrg = await client.organization.create.$post(
		{
			json: {
				name: "test-second",
				slug: "test-second",
				metadata: { test: "second-org" },
			},
		},
		{ headers },
	);

	for (let i = 0; i < 10; i++) {
		const user = await ctx.adapter.create({
			model: "user",
			data: { email: `test${i}@test.com`, name: `test${i}` },
		});
		await api.addMember({
			json: {
				organizationId: org.data?.data.id as string,
				userId: user["id"],
				role: "member",
			},
		});
	}
	test("should return all members", async ({ expect }) => {
		await client.organization.setActive.$post(
			{ json: { organizationId: org.data?.data.id as string } },
			{ headers },
		);
		const members = await client.organization.listMembers.$get(
			{ query: {} },
			{ headers },
		);
		expect(members.data?.data.members.length).toBe(11);
		expect(members.data?.data.total).toBe(11);
	});

	test("should limit the number of members", async ({ expect }) => {
		const members = await client.organization.listMembers.$get(
			{ query: { limit: 5 } },
			{ headers },
		);
		expect(members.data?.data.members.length).toBe(5);
		expect(members.data?.data.total).toBe(11);
	});

	test("should offset the members", async ({ expect }) => {
		const members = await client.organization.listMembers.$get(
			{ query: { offset: 5 } },
			{ headers },
		);
		expect(members.data?.data.members.length).toBe(6);
		expect(members.data?.data.total).toBe(11);
	});

	test("should filter the members", async ({ expect }) => {
		const members = await client.organization.listMembers.$get(
			{
				query: {
					filterField: "createdAt",
					filterOperator: "gt",
					filterValue: new Date(
						Date.now() - 1000 * 60 * 60 * 24 * 30,
					).toISOString(),
				},
			},
			{ headers },
		);
		expect(members.data?.data.members.length).toBe(0);
		expect(members.data?.data.total).toBe(0);
	});

	test("should sort the members", async ({ expect }) => {
		const defaultMembers = await client.organization.listMembers.$get(
			{ query: {} },
			{ headers },
		);
		const firstMember = defaultMembers.data?.data.members[0];
		if (!firstMember) {
			throw new Error("No first member found");
		}
		const secondMember = defaultMembers.data?.data.members[1];
		if (!secondMember) {
			throw new Error("No second member found");
		}
		await ctx.adapter.update({
			model: "member",
			where: [{ field: "id", value: secondMember.id }],
			update: {
				// update the second member to be the oldest
				createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
			},
		});
		const lastMember =
			defaultMembers.data?.data.members[
				defaultMembers.data?.data.members.length - 1
			];
		if (!lastMember) {
			throw new Error("No last member found");
		}
		const oneBeforeLastMember =
			defaultMembers.data?.data.members[
				defaultMembers.data?.data.members.length - 2
			];
		if (!oneBeforeLastMember) {
			throw new Error("No one before last member found");
		}
		await ctx.adapter.update({
			model: "member",
			where: [{ field: "id", value: oneBeforeLastMember.id }],
			update: {
				// update the one before last member to be the newest
				createdAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
			},
		});
		const members = await client.organization.listMembers.$get(
			{ query: { sortBy: "createdAt", sortDirection: "asc" } },
			{ headers },
		);
		expect(members?.data).not.toBeNull();
		expect(members?.data).not.toMatchObject({ success: false });
		expect(members.data?.data.members[0]?.id).not.toBe(firstMember.id);
		expect(
			members.data?.data.members[members.data?.data.members.length - 1]?.id,
		).not.toBe(lastMember.id);
		expect(members.data?.data.members[0]?.id).toBe(secondMember.id);
		expect(
			members.data?.data.members[members.data?.data.members.length - 1]?.id,
		).toBe(oneBeforeLastMember.id);
	});

	test("should list members by organization id", async ({ expect }) => {
		const members = await client.organization.listMembers.$get(
			{ query: { organizationId: secondOrg.data?.data.id as string } },
			{ headers },
		);
		expect(members.data?.data.members.length).toBe(1);
		expect(members.data?.data.total).toBe(1);
	});

	test("should not list members if not a member", async ({ expect }) => {
		const newHeaders = new Headers();
		const captureCookies = createCookieCapture(newHeaders);
		await client.signUp.email.$post(
			{
				json: {
					email: "test21@test.com",
					name: "test22",
					password: "password",
				},
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);
		const members = await client.organization.listMembers.$get(
			{ query: { organizationId: org.data?.data.id as string } },
			{ headers: newHeaders },
		);
		expect(members.error).toBeTruthy();
		expect(members.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});
});

describe("updateMemberRole", async (test) => {
	const { $Infer, auth, signIn, customFetchImpl } = await getTestInstance({
		plugins: [organization()],
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);

	test("should update the member role", async ({ expect }) => {
		const { headers, user: _user } = await signIn();
		const client = createAuthClient<typeof app>()({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: { customFetchImpl },
		});

		const org = await client.organization.create.$post(
			{ json: { name: "test", slug: "test", metadata: { test: "test" } } },
			{ headers },
		);

		const newUser = await api.signUpEmail({
			json: { email: "test2@test.com", name: "test", password: "password" },
		});
		expect(newUser).not.toMatchObject({ success: false });
		if (newUser.success === false) throw new Error("Failed to create user");

		const member = await api.addMember({
			json: {
				organizationId: org.data?.data.id as string,
				userId: newUser.data.user.id,
				role: "member",
			},
		});
		expect(member).not.toMatchObject({ success: false });
		if (member.success === false) throw new Error("Failed to add member");
		const updatedMember = await client.organization.updateMemberRole.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					memberId: member?.data.id as string,
					role: "admin",
				},
			},
			{ headers },
		);
		expect(updatedMember.data?.data.role).toBe("admin");
	});

	test("should not update the member role if the member updating is not a member	", async ({
		expect,
	}) => {
		const { headers, user } = await signIn();
		const client = createAuthClient<typeof app>()({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: { customFetchImpl },
		});

		await client.organization.create.$post(
			{ json: { name: "test", slug: "test", metadata: { test: "test" } } },
			{ headers },
		);

		const newUser = await api.signUpEmail({
			json: { email: "test3@test.com", name: "test", password: "password" },
		});
		expect(newUser).not.toMatchObject({ success: false });
		if (newUser.success === false) throw new Error("Failed to create user");
		const newOrg = await client.organization.create.$post(
			{ json: { name: "test2", slug: "test2", metadata: { test: "test" } } },
			{ headers: { authorization: `Bearer ${newUser.data.token}` } },
		);

		await api.addMember({
			json: {
				organizationId: newOrg.data?.data.id as string,
				userId: user.id,
				role: "admin",
			},
		});
		const updatedMember = await client.organization.updateMemberRole.$post(
			{
				json: {
					organizationId: newOrg.data?.data.id as string,
					memberId: newOrg.data?.data.members[0]?.id as string,
					role: "admin",
				},
			},
			{ headers },
		);
		expect(updatedMember.error).toBeTruthy();
		expect(updatedMember.error?.message, JSON.stringify(updatedMember)).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
		);
	});
});
