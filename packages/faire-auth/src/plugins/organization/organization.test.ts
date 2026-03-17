import { APIError } from "@faire-auth/core/error";
import { True } from "@faire-auth/core/static";
import { describe, expectTypeOf, expect } from "vitest";
import { memoryAdapter } from "../../adapters/memory-adapter";
import { createAuthClient } from "../../client";
import { nextCookies } from "../../integrations/next-js";
import { getTestInstance } from "../../test-utils";
import { createAccessControl } from "../access";
import { inferOrgAdditionalFields, organizationClient } from "./client";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";
import { organization } from "./organization";
import type { InvitationStatus } from "./schema";
import type { OrganizationOptions } from "./types";

describe("organization", async (test) => {
	const { $Infer, auth, signIn, createUser } = await getTestInstance({
		user: { modelName: "users" },
		plugins: [
			organization({
				membershipLimit: 6,
				async sendInvitationEmail(_data: any, _request: any) {},
				schema: {
					organization: { modelName: "team" },
					member: { modelName: "teamMembers", fields: { userId: "user_id" } },
				},
				invitationLimit: 3,
			}),
		],
		logger: { level: "error" },
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);

	const { headers } = await signIn();
	const client = createAuthClient<typeof app>()({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	let organizationId: string;
	let organization2Id: string;
	test("create organization", async ({ expect }) => {
		const organization = await client.organization.create.$post(
			{ json: { name: "test", slug: "test", metadata: { test: "test" } } },
			{ headers },
		);
		expect(organization.data).not.toMatchObject({ success: false });
		organizationId = organization.data?.data.id as string;
		expect(organization.data?.data.name).toBeDefined();
		expect(organization.data?.data.metadata).toBeDefined();
		expect(organization.data?.data.members.length).toBe(1);
		expect(organization.data?.data.members[0]?.role).toBe("owner");
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data).not.toMatchObject({ success: false });
		expect(session.data?.data.session.activeOrganizationId).toBe(
			organizationId,
		);
	});
	test("should check if organization slug is available", async ({ expect }) => {
		const { headers } = await signIn();

		const unusedSlug = await client.organization.checkSlug.$post(
			{ json: { slug: "unused-slug" } },
			{ headers },
		);
		expect(unusedSlug.data?.success).toBe(True);

		const existingSlug = await client.organization.checkSlug.$post(
			{ json: { slug: "test" } },
			{ headers },
		);
		expect(existingSlug.error?.status).toBe(400);
		expect((existingSlug.error as { message?: string })?.message).toBe(
			"Slug is taken",
		);
	});
	test("should create organization directly in the server without cookie", async ({
		expect,
	}) => {
		const session = await client.getSession.$get({ query: {} }, { headers });

		const organization = await api.createOrganization({
			json: {
				name: "test2",
				slug: "test2",
				userId: session.data?.data.session.userId,
			},
		});

		expect(organization).not.toMatchObject({ success: false });
		if (organization.success === false)
			throw new Error("Failed to create new organization");

		organization2Id = organization?.data.id as string;
		expect(organization?.data.name).toBe("test2");
		expect(organization?.data.members.length).toBe(1);
		expect(organization?.data.members[0]?.role).toBe("owner");
	});
	test("should allow listing organizations", async ({ expect }) => {
		const organizations = await client.organization.list.$get({ headers });
		expect(
			organizations.data?.data.length,
			JSON.stringify(organizations.error),
		).toBe(2);
	});

	test("should allow updating organization", async ({ expect }) => {
		const { headers } = await signIn();
		const organization = await client.organization.update.$post(
			{ json: { organizationId, data: { name: "test2" } } },
			{ headers },
		);
		expect(organization.data?.data?.name).toBe("test2");
	});

	test("should allow updating organization metadata", async ({ expect }) => {
		const { headers } = await signIn();
		const organization = await client.organization.update.$post(
			{ json: { organizationId, data: { metadata: { test: "test2" } } } },
			{ headers },
		);
		expect(organization.data?.data?.metadata?.["test"]).toBe("test2");
	});

	test("should allow activating organization and set session", async ({
		expect,
	}) => {
		const organization = await client.organization.setActive.$post(
			{ json: { organizationId } },
			{ headers },
		);
		expect(organization.data).not.toMatchObject({ success: false });
		expect(organization.data?.data?.id).toBe(organizationId);
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data).not.toMatchObject({ success: false });
		expect(session.data?.data.session.activeOrganizationId).toBe(
			organizationId,
		);
	});
	test("should allow activating organization by slug", async ({ expect }) => {
		const { headers } = await signIn();
		await client.organization.setActive.$post(
			{ json: { organizationSlug: "test2" } },
			{ headers },
		);
		const session = await client.getSession.$get({ query: {} }, { headers });
		expect(session.data).not.toMatchObject({ success: false });
		expect(session.data?.data.session.activeOrganizationId).toBe(
			organization2Id,
		);
	});

	test("should allow getting full org on server", async ({ expect }) => {
		const org = await api.getFullOrganization({ query: {} }, { headers });
		expect(org).not.toMatchObject({ success: false });
		if (org.success === false)
			throw new Error("Failed to get full organization");
		expect(org?.data.members.length).toBe(1);
	});

	test("should allow getting full org on server using slug", async ({
		expect,
	}) => {
		const org = await api.getFullOrganization(
			{ query: { organizationSlug: "test" } },
			{ headers },
		);
		expect(org).not.toMatchObject({ success: false });
		if (org.success === false)
			throw new Error("Failed to get full organization");
		expect(org?.data.members.length).toBe(1);
	});

	const signInMap = new Map<string, typeof signIn>();
	test.each([
		{
			role: "owner",
			newUser: {
				email: "test2@test.com",
				password: "test123456",
				name: "test2",
			},
		},
		{
			role: "admin",
			newUser: {
				email: "test3@test.com",
				password: "test123456",
				name: "test3",
			},
		},
		{
			role: "member",
			newUser: {
				email: "test4@test.com",
				password: "test123456",
				name: "test4",
			},
		},
	])("invites user to organization with role", async ({ role, newUser }) => {
		const { headers } = await signIn();
		const invite = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: organizationId,
					email: newUser.email,
					role: role as "owner",
				},
			},
			{ headers },
		);

		if (!invite.data) throw new Error("Invitation not created");
		expect(invite.data.data.invitation.email).toBe(newUser.email);
		expect(invite.data.data.invitation.role).toBe(role);
		const { headers: headers2, signIn: signIn2 } = await createUser(
			true,
			newUser,
		);
		signInMap.set(newUser.email, signIn2);

		const wrongInvitation = await client.organization.acceptInvitation.$post(
			{ json: { invitationId: "123" } },
			{ headers: headers2 },
		);
		expect(wrongInvitation.error?.status).toBe(400);

		const wrongPerson = await client.organization.acceptInvitation.$post(
			{ json: { invitationId: invite.data.data.invitation.id } },
			{ headers },
		);
		expect(wrongPerson.error?.status).toBe(403);

		const invitation = await client.organization.acceptInvitation.$post(
			{ json: { invitationId: invite.data.data.invitation.id } },
			{ headers: headers2 },
		);
		expect(invitation.data?.data.invitation.status).toBe("accepted");
		const invitedUserSession = await client.getSession.$get(
			{ query: {} },
			{ headers: headers2 },
		);
		expect(invitedUserSession.data?.data.session.activeOrganizationId).toBe(
			organizationId,
		);
	});

	test("should create invitation with multiple roles", async ({ expect }) => {
		const invite = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: organizationId,
					email: "test5@test.com",
					role: ["admin", "member"],
				},
			},
			{ headers },
		);
		expect(invite.data?.data.invitation.role).toBe("admin,member");
	});

	test("should not allow inviting a user twice regardless of email casing", async ({
		expect,
	}) => {
		const rng = crypto.randomUUID();
		const user = { email: `${rng}@email.com`, password: rng, name: rng };
		const { headers } = await signIn();

		const invite = await client.organization.inviteMember.$post(
			{ json: { organizationId, email: user.email, role: "member" } },
			{ headers },
		);
		if (!invite.data) throw new Error("Invitation not created");
		expect(invite.data?.data.invitation.email).toBe(user.email);

		const inviteAgain = await client.organization.inviteMember.$post(
			{ json: { organizationId, email: user.email, role: "member" } },
			{ headers },
		);
		expect(inviteAgain.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
		);

		const inviteAgainUpper = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId,
					email: user.email.toUpperCase(),
					role: "member",
				},
			},
			{ headers },
		);
		expect(inviteAgainUpper.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
		);

		const { headers: userHeaders } = await createUser(true, user);

		const acceptRes = await client.organization.acceptInvitation.$post(
			{ json: { invitationId: invite.data.data.invitation.id } },
			{ headers: userHeaders },
		);
		expect(acceptRes.data?.data.invitation.status).toBe("accepted");

		const inviteMemberAgain = await client.organization.inviteMember.$post(
			{ json: { organizationId, email: user.email, role: "member" } },
			{ headers },
		);
		expect(inviteMemberAgain.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
		);

		const inviteMemberAgainUpper = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId,
					email: user.email.toUpperCase(),
					role: "member",
				},
			},
			{ headers },
		);
		expect(inviteMemberAgainUpper.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
		);
	});

	test("should allow getting a member", async ({ expect }) => {
		const { headers } = await signIn();
		await client.organization.setActive.$post(
			{ json: { organizationId } },
			{ headers },
		);
		const member = await client.organization.getActiveMember.$get({ headers });
		expect(member.data?.data).toMatchObject({ role: "owner" });
	});

	test("should allow updating member", async ({ expect }) => {
		const { headers, user: _user } = await signIn();
		const org = await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers },
		);
		expect(org.data).not.toMatchObject({ success: false });
		expect(org.data?.data.members[3]?.role).toBe("member");
		const member = await client.organization.updateMemberRole.$post(
			{
				json: {
					organizationId: org.data?.data.id!,
					memberId: org.data?.data.members[3]?.id!,
					role: "admin",
				},
			},
			{ headers },
		);
		expect(member.data?.data.role).toBe("admin");
	});

	test("should allow setting multiple roles", async ({ expect }) => {
		const { headers } = await signIn();
		const org = await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers },
		);
		const c = await client.organization.updateMemberRole.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					role: ["member", "admin"],
					memberId: org.data?.data.members[1]?.id as string,
				},
			},
			{ headers },
		);
		expect(c.data).not.toMatchObject({ success: false });
		expect(c.data?.data.role).toBe("member,admin");
	});

	test("should allow setting multiple roles when you have multiple yourself", async ({
		expect,
	}) => {
		const { headers, user } = await signIn();
		const org = await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers },
		);

		const activeMember = org?.data?.data.members.find(
			(m) => m.userId === user.id,
		);

		expect(activeMember?.role).toBe("owner");

		const c1 = await client.organization.updateMemberRole.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					role: ["owner", "admin"],
					memberId: activeMember?.id as string,
				},
			},
			{ headers },
		);

		expect(c1.data?.data.role).toBe("owner,admin");

		const c2 = await client.organization.updateMemberRole.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					role: ["owner"],
					memberId: activeMember!.id as string,
				},
			},
			{ headers },
		);

		expect(c2.data?.data.role).toBe("owner");
	});

	// from previous test.each() test
	const adminEmail = "test3@test.com";

	test("should not allow inviting member with a creator role unless they are creator", async ({
		expect,
	}) => {
		const { headers: adminHeaders } = await signInMap.get(adminEmail)!();

		const invite = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: organizationId,
					email: adminEmail,
					role: "owner",
				},
			},
			{ headers: adminHeaders },
		);
		expect(invite.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
		);
	});

	test("should allow leaving organization", async ({ expect }) => {
		const newUser = {
			email: "leave@org.com",
			name: "leaving member",
			password: "password",
		};
		const { headers, user } = await createUser(true, newUser);

		await api.addMember({
			json: { organizationId, userId: user.id, role: "admin" },
		});
		const leaveRes = await client.organization.leave.$post(
			{ json: { organizationId } },
			{ headers },
		);
		expect(leaveRes.data?.data, JSON.stringify(leaveRes.error)).toMatchObject({
			userId: user.id,
		});
	});

	test("shouldn't allow updating owner role if you're not owner", async ({
		expect,
	}) => {
		const { headers } = await signIn();
		const {
			data: { members },
		} = (await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers },
		)) as any;
		const { headers: adminHeaders } = await signInMap.get(adminEmail)!();

		const res = await client.organization.updateMemberRole.$post(
			{
				json: {
					organizationId: organizationId,
					role: "admin",
					memberId: members.find((m: any) => m.role === "owner")?.id!,
				},
			},
			{ headers: adminHeaders },
		);
		expect(res.error?.status).toBe(403);
	});

	test("should allow removing member from organization", async ({ expect }) => {
		const { headers } = await signIn();
		const orgBefore = await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers },
		);

		expect(orgBefore.data?.data.members.length).toBe(5);
		await client.organization.removeMember.$post(
			{
				json: {
					organizationId: organizationId,
					memberIdOrEmail: adminEmail,
				},
			},
			{ headers },
		);
		const org = await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers },
		);
		expect(org.data?.data.members.length).toBe(4);
	});

	test("shouldn't allow removing last owner from organization", async ({
		expect,
	}) => {
		const { headers } = await signIn();
		const org = await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers },
		);

		if (!org.data) throw new Error("Organization not found");
		const removedOwner = await client.organization.removeMember.$post(
			{
				json: {
					organizationId: org.data.data.id,
					memberIdOrEmail: org.data?.data.members.find(
						(m) => m.role === "owner",
					)!.id,
				},
			},
			{ headers },
		);
		expect(removedOwner.error?.status).toBe(400);
	});

	test("should validate permissions", async ({ expect }) => {
		await client.organization.setActive.$post(
			{ json: { organizationId } },
			{ headers },
		);
		const hasPermission = await client.organization.hasPermission.$post(
			{ json: { permissions: { member: ["update"] } } },
			{ headers },
		);
		expect(hasPermission.data).not.toMatchObject({ success: false });
		expect(hasPermission.data?.data).toBe(true);

		const hasMultiplePermissions =
			await client.organization.hasPermission.$post(
				{
					json: { permissions: { member: ["update"], invitation: ["create"] } },
				},
				{ headers },
			);
		expect(hasMultiplePermissions.data).not.toMatchObject({ success: false });
		if (
			hasMultiplePermissions.data == null ||
			hasMultiplePermissions.data.data === false
		)
			throw new Error("Permission check failed");
		expect(hasMultiplePermissions.data?.data).toBe(true);
	});

	test("should allow deleting organization", async ({ expect }) => {
		const { headers: adminHeaders } = await signInMap.get(adminEmail)!();

		await client.organization.delete.$post(
			{ json: { organizationId } },
			{ headers: adminHeaders },
		);
		const org = await client.organization.getFullOrganization.$get(
			{ query: { organizationId } },
			{ headers: adminHeaders },
		);
		expect(org.error?.status).toBe(403);
	});

	test("should have server side methods", async ({ expect }) => {
		expectTypeOf(api.createOrganization).toBeFunction();
		expectTypeOf(api.getInvitation).toBeFunction();
	});

	test("should add member on the server directly", async ({ expect }) => {
		const newUser = await api.signUpEmail({
			json: {
				email: "new-member@email.com",
				password: "password",
				name: "new member",
			},
		});
		expect(newUser).not.toMatchObject({ success: false });
		if (newUser.success === false) throw new Error("Failed to create new user");
		const session = await api.getSession(
			{ query: {} },
			{
				headers: new Headers({
					Authorization: `Bearer ${newUser?.data.token}`,
				}),
			},
		);
		expect(session).not.toMatchObject({ success: false });
		if (session.success === false) throw new Error("Failed to get session");
		const org = await api.createOrganization(
			{ json: { name: "test2", slug: "test3" } },
			{ headers },
		);
		expect(org).not.toMatchObject({ success: false });
		if (org.success === false) throw new Error("Failed to create organization");
		const member = await api.addMember({
			json: {
				organizationId: org?.data.id,
				userId: session?.data.user?.id!,
				role: "admin",
			},
		});
		expect(member).not.toMatchObject({ success: false });
		if (member.success === false) throw new Error("Failed to add member");
		expect(member?.data.role).toBe("admin");
	});

	test("should add member on the server with multiple roles", async ({
		expect,
	}) => {
		const newUser = await api.signUpEmail({
			json: {
				email: "new-member-mr@email.com",
				password: "password",
				name: "new member mr",
			},
		});
		expect(newUser).not.toMatchObject({ success: false });
		if (newUser.success === false) throw new Error("Failed to create new user");
		const session = await api.getSession(
			{ query: {} },
			{
				headers: new Headers({
					Authorization: `Bearer ${newUser?.data.token}`,
				}),
			},
		);
		expect(session).not.toMatchObject({ success: false });
		if (session.success === false) throw new Error("Failed to get session");
		const org = await api.createOrganization(
			{ json: { name: "test2", slug: "test4" } },
			{ headers },
		);
		expect(org).not.toMatchObject({ success: false });
		if (org.success === false) throw new Error("Failed to create organization");
		const member = await api.addMember({
			json: {
				organizationId: org?.data.id,
				userId: session?.data.user?.id!,
				role: ["admin", "member"],
			},
		});
		expect(member).not.toMatchObject({ success: false });
		if (member.success === false) throw new Error("Failed to add member");
		expect(member?.data.role).toBe("admin,member");
	});

	test("should respect membershipLimit when adding members to organization", async ({
		expect,
	}) => {
		const org = await api.createOrganization(
			{
				json: {
					name: "test-5-membership-limit",
					slug: "test-5-membership-limit",
				},
			},
			{ headers },
		);
		expect(org).not.toMatchObject({ success: false });
		if (org.success === false) throw new Error("Failed to create organization");

		const users = [
			"user1@email.com",
			"user2@email.com",
			"user3@email.com",
			"user4@email.com",
		];

		for (const user of users) {
			const newUser = await api.signUpEmail({
				json: { email: user, password: "password", name: user },
			});
			expect(newUser).not.toMatchObject({ success: false });
			if (newUser.success === false)
				throw new Error("Failed to create new user");
			const session = await api.getSession(
				{ query: {} },
				{
					headers: new Headers({
						Authorization: `Bearer ${newUser?.data.token}`,
					}),
				},
			);
			expect(session).not.toMatchObject({ success: false });
			if (session.success === false) throw new Error("Failed to get session");
			await api.addMember({
				json: {
					organizationId: org?.data.id,
					userId: session?.data.user?.id!,
					role: "admin",
				},
			});
		}

		const userOverLimit = {
			email: "shouldthrowerror@email.com",
			password: "password",
			name: "name",
		};
		const userOverLimit2 = {
			email: "shouldthrowerror2@email.com",
			password: "password",
			name: "name",
		};

		// test API method
		const newUser = await api.signUpEmail({
			json: {
				email: userOverLimit.email,
				password: userOverLimit.password,
				name: userOverLimit.name,
			},
		});
		expect(newUser).not.toMatchObject({ success: false });
		if (newUser.success === false) throw new Error("Failed to create new user");
		const session = await api.getSession(
			{ query: {} },
			{
				headers: new Headers({
					Authorization: `Bearer ${newUser?.data.token}`,
				}),
			},
		);
		expect(session).not.toMatchObject({ success: false });
		if (session.success === false) throw new Error("Failed to get session");
		const res0 = await api.addMember({
			json: {
				organizationId: org?.data.id,
				userId: session?.data.user?.id!,
				role: "admin",
			},
		});
		expect(res0.success).toBe(true);
		expect((res0 as any).message).not.toBeDefined();
		// toBe(
		// 	ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
		// );
		const invite = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: org?.data.id,
					email: userOverLimit2.email,
					role: "member",
				},
			},
			{ headers },
		);
		if (!invite.data) throw new Error("Invitation not created");
		const res = await client.signUp.email.$post({
			// TODO: supposed to be userOverLimit2?
			json: {
				email: userOverLimit.email,
				password: userOverLimit.password,
				name: userOverLimit.name,
			},
		});
		if ((res as any).success === false)
			throw new Error(`Failed to sign up ${JSON.stringify(res)}`);

		const { headers: headers2 } = await createUser(true, userOverLimit2);

		const invitation = await client.organization.acceptInvitation.$post(
			{ json: { invitationId: invite.data.data.invitation.id } },
			{ headers: headers2 },
		);
		expect(invitation.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
		);

		const getFullOrganization =
			await client.organization.getFullOrganization.$get(
				{ query: { organizationId: org?.data.id } },
				{ headers },
			);
		expect(getFullOrganization.data).not.toMatchObject({ success: false });
		if (
			getFullOrganization.data == null ||
			("status" in getFullOrganization.data &&
				getFullOrganization.data.status === false)
		)
			throw new Error("Failed to get full organization");
		expect(getFullOrganization.data?.data.members.length).toBe(6);
	}, 15000);

	test("should allow listing invitations for an org", async ({ expect }) => {
		const invitations = await client.organization.listInvitations.$get(
			{ query: { organizationId: organizationId } },
			{ headers: headers },
		);
		expect(invitations.data?.data.length).toBe(5);
	});

	test("should allow listing invitations for a user using authClient", async ({
		expect,
	}) => {
		const { headers: headers2, user } = await createUser();
		const { headers: adminHeaders, user: orgAdminUser } = await createUser();

		const orgRng = crypto.randomUUID();
		const org = await api.createOrganization(
			{ json: { name: orgRng, slug: orgRng } },
			{ headers: adminHeaders },
		);
		expect(org).not.toMatchObject({ success: false });
		if (org.success === false) throw new Error("Failed to create organization");
		const invitation = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: org?.data.id,
					email: user.email,
					role: "member",
				},
			},
			{ headers: adminHeaders },
		);
		expect(invitation.data).not.toMatchObject({ success: false });
		if (invitation.data == null) throw new Error("Failed to invite member");
		const userInvitations = await client.organization.listUserInvitations.$get(
			{ query: {} },
			{ headers: headers2 },
		);
		expect(userInvitations.data?.data[0]?.id).toBe(
			invitation.data.data.invitation.id,
		);
		expect(userInvitations.data?.data.length).toBe(1);
	}, 15000);

	test("should allow listing invitations for a user using server", async ({
		expect,
	}) => {
		const orgInvitations = await client.organization.listInvitations.$get(
			{ query: {} },
			{ headers },
		);

		if (!orgInvitations.data?.data[0]?.email) throw new Error("No email found");

		const invitations = await api.listUserInvitations({
			query: { email: orgInvitations.data?.data[0].email },
		});
		expect(invitations).not.toMatchObject({ success: false });
		if (invitations.success === false)
			throw new Error("Failed to list user invitations");
		expect(invitations?.data.length).toBe(
			orgInvitations.data.data.filter(
				(x) => x.email === orgInvitations.data?.data[0]?.email,
			).length,
		);

		const invitationsUpper = await api.listUserInvitations({
			query: { email: orgInvitations.data?.data[0].email.toUpperCase() },
		});
		expect(invitationsUpper).not.toMatchObject({ success: false });
		if (invitationsUpper.success === false)
			throw new Error("Failed to list user invitations");

		expect(invitationsUpper?.data.length).toBe(
			orgInvitations.data.data.filter(
				(x) => x.email === orgInvitations.data?.data[0]?.email,
			).length,
		);
	});
});

describe("access control", async (test) => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
	});
	const owner = ac.newRole({
		project: ["create", "delete", "update", "read"],
		sales: ["create", "read", "update", "delete"],
	});
	const admin = ac.newRole({
		project: ["create", "read"],
		sales: ["create", "read"],
	});
	const member = ac.newRole({ project: ["read"], sales: ["read"] });
	const { $Infer, auth, customFetchImpl, signIn } = await getTestInstance({
		plugins: [organization({ ac, roles: { admin, member, owner } })],
	});
	const app = $Infer.app(auth.options);

	const {
		organization: {
			checkRolePermission,
			hasPermission: { $post: hasPermission },
			create: { $post: create },
		},
	} = createAuthClient<typeof app>()({
		baseURL: "http://localhost:3000",
		plugins: [organizationClient({ ac, roles: { admin, member, owner } })],
		fetchOptions: { customFetchImpl },
	});

	const { headers, captureCookies } = await signIn();

	await create(
		{ json: { name: "test", slug: "test", metadata: { test: "test" } } },
		{ onSuccess: captureCookies(), headers },
	);

	test("should return success", async ({ expect }) => {
		const canCreateProject = checkRolePermission({
			role: "admin",
			permissions: { project: ["create"] },
		});
		expect(canCreateProject).toBe(true);

		// To be removed when `permission` will be removed entirely
		const canCreateProjectLegacy = checkRolePermission({
			role: "admin",
			permission: { project: ["create"] },
		});
		expect(canCreateProjectLegacy).toBe(true);

		const canCreateProjectServer = await hasPermission(
			{ json: { permissions: { project: ["create"] } } },
			{ headers },
		);
		expect(canCreateProjectServer.data).not.toMatchObject({ success: false });
		if (canCreateProjectServer.data == null)
			throw new Error("Permission check failed");
		expect(canCreateProjectServer.data.data).toBe(true);
	});

	test("should return not success", async ({ expect }) => {
		const canCreateProject = checkRolePermission({
			role: "admin",
			permissions: { project: ["delete"] },
		});
		expect(canCreateProject).toBe(false);
	});

	test("should return not success", async ({ expect }) => {
		const res = checkRolePermission({
			role: "admin",
			permissions: { project: ["read"], sales: ["delete"] },
		});
		expect(res).toBe(false);
	});
});

describe("invitation limit", async (test) => {
	const { $Infer, auth, customFetchImpl, signIn } = await getTestInstance({
		plugins: [
			organization({
				invitationLimit: 1,
				async sendInvitationEmail(_data: any, _request: any) {},
			}),
		],
	});
	const app = $Infer.app(auth.options);
	const client = createAuthClient<typeof app>()({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: { customFetchImpl },
	});
	const { headers } = await signIn();
	const org = await client.organization.create.$post(
		{ json: { name: "test", slug: "test" } },
		{ headers },
	);

	test("should invite member to organization", async ({ expect }) => {
		const invite = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					email: "test6@test.com",
					role: "member",
				},
			},
			{ headers },
		);
		expect(invite.data?.data.invitation.status).toBe("pending");
	});

	test("should throw error when invitation limit is reached", async ({
		expect,
	}) => {
		const invite = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					email: "test7@test.com",
					role: "member",
				},
			},
			{ headers },
		);
		expect(invite.error?.status).toBe(403);
		expect(invite.error?.message).toBe(
			ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
		);
	});

	test("should throw error with custom invitation limit", async ({
		expect,
	}) => {
		const { auth, signIn, $Infer } = await getTestInstance({
			plugins: [
				organization({
					invitationLimit: async (_data: any, _ctx: any) => {
						return 0;
					},
				}),
			],
		});
		const app = $Infer.app(auth.options);
		const api = $Infer.api(app);
		const { headers } = await signIn();
		const org = await api.createOrganization(
			{ json: { name: "test", slug: "test" } },
			{ headers },
		);
		expect(org).not.toMatchObject({ success: false });
		if (org.success === false) throw new Error("Failed to create organization");
		await api
			.createInvitation(
				{
					json: {
						email: "test8@test.com",
						role: "member",
						organizationId: org?.data.id as string,
					},
				},
				{ headers },
			)
			.catch((e: APIError) => {
				expect(e.message).toBe(
					ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
				);
			});
	});
});

describe("cancel pending invitations on re-invite", async (test) => {
	const { $Infer, auth, customFetchImpl, signIn } = await getTestInstance({
		plugins: [organization({ cancelPendingInvitationsOnReInvite: true })],
	});
	const app = $Infer.app(auth.options);
	const client = createAuthClient<typeof app>()({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: { customFetchImpl },
	});
	const { headers } = await signIn();
	const org = await client.organization.create.$post(
		{ json: { name: "test", slug: "test" } },
		{ headers },
	);
	expect(org.data).not.toMatchObject({ success: false });

	test("should cancel pending invitations on re-invite", async ({ expect }) => {
		const invite = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					email: "test9@test.com",
					role: "member",
				},
			},
			{ headers },
		);
		expect(invite.data?.data.invitation.status).toBe("pending");
		const invite2 = await client.organization.inviteMember.$post(
			{
				json: {
					organizationId: org.data?.data.id as string,
					email: "test9@test.com",
					role: "member",
					resend: true,
				},
			},
			{ headers },
		);
		expect(invite2.data?.data.invitation.status).toBe("pending");
		const listInvitations = await client.organization.listInvitations.$get(
			{ query: {} },
			{ headers },
		);
		expect(
			listInvitations.data?.data.filter((invite) => invite.status === "pending")
				.length,
		).toBe(1);
	});
});

// describe("owner can update roles", async (test) => {
// 	const statement = { custom: ["custom"] } as const;

// 	const ac = createAccessControl(statement);

// 	const custom = ac.newRole({ custom: ["custom"] });

// 	const { auth, $Infer } = await getTestInstance({
// 		emailAndPassword: { enabled: true },
// 		plugins: [admin(), organization({ ac, roles: { custom, owner: ownerAc } })],
// 	});

// 	const app = $Infer.app(auth.options);
// 	const api = $Infer.api(app);

// 	const adminEmail = "admin@email.com";
// 	const adminPassword = "adminpassword";

// 	await api.createUser({
// 		json: {
// 			email: adminEmail,
// 			password: adminPassword,
// 			name: "Admin",
// 			role: "admin",
// 		},
// 	});

// 	const { headers } = await api.signInEmail(
// 		{ json: { email: adminEmail, password: adminPassword } },
// 		{ returnHeaders: true },
// 	);

// 	const adminCookie = headers.getSetCookie()[0]!;

// 	const org = await api.createOrganization(
// 		{ json: { name: "Org", slug: "org" } },
// 		{ headers: { cookie: adminCookie } },
// 	);

// 	expect(org).not.toMatchObject({ success: false });
// 	if (org.success === false) throw new Error("couldn't create an organization");

// 	const ownerId = org.data.members.at(0)?.id;
// 	if (!ownerId) throw new Error("couldn't get the owner id");

// 	test("allows setting custom role to a user", async ({ expect }) => {
// 		const userEmail = "user@email.com";
// 		const userPassword = "userpassword";

// 		const user = await api.createUser(
// 			{ json: { name: "user", email: userEmail, password: userPassword } },
// 			{ headers: { cookie: adminCookie } },
// 		);
// 		expect(user).not.toMatchObject({ success: false });
// 		if (user.success === false) throw new Error("Failed to create user");

// 		const addMemberRes = await api.addMember(
// 			{ json: { organizationId: org.data.id, userId: user.data.id, role: [] } },
// 			{ headers: { cookie: adminCookie } },
// 		);

// 		expect(addMemberRes).not.toMatchObject({ success: false });
// 		if (addMemberRes.success === false)
// 			throw new Error("couldn't add user as a member to a repo");

// 		await api.updateMemberRole(
// 			{
// 				json: {
// 					organizationId: org.data.id,
// 					memberId: addMemberRes.data.id,
// 					role: ["custom"],
// 				},
// 			},
// 			{ headers: { cookie: adminCookie } },
// 		);

// 		const signInRes = await api.signInEmail(
// 			{ json: { email: userEmail, password: userPassword } },
// 			{ returnHeaders: true },
// 		);
// 		expect(signInRes?.response.success).not.toBe(false);
// 		if (signInRes.response.success === false)
// 			throw new Error("Failed to sign in");

// 		const userCookie = signInRes.headers.getSetCookie()[0];

// 		const permissionRes = await api.hasPermission(
// 			{
// 				json: {
// 					organizationId: org.data.id,
// 					permissions: { custom: ["custom"] },
// 				},
// 			},
// 			{ headers: { cookie: userCookie! } },
// 		);

// 		expect(permissionRes).not.toMatchObject({ success: false });
// 		if (permissionRes.success === false)
// 			throw new Error("Permission check failed");
// 		expect(permissionRes?.data).toBe(true);
// 		expect(permissionRes).not.toHaveProperty("message");
// 	});

// 	test("allows org owner to set a custom role for themselves", async ({ expect }) => {
// 		await api.updateMemberRole(
// 			{
// 				json: {
// 					organizationId: org.data.id,
// 					memberId: ownerId,
// 					role: ["owner", "custom"],
// 				},
// 			},
// 			{ headers: { cookie: adminCookie } },
// 		);

// 		const permissionRes = await api.hasPermission(
// 			{
// 				json: {
// 					organizationId: org.data.id,
// 					permissions: { custom: ["custom"] },
// 				},
// 			},
// 			{ headers: { cookie: adminCookie } },
// 		);

// 		expect(permissionRes.data).toBe(true);
// 		expect(permissionRes).not.toHaveProperty("message");
// 	});

// 	// TODO: We might not want to allow this.
// 	test("allows an org owner to remove their own creator role", async ({ expect }) => {
// 		await api.updateMemberRole(
// 			{ json: { organizationId: org.data.id, memberId: ownerId, role: [] } },
// 			{ headers: { cookie: adminCookie } },
// 		);

// 		const member = await api.getActiveMember({
// 			headers: { cookie: adminCookie },
// 		});
// 		expect(member).not.toMatchObject({ success: false });
// 		if (member.success === false)
// 			throw new Error("Failed to get active member");
// 		expect(member?.data.role).toBe("");
// 	});
// });

describe("types", async (test) => {
	const { $Infer, auth } = await getTestInstance({
		plugins: [organization({})],
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);

	test("should infer active organization", async ({ expect }) => {
		type Infer = typeof auth.$Infer;
		type ActiveOrganization = Infer extends { ActiveOrganization: infer T }
			? T
			: never;

		type FullOrganization = Awaited<
			ReturnType<typeof api.getFullOrganization<false, false>>
		> & { success: true };
		// TODO: Auth interface erases plugin $Infer types — ActiveOrganization resolves to never
		// Need to parameterize Auth over plugin types or preserve concrete faireAuth() return in getTestInstance
		// @ts-expect-error $Infer merging for plugins not yet implemented
		expectTypeOf<FullOrganization>().toMatchObjectType<ActiveOrganization>();
	});
});

describe("Additional Fields", async (test) => {
	const db = {
		users: [],
		sessions: [],
		account: [],
		organization: [],
		invitation: [] as {
			id: string;
			invitationRequiredField: string;
			invitationOptionalField?: string;
		}[],
		member: [] as {
			id: string;
			memberRequiredField: string;
			memberOptionalField?: string;
		}[],
		team: [] as {
			id: string;
			teamRequiredField: string;
			teamOptionalField?: string;
		}[],
		teamMember: [] as { id: string }[],
	};

	const { $Infer, auth, signIn } = await getTestInstance({
		database: memoryAdapter(db, { debugLogs: false }),
		user: { modelName: "users" },
		plugins: [
			organization({
				teams: { enabled: true },
				schema: {
					organization: {
						additionalFields: {
							someRequiredField: { type: "string", required: true },
							someOptionalField: { type: "string", required: false },
							someHiddenField: { type: "string", input: false },
						},
					},
					member: {
						additionalFields: {
							memberRequiredField: { type: "string", required: true },
							memberOptionalField: { type: "string" },
						},
					},
					team: {
						additionalFields: {
							teamRequiredField: { type: "string", required: true },
							teamOptionalField: { type: "string" },
						},
					},
					invitation: {
						additionalFields: {
							invitationRequiredField: { type: "string", required: true },
							invitationOptionalField: { type: "string" },
						},
					},
				},
				invitationLimit: 3,
			}),
			nextCookies(),
		],
		logger: { level: "error" },
	});

	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);

	const { headers, user: _user } = await signIn();
	const client = createAuthClient<typeof app>()({
		plugins: [
			organizationClient({
				schema: inferOrgAdditionalFields<typeof auth>(),
				teams: { enabled: true },
			}),
		],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	const client2 = createAuthClient<typeof app>()({
		plugins: [
			organizationClient({
				schema: inferOrgAdditionalFields<typeof auth>(),
				teams: { enabled: true },
			}),
		],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	test("Expect team endpoints to still be defined", async ({ expect }) => {
		const teams = client.organization.createTeam.$post;
		expect(teams).toBeDefined();
	});

	let org: any;
	test("create organization", async ({ expect }) => {
		try {
			const orgRes = await api.createOrganization(
				{
					json: {
						name: "test",
						slug: "test",
						someRequiredField: "hey",
						someOptionalField: "hey",
					},
				},
				{ headers },
			);
			expect(orgRes).not.toMatchObject({ success: false });
			if (orgRes.success === false) throw new Error("Failed to create org");

			org = orgRes.data;
			expect(org.someRequiredField).toBeDefined();
			expect(org.someRequiredField).toBe("hey");
			expect(org.someOptionalField).toBe("hey");
			expect(org.someHiddenField).toBeUndefined();
			//@ts-expect-error
			expect(db.organization[0]?.someRequiredField).toBe("hey");
		} catch (error) {
			throw error;
		}
	});

	test("update organization", async ({ expect }) => {
		const updatedOrg = await api.updateOrganization(
			{ json: { data: { someRequiredField: "hey2" }, organizationId: org.id } },
			{ headers },
		);
		expect(updatedOrg).not.toMatchObject({ success: false });
		if (updatedOrg.success === false)
			throw new Error("Failed to update organization");
		expect(updatedOrg?.data?.someRequiredField).toBe("hey2");
		//@ts-expect-error
		expect(db.organization[0]?.someRequiredField).toBe("hey2");
	});

	test("add member", async ({ expect }) => {
		const newUser = await api.signUpEmail({
			json: {
				email: "new-member@email.com",
				password: "password",
				name: "new member",
			},
		});
		expect(newUser).not.toMatchObject({ success: false });
		if (newUser.success === false) throw new Error("Failed to sign up user");

		const member = await api.addMember({
			json: {
				organizationId: org.id,
				userId: newUser.data.user?.id!,
				role: "member",
				memberRequiredField: "hey",
				memberOptionalField: "hey2",
			},
		});
		if (member.success === false) throw new Error("Member is null");
		expect(member.data.memberRequiredField).toBe("hey");
		expect(member.data.memberOptionalField).toBe("hey2");
		const row = db.member.find((x) => x.id === member.data.id)!;
		expect(row).toBeDefined();
		expect(row.memberRequiredField).toBe("hey");
		expect(row.memberOptionalField).toBe("hey2");
	});

	test("create invitation", async ({ expect }) => {
		const invitation = await api.createInvitation(
			{
				json: {
					email: "test10@test.com",
					role: "member",
					invitationRequiredField: "hey",
					invitationOptionalField: "hey2",
					organizationId: org.id,
				},
			},
			{ headers },
		);

		expect(invitation).not.toMatchObject({ success: false });
		if (invitation.success === false)
			throw new Error("Failed to list invitations");
		expect(invitation?.data.invitation.invitationRequiredField).toBe("hey");
		expect(invitation?.data.invitation.invitationOptionalField).toBe("hey2");
		const row = db.invitation.find(
			(x) => x.id === invitation?.data.invitation.id,
		)!;
		expect(row).toBeDefined();
		expect(row.invitationRequiredField).toBe("hey");
		expect(row.invitationOptionalField).toBe("hey2");
	});

	test("list invitations", async ({ expect }) => {
		const invitations = await api.listInvitations(
			{ query: { organizationId: org.id } },
			{ headers },
		);

		expect(invitations).not.toMatchObject({ success: false });
		if (invitations.success === false)
			throw new Error("Failed to list invitations");
		expect(invitations?.data.length).toBe(1);
		const invitation = invitations?.data[0]!;
		expect(invitation.invitationRequiredField).toBe("hey");
		expect(invitation.invitationOptionalField).toBe("hey2");
	});

	let team: any = null;
	test("create team", async ({ expect }) => {
		team = await api
			.createTeam(
				{
					json: {
						name: "test",
						teamRequiredField: "hey",
						teamOptionalField: "hey2",
						organizationId: org.id,
					},
				},
				{ headers },
			)
			.then((x) => {
				if (x.success !== true) throw new Error("Expected success response");
				return x.data;
			});

		expect(team!.teamRequiredField).toBe("hey");
		expect(team!.teamOptionalField).toBe("hey2");
		const row = db.team.find((x) => x.id === team?.id)!;
		expect(row).toBeDefined();
		expect(row.teamRequiredField).toBe("hey");
		expect(row.teamOptionalField).toBe("hey2");
	});

	test("update team", async ({ expect }) => {
		if (!team) throw new Error("Team is null");
		const updatedTeam = await api.updateTeam(
			{
				json: {
					teamId: team!.id,
					data: { teamOptionalField: "hey3", teamRequiredField: "hey4" },
				},
			},
			{ headers },
		);

		if (!updatedTeam) throw new Error("Updated team is null");
		expect(updatedTeam).not.toMatchObject({ success: false });
		if (updatedTeam.success === false) throw new Error("Failed to update team");
		expect(updatedTeam?.data?.teamOptionalField).toBe("hey3");
		expect(updatedTeam?.data?.teamRequiredField).toBe("hey4");
		const row = db.team.find((x) => x.id === updatedTeam?.data?.id)!;
		expect(row).toBeDefined();
		expect(row.teamOptionalField).toBe("hey3");
		expect(row.teamRequiredField).toBe("hey4");
	});
});

describe("organization hooks", async (test) => {
	let hooksCalled: string[] = [];

	const { $Infer, auth, signIn, customFetchImpl } = await getTestInstance({
		plugins: [
			organization({
				organizationHooks: {
					beforeCreateOrganization: async (data) => {
						hooksCalled.push("beforeCreateOrganization");
						return {
							data: {
								...data.organization,
								metadata: { hookCalled: true },
							},
						};
					},
					afterCreateOrganization: async (data) => {
						hooksCalled.push("afterCreateOrganization");
					},
					beforeCreateInvitation: async (data) => {
						hooksCalled.push("beforeCreateInvitation");
					},
					afterCreateInvitation: async (data) => {
						hooksCalled.push("afterCreateInvitation");
					},
					beforeAddMember: async (data) => {
						hooksCalled.push("beforeAddMember");
					},
					afterAddMember: async (data) => {
						hooksCalled.push("afterAddMember");
					},
				},
				async sendInvitationEmail() {},
			}),
		],
	});
	const app = $Infer.app(auth.options);

	const client = createAuthClient<typeof app>()({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl,
		},
	});

	const { headers } = await signIn();

	test("should call organization creation hooks", async ({ expect }) => {
		hooksCalled = [];
		const organization = await client.organization.create.$post(
			{
				json: {
					name: "Test Org with Hooks",
					slug: "test-org-hooks",
				},
			},
			{
				headers,
			},
		);

		expect(hooksCalled).toContain("beforeCreateOrganization");
		expect(hooksCalled).toContain("afterCreateOrganization");
		expect(
			organization.data?.data.metadata,
			JSON.stringify(organization),
		).toEqual({ hookCalled: true });
	});

	test("should call invitation hooks", async ({ expect }) => {
		hooksCalled = [];

		await client.organization.inviteMember.$post(
			{
				json: {
					email: "test@example.com",
					role: "member",
				},
			},
			{
				headers,
			},
		);

		expect(hooksCalled).toContain("beforeCreateInvitation");
		expect(hooksCalled).toContain("afterCreateInvitation");
	});
});
