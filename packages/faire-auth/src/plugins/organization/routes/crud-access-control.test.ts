import type { DBFieldAttribute } from "@faire-auth/core/db";
import { False, True } from "@faire-auth/core/static";
import { describe, expectTypeOf } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils";
import { createCookieCapture } from "../../../utils/cookies";
import { createAccessControl } from "../../access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "../access";
import { inferOrgAdditionalFields, organizationClient } from "../client";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

describe("dynamic access control", async (test) => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		sales: ["create", "read", "update", "delete"],
		...defaultStatements,
	});
	const owner = ac.newRole({
		project: ["create", "delete", "update", "read"],
		sales: ["create", "read", "update", "delete"],
		...ownerAc.statements,
	});
	const admin = ac.newRole({
		project: ["create", "read", "delete", "update"],
		sales: ["create", "read"],
		...adminAc.statements,
	});
	const member = ac.newRole({
		project: ["read"],
		sales: ["read"],
		...memberAc.statements,
	});

	const additionalFields = {
		color: {
			type: "string",
			defaultValue: "#ffffff",
			required: true,
		},
		serverOnlyValue: {
			type: "string",
			defaultValue: "server-only-value",
			input: false,
			required: true,
		},
	} satisfies Record<string, DBFieldAttribute>;

	const { $Infer, auth, customFetchImpl, signIn } = await getTestInstance({
		plugins: [
			organization({
				ac,
				roles: {
					admin,
					member,
					owner,
				},
				dynamicAccessControl: {
					enabled: true,
				},
				schema: {
					organizationRole: {
						additionalFields,
					},
				},
			}),
		],
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);
	// const ctx = await auth.$context;

	const client = createAuthClient<typeof app>()({
		baseURL: "http://localhost:3000/api/auth",
		plugins: [
			organizationClient({
				ac,
				roles: {
					admin,
					member,
					owner,
				},
				dynamicAccessControl: {
					enabled: true,
				},
				schema: inferOrgAdditionalFields<typeof auth>(),
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const { headers, user, token } = await signIn();

	async function createUser({ role }: { role: "admin" | "member" | "owner" }) {
		const normalUserDetails = {
			email: `some-test-user-${crypto.randomUUID()}@email.com`,
			name: `some-test-user`,
			password: `some-test-user-${crypto.randomUUID()}`,
		};
		const normalUser = await api.signUpEmail({ json: normalUserDetails });
		if (!normalUser.success) throw new Error("Failed to create user");

		const member = await api.addMember(
			{
				json: {
					role: role || "member",
					userId: normalUser.data.user?.id!,
					organizationId: org.data?.data.id!,
				},
			},
			{ headers },
		);
		if (!member.success) throw new Error("Failed to add member");

		let userHeaders = new Headers();
		await client.signIn.email.$post(
			{
				json: {
					email: normalUserDetails.email,
					password: normalUserDetails.password,
				},
			},
			{
				fetchOptions: {
					onSuccess: createCookieCapture(userHeaders)(),
				},
			},
		);
		await client.organization.setActive.$post(
			{ json: { organizationId: org.data?.data.id! } },
			{ headers: userHeaders },
		);

		return { headers: userHeaders, user: normalUser, member: member.data };
	}

	const org = await client.organization.create.$post(
		{ json: { name: "test", slug: "test", metadata: { test: "test" } } },
		{ headers, fetchOptions: { onSuccess: createCookieCapture(headers)() } },
	);
	if (!org.data) throw new Error("Organization not created");
	const memberInfo = await api.getActiveMember({ headers });
	if (!memberInfo.success) throw new Error("Member info not found");

	// Create an admin user in the org.
	const {
		headers: adminHeaders,
		user: adminUser,
		member: adminMember,
	} = await createUser({
		role: "admin",
	});

	// Create normal users in the org.
	const {
		headers: normalHeaders,
		user: normalUser,
		member: normalMember,
	} = await createUser({
		role: "member",
	});

	/**
	 * The following test will:
	 * - Creation of a new role
	 * - Updating their own role to the newly created one (from owner to the new one)
	 * - Tests the `hasPermission` endpoint against the new role, for both a success and a failure case.
	 * - Additional fields passed in body, and correct return value & types.
	 */
	test("should successfully create a new role", async ({ expect }) => {
		// Create a new "test" role with permissions to create a project.
		const permission = {
			project: ["create"],
		};
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: "test",
					permission,
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		expect(testRole.error).toBeNull();
		expect(testRole.data?.success).toBe(True);
		expect(testRole.data?.data.roleData.permission).toEqual(permission);
		expect(testRole.data?.data.roleData.color).toBe("#000000");
		expect(testRole.data?.data.roleData.serverOnlyValue).toBe(
			"server-only-value",
		);
		expectTypeOf(testRole.data?.data.roleData.serverOnlyValue).toEqualTypeOf<
			string | undefined
		>();
		expectTypeOf(testRole.data?.data.roleData.role).toEqualTypeOf<
			string | undefined
		>();
		if (!testRole.data) return;

		// Update the role to use the new one.
		await api.updateMemberRole(
			{
				json: {
					memberId: normalMember.id,
					role: testRole.data.data.roleData.role,
				},
			},
			{ headers },
		);

		// Test against `hasPermission` endpoint
		// Should fail because the user doesn't have the permission to delete a project.
		const shouldFail = await api.hasPermission(
			{
				json: {
					organizationId: org.data?.data.id!,
					permissions: {
						project: ["delete"],
					},
				},
			},
			{
				headers: normalHeaders,
			},
		);
		expect(shouldFail.success).toBe(True);
		if (shouldFail.success !== true) throw new Error("Expected success response");
		expect(shouldFail.data).toBe(False);

		// Should pass because the user has the permission to create a project.
		const shouldPass = await api.hasPermission(
			{
				json: {
					organizationId: org.data?.data.id!,
					permissions: {
						project: ["create"],
					},
				},
			},
			{
				headers: normalHeaders,
			},
		);
		expect(shouldPass.success).toBe(True);
		if (shouldPass.success !== true) throw new Error("Expected success response");
		expect(shouldPass.data).toBe(True);
	});

	test("should not be allowed to create a role without the right ac resource permissions", async ({
		expect,
	}) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers: normalHeaders },
		);
		expect(testRole.data).toBeNull();
		if (!testRole.error) throw new Error("Test role error not found");
		expect(testRole.error.message).toEqual(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
		);
	});

	test("should not be allowed to create a role with higher permissions than the current role", async ({
		expect,
	}) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-${crypto.randomUUID()}`,
					permission: {
						sales: ["create", "delete", "create", "update", "read"], // Intentionally duplicate the "create" permission.
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers: adminHeaders },
		);
		expect(testRole.data).toBeNull();
		if (testRole.data) throw new Error("Test role created");
		expect(
			testRole.error.message?.startsWith(
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
			),
		).toBe(True);
		expect("missingPermissions" in testRole.error).toBe(True);
		if (!("missingPermissions" in testRole.error)) return;
		expect(testRole.error.missingPermissions).toEqual([
			"sales:delete",
			"sales:update",
		]);
	});

	test("should not be allowed to create a role which is either predefined or already exists in DB", async ({
		expect,
	}) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: "admin", // This is a predefined role.
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		expect(testRole.data).toBeNull();
		if (!testRole.error) throw new Error("Test role error not found");
		expect(testRole.error.message).toEqual(
			ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);

		const testRole2 = await client.organization.createRole.$post(
			{
				json: {
					role: "test", // This is a role that was created in the previous test.
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		expect(testRole2.data).toBeNull();
		if (!testRole2.error) throw new Error("Test role error not found");
		expect(testRole2.error.message, JSON.stringify(testRole2.error)).toEqual(
			ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
		);
	});

	test("should delete a role by id", async ({ expect }) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.data.roleData.id;

		const res = await api.deleteOrgRole(
			{
				json: { roleId },
			},
			{
				headers,
			},
		);
		expect(res.success).toBe(True);
	});

	test("should delete a role by name", async ({ expect }) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.data.roleData.role;

		const res = await api.deleteOrgRole(
			{
				json: { roleName },
			},
			{
				headers,
			},
		);
		expect(res.success).toBe(True);
	});

	test("should not be allowed to delete a role without necessary permissions", async ({
		expect,
	}) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers: adminHeaders },
		);
		if (!testRole.data) throw testRole.error;
		const res = await api.deleteOrgRole(
			{
				json: { roleName: testRole.data.data.roleData.role },
			},
			{
				headers: normalHeaders,
			},
		);
		expect(res.success).toBe(False);
		if (res.success !== false) throw new Error("Expected failure response");
		expect(res.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
		);
	});

	test("should not be allowed to delete a role that doesn't exist", async ({
		expect,
	}) => {
		const res = await api.deleteOrgRole(
			{
				json: { roleName: "non-existent-role" },
			},
			{
				headers,
			},
		);
		if (res.success !== false) throw new Error("Expected failure response");
		expect(res.message).toBe(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND);
	});

	test("should list roles", async ({ expect }) => {
		const permission = {
			project: ["create"],
			ac: ["read", "update", "create", "delete"],
		};
		await client.organization.createRole.$post(
			{
				json: {
					role: `list-test-role`,
					permission,
					additionalFields: {
						color: "#123",
					},
				},
			},
			{ headers },
		);

		const res = await api.listOrgRoles({ query: {} }, { headers });
		expect(res.success).toBe(True);
		if (res.success === false) throw new Error("Never");
		expect(res.data.length).toBeGreaterThan(0);
		expect(res.data[0]!.permission).not.toBeTypeOf("string");
		const foundRole = res.data.find((x) => x.role === "list-test-role");
		expect(foundRole).toBeDefined();
		expect(foundRole?.permission).toEqual(permission);
		expect(foundRole?.color).toBe(`#123`);
		expectTypeOf(foundRole?.color).toEqualTypeOf<string | undefined>();
		expectTypeOf(foundRole?.serverOnlyValue).toEqualTypeOf<
			string | undefined
		>();
	});

	test("should not be allowed to list roles without necessary permissions", async ({
		expect,
	}) => {
		const res = await api.listOrgRoles(
			{ query: {} },
			{ headers: normalHeaders },
		);
		expect(res.success).toBe(False);
		if (res.success !== false) throw new Error("Expected failure response");
		expect(res.message).toContain(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE,
		);
	});

	test("should get a role by id", async ({ expect }) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `read-test-role-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.data.roleData.id;
		const res = await api.getOrgRole(
			{
				query: {
					roleId,
					organizationId: org.data?.data.id!,
				},
			},
			{
				headers,
			},
		);
		expect(res.success).toBe(True);
		if (res.success !== true) throw new Error("Expected success response");
		expect(res.data.role).toBe(testRole.data.data.roleData.role);
		expect(res.data.permission).toEqual(testRole.data.data.roleData.permission);
		expect(res.data.color).toBe("#000000");
		expectTypeOf(res.data.color).toEqualTypeOf<string>();
	});

	test("should get a role by name", async ({ expect }) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `read-test-role-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.data.roleData.role;

		const res = await api.getOrgRole(
			{
				query: {
					roleName,
					organizationId: org.data?.data.id!,
				},
			},
			{
				headers,
			},
		);
		expect(res.success).toBe(True);
		if (res.success !== true) throw new Error("Expected success response");
		expect(res.data.role).toBe(testRole.data.data.roleData.role);
		expect(res.data.permission).toEqual(testRole.data.data.roleData.permission);
		expect(res.data.color).toBe("#000000");
		expectTypeOf(res.data.color).toEqualTypeOf<string>();
	});

	test("should update a role's permission by id", async ({ expect }) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `update-test-role-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.data.roleData.id;
		const res = await api.updateOrgRole(
			{
				json: {
					roleId,
					data: { permission: { project: ["create", "delete"] } },
				},
			},
			{
				headers,
			},
		);
		expect(res.success).toBe(True);
		if (res.success !== true) throw new Error("Expected success response");
		expect(res.data.role).toBe(testRole.data.data.roleData.role);
		expect(res.data.permission).toEqual({ project: ["create", "delete"] });
	});

	test("should update a role's name by name", async ({ expect }) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleName = testRole.data.data.roleData.role;

		const res = await api.updateOrgRole(
			{
				json: { roleName, data: { roleName: `updated-${roleName}` } },
			},
			{
				headers,
			},
		);
		expect(res.success).toBe(True);
		if (res.success !== true) throw new Error("Expected success response");
		expect(res.data.role).toBe(`updated-${roleName}`);

		const res2 = await api.getOrgRole(
			{
				query: {
					roleName: `updated-${roleName}`,
					organizationId: org.data?.data.id,
				},
			},
			{
				headers,
			},
		);
		expect(res2.success).toBe(True);
		if (res2.success !== true) throw new Error("Expected success response");
		expect(res2.data.role).toBe(`updated-${roleName}`);
	});

	test("should not be allowed to update a role without the right ac resource permissions", async ({
		expect,
	}) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `update-not-allowed-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
					},
				},
			},
			{ headers },
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.data.roleData.id;
		const res = await api.updateOrgRole(
			{
				json: {
					roleId,
					data: { roleName: `updated-${testRole.data.data.roleData.role}` },
				},
			},
			{ headers: normalHeaders },
		);
		expect(res.success).toBe(False);
	});

	test("should be able to update additional fields", async ({ expect }) => {
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-${crypto.randomUUID()}`,
					permission: {
						project: ["create"],
					},
					additionalFields: {
						color: "#000000",
						//@ts-expect-error - intentionally invalid key
						someInvalidKey: "this would be ignored by zod",
					},
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;
		const roleId = testRole.data.data.roleData.id;
		const res = await api.updateOrgRole(
			{
				json: { roleId, data: { color: "#111111" } },
			},
			{
				headers,
			},
		);
		expect(res.success).toBe(True);
		if (res.success !== true) throw new Error("Expected success response");
		expect(res.data.color).toBe("#111111");
		expect(res.data.someInvalidKey).toBeUndefined();
	});

	/**
	 * Security test cases for the privilege escalation vulnerability fix
	 * These tests verify that member queries properly filter by userId to prevent
	 * unauthorized privilege escalation where any member could gain admin permissions
	 */
	test("should not allow member to list roles using another member's permissions", async ({
		expect,
	}) => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a test role that only admin can read
		const adminOnlyRole = await client.organization.createRole.$post(
			{
				json: {
					role: `admin-only-${crypto.randomUUID()}`,
					permission: {
						project: ["delete"],
					},
					additionalFields: {
						color: "#ff0000",
					},
				},
			},
			{
				headers,
			},
		);
		if (!adminOnlyRole.data) throw adminOnlyRole.error;

		// Try to list roles as a regular member - should succeed but with member permissions
		const listAsMembers = await api.listOrgRoles(
			{
				query: { organizationId: org.data?.data.id },
			},
			{
				headers: freshMemberHeaders,
			},
		);

		// Member should be able to list roles (they have ac:read permission)
		expect(listAsMembers).toBeDefined();
		if (listAsMembers.success !== true) throw new Error("Expected success response");
		expect(Array.isArray(listAsMembers.data)).toBe(True);
	});

	test("should not allow member to get role details using another member's permissions", async ({
		expect,
	}) => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a test role
		const testRole = await client.organization.createRole.$post(
			{
				json: {
					role: `test-get-role-${crypto.randomUUID()}`,
					permission: {
						project: ["read"],
					},
					additionalFields: {
						color: "#ff0000",
					},
				},
			},
			{
				headers,
			},
		);
		if (!testRole.data) throw testRole.error;

		// Try to get role as a regular member - should succeed with member permissions
		const getRoleAsMember = await api.getOrgRole(
			{
				query: {
					organizationId: org.data?.data.id,
					roleId: testRole.data.data.roleData.id,
				},
			},
			{
				headers: freshMemberHeaders,
			},
		);

		// Member should be able to read the role (they have ac:read permission)
		expect(getRoleAsMember).toBeDefined();
		if (getRoleAsMember.success !== true) throw new Error("Expected success response");
		expect(getRoleAsMember.data.id).toBe(testRole.data.data.roleData.id);
	});

	test("should not allow member to update roles without proper permissions (privilege escalation test)", async ({
		expect,
	}) => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a test role that the owner will create
		const vulnerableRole = await client.organization.createRole.$post(
			{
				json: {
					role: `vulnerable-role-${crypto.randomUUID()}`,
					permission: {
						project: ["read"],
					},
					additionalFields: {
						color: "#ff0000",
					},
				},
			},
			{ headers }, // owner headers
		);
		if (!vulnerableRole.data) throw vulnerableRole.error;

		// Regular member should NOT be able to update the role
		// This tests the privilege escalation vulnerability fix
		const res = await api.updateOrgRole(
			{
				json: {
					roleId: vulnerableRole.data.data.roleData.id,
					data: {
						permission: {
							ac: ["create", "update", "delete"], // Try to escalate privileges
							organization: ["update", "delete"],
							project: ["create", "read", "update", "delete"],
						},
					},
				},
			},
			{
				headers: freshMemberHeaders, // member headers
			},
		);
		expect(res.success).toBe(False);

		// Verify the role permissions haven't changed
		const roleCheck = await api.getOrgRole(
			{
				query: {
					organizationId: org.data?.data.id!,
					roleId: vulnerableRole.data.data.roleData.id,
				},
			},
			{
				headers,
			},
		);
		if (roleCheck.success !== true) throw new Error("Expected success response");
		expect(roleCheck.data.permission).toEqual({
			project: ["read"],
		});
	});

	test("should properly identify the correct member when checking permissions", async ({
		expect,
	}) => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// This test ensures that the member lookup uses both organizationId AND userId
		// Create a role that only owner can update
		const ownerOnlyRole = await client.organization.createRole.$post(
			{
				json: {
					role: `owner-only-update-${crypto.randomUUID()}`,
					permission: {
						sales: ["delete"],
					},
					additionalFields: {
						color: "#ff0000",
					},
				},
			},
			{ headers }, // owner headers
		);
		if (!ownerOnlyRole.data) throw ownerOnlyRole.error;

		// Member should not be able to update (doesn't have ac:update)
		const res = await api.updateOrgRole(
			{
				json: {
					roleId: ownerOnlyRole.data.data.roleData.id,
					data: {
						roleName: "hijacked-role",
					},
				},
			},
			{
				headers: freshMemberHeaders,
			},
		);
		expect(res.success).toBe(False);
		if (res.success !== false) throw new Error("Expected failure response");
		expect(res.message).toBe(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
		);

		// Admin should be able to update (has ac:update)
		const adminUpdate = await api.updateOrgRole(
			{
				json: {
					roleId: ownerOnlyRole.data.data.roleData.id,
					data: {
						roleName: `admin-updated-${ownerOnlyRole.data.data.roleData.role}`,
					},
				},
			},
			{
				headers: adminHeaders,
			},
		);
		expect(adminUpdate).toBeDefined();
		if (adminUpdate.success !== true) throw new Error("Expected success response");
		expect(adminUpdate.data.role).toContain("admin-updated");
	});

	test("should not allow cross-organization privilege escalation", async ({
		expect,
	}) => {
		// Create a fresh member for this test to avoid role contamination
		const {
			headers: freshMemberHeaders,
			user: freshMemberUser,
			member: freshMember,
		} = await createUser({
			role: "member",
		});

		// Create a second organization
		const org2 = await client.organization.create.$post(
			{
				json: {
					name: "second-org",
					slug: `second-org-${crypto.randomUUID()}`,
				},
			},
			{ headers, fetchOptions: { onSuccess: createCookieCapture(headers)() } },
		);
		if (!org2.data) throw new Error("Second organization not created");

		// Try to list roles from org1 while active in org2 - should fail
		await client.organization.setActive.$post(
			{ json: { organizationId: org2.data.data.id } },
			{ headers: freshMemberHeaders },
		);

		// This should fail because the member is not in org2
		const res = await api.listOrgRoles(
			{
				query: { organizationId: org2.data.data.id },
			},
			{
				headers: freshMemberHeaders,
			},
		);
		expect(res.success).toBe(False);

		// Switch back to org1
		await client.organization.setActive.$post(
			{ json: { organizationId: org.data?.data.id! } },
			{ headers: freshMemberHeaders },
		);
	});
});
