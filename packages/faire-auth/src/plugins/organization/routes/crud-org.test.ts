import { describe, expect, test } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";
import { createCookieCapture } from "../../../utils/cookies";

describe("get-full-organization", async (test) => {
	const { $Infer, auth, signIn, customFetchImpl } = await getTestInstance({
		plugins: [organization()],
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);
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

	test("should get organization by organizationId", async ({ expect }) => {
		const { headers } = await signIn();

		//set the second org as active
		await client.organization.setActive.$post(
			{ json: { organizationId: secondOrg.data?.data.id as string } },
			{ headers },
		);
		const orgById = await client.organization.getFullOrganization.$get(
			{
				query: {
					// get the first org
					organizationId: org.data?.data.id as string,
				},
			},
			{ headers },
		);
		expect(orgById.data?.data.name).toBe("test");
	});

	test("should get organization by organizationSlug", async ({ expect }) => {
		const { headers } = await signIn();
		const orgBySlug = await client.organization.getFullOrganization.$get(
			{ query: { organizationSlug: "test" } },
			{ headers },
		);
		expect(orgBySlug.data?.data.name).toBe("test");
	});

	test("should return null when no active organization and no query params", async ({
		expect,
	}) => {
		await client.organization.setActive.$post(
			{ json: { organizationId: null } },
			{ headers },
		);
		const result = await client.organization.getFullOrganization.$get(
			{ query: {} },
			{ headers },
		);
		expect(result.data).toBeNull();
		expect(result.error).toMatchObject({ success: false, status: 400 });
	});

	test("should throw FORBIDDEN when user is not a member of the organization", async ({
		expect,
	}) => {
		const newHeaders = new Headers();
		const captureCookies = createCookieCapture(newHeaders);
		await client.signUp.email.$post(
			{
				json: { email: "test3@test.com", password: "password", name: "test3" },
			},
			{ fetchOptions: { onSuccess: captureCookies() } },
		);
		const result = await client.organization.getFullOrganization.$get(
			{ query: { organizationId: org.data?.data.id as string } },
			{ headers: newHeaders },
		);
		expect(result.error?.status).toBe(403);
		expect(result.error?.message).toContain(
			ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
		);
	});

	test("should throw BAD_REQUEST when organization doesn't exist", async ({
		expect,
	}) => {
		const result = await client.organization.getFullOrganization.$get(
			{ query: { organizationId: "non-existent-org-id" } },
			{ headers },
		);
		expect(result.error?.status).toBe(400);
		expect(result.error?.message).toContain(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
		);
	});

	test("should include invitations in the response", async ({ expect }) => {
		await client.organization.setActive.$post(
			{ json: { organizationId: org.data?.data.id as string } },
			{ headers },
		);

		// Create an invitation
		await client.organization.inviteMember.$post(
			{ json: { email: "invited@test.com", role: "member" } },
			{ headers },
		);

		const fullOrg = await client.organization.getFullOrganization.$get(
			{ query: {} },
			{ headers },
		);

		expect(fullOrg.data?.data.invitations).toBeDefined();
		expect(Array.isArray(fullOrg.data?.data.invitations)).toBe(true);
		const invitation = fullOrg.data?.data.invitations.find(
			(inv: any) => inv.email === "invited@test.com",
		);
		expect(invitation).toBeDefined();
		expect(invitation?.role).toBe("member");
	});

	test("should prioritize organizationSlug over organizationId when both are provided", async ({
		expect,
	}) => {
		const result = await client.organization.getFullOrganization.$get(
			{
				query: {
					organizationId: org.data?.data.id as string,
					organizationSlug: secondOrg.data?.data.slug as string,
				},
			},
			{ headers },
		);
		expect(result.data).toBeTruthy();
		expect(result.data?.data.name).toBe(secondOrg.data?.data.name);
	});

	test("should allow listing members with membersLimit", async ({ expect }) => {
		const { headers } = await signIn();
		await client.organization.setActive.$post(
			{ json: { organizationId: org.data?.data.id as string } },
			{ headers },
		);
		const newUser = await api.signUpEmail({
			json: { email: "test2@test.com", password: "password", name: "test2" },
		});
		await api.addMember({
			json: {
				userId: newUser.data.user.id,
				role: "member",
				organizationId: org.data?.data.id as string,
			},
		});
		const FullOrganization = await client.organization.getFullOrganization.$get(
			{ query: {} },
			{ headers },
		);
		expect(FullOrganization.data?.data.members.length).toBe(2);

		const limitedMembers = await client.organization.getFullOrganization.$get(
			{ query: { membersLimit: 1 } },
			{ headers },
		);
		expect(limitedMembers.data?.data.members.length).toBe(1);
	});

	test("should use default membershipLimit when no membersLimit is specified", async ({
		expect,
	}) => {
		await client.organization.setActive.$post(
			{ json: { organizationId: org.data?.data.id as string } },
			{ headers },
		);
		for (let i = 3; i <= 5; i++) {
			const newUser = await api.signUpEmail({
				json: {
					email: `test-${i}@test.com`,
					password: "password",
					name: `test${i}`,
				},
			});
			await api.addMember({
				json: {
					userId: newUser.data.user.id,
					role: "member",
					organizationId: org.data?.data.id as string,
				},
			});
		}

		const fullOrg = await client.organization.getFullOrganization.$get(
			{ query: {} },
			{ headers },
		);

		expect(fullOrg.data?.data.members.length).toBeGreaterThan(3);
		expect(fullOrg.data?.data.members.length).toBeLessThanOrEqual(6);
	});
});
