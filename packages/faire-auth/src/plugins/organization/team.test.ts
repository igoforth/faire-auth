import { True } from "@faire-auth/core/static";
import { describe } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils";
import { createCookieCapture } from "../../utils/cookies";
import { organizationClient } from "./client";
import { organization } from "./organization";

describe("team", async (test) => {
	const { $Infer, auth, signIn, createUser, customFetchImpl } =
		await getTestInstance({
			user: { modelName: "users" },
			plugins: [
				organization({
					async sendInvitationEmail() {},
					teams: { enabled: true as const },
				}),
			],
			logger: { level: "error" },
		});
	const app = $Infer.app(auth.options);

	const { headers } = await signIn();
	const client = createAuthClient<typeof app>()({
		plugins: [organizationClient({ teams: { enabled: true } })],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: { customFetchImpl },
	});

	let organizationId: string;
	let teamId: string;
	let secondTeamId: string;

	const { user: invitedUser, headers: signUpHeaders } = await createUser();
	// const invitedUser = {
	// 	email: "invited@email.com",
	// 	password: "password",
	// 	name: "Invited User",
	// };

	// const signUpHeaders = new Headers();
	// const signUpRes = await client.signUp.email.$post(
	// 	{ json: invitedUser },
	// 	{ fetchOptions: { onSuccess: createCookieCapture(signUpHeaders)() } },
	// );

	test("should create an organization and a team", async ({ expect }) => {
		const createOrganizationResponse = await client.organization.create.$post(
			{
				json: {
					name: "Test Organization",
					slug: "test-org",
					metadata: { test: "organization-metadata" },
				},
			},
			{ headers },
		);

		organizationId = createOrganizationResponse.data?.data.id as string;
		expect(createOrganizationResponse.data?.data.name).toBe(
			"Test Organization",
		);
		expect(createOrganizationResponse.data?.data.slug).toBe("test-org");
		expect(createOrganizationResponse.data?.data.members.length).toBe(1);
		expect(createOrganizationResponse.data?.data.metadata?.test).toBe(
			"organization-metadata",
		);

		const createTeamResponse = await client.organization.createTeam.$post(
			{ json: { name: "Development Team", organizationId } },
			{ headers },
		);

		teamId = createTeamResponse.data?.data.id as string;
		expect(createTeamResponse.data?.data.name).toBe("Development Team");
		expect(createTeamResponse.data?.data.organizationId).toBe(organizationId);

		const createSecondTeamResponse = await client.organization.createTeam.$post(
			{ json: { name: "Marketing Team", organizationId } },
			{ headers },
		);

		secondTeamId = createSecondTeamResponse.data?.data.id as string;
		expect(createSecondTeamResponse.data?.data.name).toBe("Marketing Team");
		expect(createSecondTeamResponse.data?.data.organizationId).toBe(
			organizationId,
		);
	});

	test("should invite member to team", async ({ expect }) => {
		expect(teamId).toBeDefined();

		const res = await client.organization.inviteMember.$post(
			{ json: { teamId, email: invitedUser.email, role: "member" } },
			{ headers },
		);

		expect(res.data?.data.invitation).toMatchObject({
			email: invitedUser.email,
			role: "member",
			teamId,
		});

		const invitation = await client.organization.acceptInvitation.$post(
			{ json: { invitationId: res.data?.data.invitation.id as string } },
			{ headers: signUpHeaders },
		);

		expect(invitation.data?.data.member).toMatchObject({
			role: "member",
			userId: invitedUser.id,
		});
	});

	test("should add team to the member's list of teams", async ({ expect }) => {
		const listUserTeamsRes = await client.organization.listUserTeams.$get({
			headers: signUpHeaders,
		});

		expect(listUserTeamsRes.error).toBeNull();
		expect(listUserTeamsRes.data).not.toBeNull();
		expect(listUserTeamsRes.data!.data).toHaveLength(1);
	});

	test("should be able to list team members in the current active team", async ({
		expect,
	}) => {
		const activeTeamHeaders = new Headers();
		await client.organization.setActiveTeam.$post(
			{ json: { teamId } },
			{
				headers: signUpHeaders,
				fetchOptions: { onSuccess: createCookieCapture(activeTeamHeaders)() },
			},
		);

		const res = await client.organization.listTeamMembers.$get(
			{ query: {} },
			{ headers: activeTeamHeaders },
		);

		expect(res.error).toBeNull();
		expect(res.data).not.toBeNull();
		expect(res.data!.data).toHaveLength(1);
	});

	test("should get full organization", async ({ expect }) => {
		const organization = await client.organization.getFullOrganization.$get(
			{ query: {} },
			{ headers },
		);

		const teams = organization.data?.data.teams;
		expect(teams).toBeDefined();
		expect(teams!.length).toBe(3);

		const teamNames = teams!.map((team) => team.name);
		expect(teamNames).toContain("Development Team");
		expect(teamNames).toContain("Marketing Team");
	});

	test("should get all teams", async ({ expect }) => {
		const teamsResponse = await client.organization.listTeams.$get(
			{ query: {} },
			{ headers },
		);

		expect(teamsResponse.data.data).toBeInstanceOf(Array);
		expect(teamsResponse.data.data).toHaveLength(3);
	});

	test("should update a team", async ({ expect }) => {
		const updateTeamResponse = await client.organization.updateTeam.$post(
			{ json: { teamId, data: { name: "Updated Development Team" } } },
			{ headers },
		);

		expect(updateTeamResponse.data?.data?.name).toBe(
			"Updated Development Team",
		);
		expect(updateTeamResponse.data?.data?.id).toBe(teamId);
	});

	test("should remove a team", async ({ expect }) => {
		const teamsBeforeRemoval = await client.organization.listTeams.$get(
			{ query: {} },
			{ headers },
		);
		expect(teamsBeforeRemoval.data.data).toHaveLength(3);

		const removeTeamResponse = await client.organization.removeTeam.$post(
			{ json: { teamId, organizationId } },
			{ headers },
		);

		expect(removeTeamResponse.data?.message).toBe("Team removed successfully.");

		const teamsAfterRemoval = await client.organization.listTeams.$get(
			{ query: {} },
			{ headers },
		);

		expect(teamsAfterRemoval.data?.data).toHaveLength(2);
	});

	test("should not be able to remove the last team when allowRemovingAllTeams is not enabled", async ({
		expect,
	}) => {
		try {
			await client.organization.removeTeam.$post(
				{ json: { teamId: secondTeamId, organizationId } },
				{ headers },
			);
			expect(true).toBe(false);
		} catch (error) {
			expect(error).toBeDefined();
		}
	});

	test("should not be allowed to invite a member to a team that's reached maximum members", async ({
		expect,
	}) => {
		const { $Infer, auth, signIn, createUser, customFetchImpl } =
			await getTestInstance({
				user: { modelName: "users" },
				plugins: [
					organization({
						teams: { enabled: true as const, maximumMembersPerTeam: 1 },
					}),
				],
				logger: { level: "error" },
			});
		const app = $Infer.app(auth.options);

		const { headers } = await signIn();
		const client = createAuthClient<typeof app>()({
			plugins: [organizationClient({ teams: { enabled: true } })],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const createOrganizationResponse = await client.organization.create.$post(
			{
				json: {
					name: "Test Organization",
					slug: "test-org",
					metadata: { test: "organization-metadata" },
				},
			},
			{ headers },
		);
		expect(createOrganizationResponse.data?.data.id).toBeDefined();

		const createTeamResponse = await client.organization.createTeam.$post(
			{
				json: {
					name: "Development Team",
					organizationId: createOrganizationResponse.data?.data.id,
				},
			},
			{ headers },
		);
		expect(createTeamResponse.data?.data.id).toBeDefined();

		const res = await client.organization.inviteMember.$post(
			{
				json: {
					teamId: createTeamResponse.data?.data.id,
					email: invitedUser.email,
					role: "member",
				},
			},
			{ headers },
		);
		expect(res.data).toBeDefined();
		// const newHeaders = new Headers();
		// const signUpRes = await client.signUp.email.$post(
		// 	{ json: invitedUser },
		// 	{ fetchOptions: { onSuccess: createCookieCapture(newHeaders)() } },
		// );

		// expect(signUpRes.data?.data.user).toBeDefined();
		const { headers: newHeaders, user } = await createUser(true, invitedUser);

		const acceptInvitationResponse =
			await client.organization.acceptInvitation.$post(
				{ json: { invitationId: res.data?.data.invitation.id as string } },
				{ headers: newHeaders },
			);
		expect(acceptInvitationResponse.data).toBeDefined();

		const res2 = await client.organization.inviteMember.$post(
			{
				json: {
					teamId: createTeamResponse.data?.data.id,
					email: "test2@test.com",
					role: "member",
				},
			},
			{ headers },
		);
		expect(res2.data).toBeNull();
		// expect(res2.error?.code).toEqual('TEAM_MEMBER_LIMIT_REACHED')
	});
});

describe("multi team support", async (test) => {
	const { $Infer, auth, signIn, createUser } = await getTestInstance(
		{
			plugins: [
				organization({
					async sendInvitationEmail() {},
					teams: { enabled: true as const, defaultTeam: { enabled: true } },
				}),
			],
			logger: { level: "error" },
		},
		{ testWith: "sqlite" },
	);
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);

	const { headers: adminHeaders } = await signIn();
	const { user: invitedUser, headers: invitedHeaders } = await createUser();

	let organizationId: string | null = null;

	let team1Id: string | null = null;
	let team2Id: string | null = null;
	let team3Id: string | null = null;

	let invitationId: string | null = null;

	test("should create an organization to test multi team support", async ({
		expect,
	}) => {
		const organization = await api.createOrganization(
			{
				json: {
					name: "Test Organization",
					slug: "test-org",
					metadata: { test: "organization-metadata" },
				},
			},
			{ headers: adminHeaders },
		);

		expect(organization.success).toBe(True);
		expect(organization?.data.id).toBeDefined();
		expect(organization?.data.name).toBe("Test Organization");

		organizationId = organization?.data.id as string;
	});

	test("should create 3 teams", async ({ expect }) => {
		expect(organizationId).toBeDefined();
		if (!organizationId) throw new Error("can not run test");

		const team1 = await api.createTeam(
			{ json: { name: "Team One", organizationId } },
			{ headers: adminHeaders },
		);

		expect(team1.success).toBe(True);
		expect(team1.data.id).toBeDefined();
		expect(team1.data.organizationId).toBe(organizationId);

		team1Id = team1.data.id;

		const team2 = await api.createTeam(
			{ json: { name: "Team Two", organizationId } },
			{ headers: adminHeaders },
		);

		expect(team2.success).toBe(True);
		expect(team2.data.id).toBeDefined();
		expect(team2.data.organizationId).toBe(organizationId);

		team2Id = team2.data.id;

		const team3 = await api.createTeam(
			{ json: { name: "Team Three", organizationId } },
			{ headers: adminHeaders },
		);

		expect(team3.success).toBe(True);
		expect(team3.data.id).toBeDefined();
		expect(team3.data.organizationId).toBe(organizationId);

		team3Id = team3.data.id;
	});

	test("should invite user to all 3 teams", async ({ expect }) => {
		expect(organizationId).toBeDefined();
		expect(team1Id).toBeDefined();
		expect(team2Id).toBeDefined();
		expect(team3Id).toBeDefined();

		if (!organizationId || !team1Id || !team2Id || !team3Id)
			throw new Error("can not run test");

		const invitation = await api.createInvitation(
			{
				json: {
					email: invitedUser.email,
					role: "member",
					organizationId,
					teamId: [team1Id, team2Id, team3Id],
				},
			},
			{ headers: adminHeaders },
		);

		expect(invitation.data.invitation.status).toBeTypeOf("string");
		expect(invitation.data.invitation.id).toBeDefined();
		expect(invitation.data.invitation.teamId).toBe(
			[team1Id, team2Id, team3Id].join(","),
		);

		invitationId = invitation.data.invitation.id;
	});

	test("should accept invite and join all 3 teams", async ({ expect }) => {
		expect(invitationId).toBeDefined();
		if (!invitationId) throw new Error("can not run test");

		const accept = await api.acceptInvitation(
			{ json: { invitationId } },
			{ headers: invitedHeaders },
		);

		expect(accept.success).toBe(True);
		expect(accept?.data.member).toBeDefined();
		expect(accept?.data.invitation).toBeDefined();
	});

	test("should have joined all 3 teams", async ({ expect }) => {
		expect(invitationId).toBeDefined();
		if (!invitationId) throw new Error("can not run test");

		const teams = await api.listUserTeams({
			headers: invitedHeaders,
		});

		expect(teams.data).toHaveLength(3);
	});

	let activeTeamCookie: string | null = null;

	test("should allow you to set one of the teams as active", async ({
		expect,
	}) => {
		expect(team1Id).toBeDefined();
		expect(organizationId).toBeDefined();

		if (!team1Id || !organizationId) throw new Error("can not run test");

		const team = await api.setActiveTeam(
			{ json: { teamId: team1Id } },
			{
				headers: invitedHeaders,
				returnHeaders: true,
			},
		);

		expect(team.response?.data.id).toBe(team1Id);
		expect(team.response?.data.organizationId).toBe(organizationId);

		activeTeamCookie = team.headers.getSetCookie()[0];
	});

	test("should allow you to list team members of the current active team", async ({
		expect,
	}) => {
		expect(activeTeamCookie).toBeDefined();

		if (!activeTeamCookie) throw new Error("can not run test");

		const members = await api.listTeamMembers(
			{ query: {} },
			{ headers: { cookie: activeTeamCookie } },
		);

		expect(members.data).toHaveLength(1);
		expect(members.data.at(0)?.teamId).toBe(team1Id);
	});

	test("should allow user to list team members of any team the user is in", async ({
		expect,
	}) => {
		expect(team2Id).toBeDefined();
		expect(team3Id).toBeDefined();
		if (!team2Id || !team3Id) throw new Error("can not run test");

		const team2Members = await api.listTeamMembers(
			{ query: { teamId: team2Id } },
			{ headers: invitedHeaders },
		);

		expect(team2Members.data).toHaveLength(1);
		expect(team2Members.data.at(0)?.teamId).toBe(team2Id);

		const team3Members = await api.listTeamMembers(
			{ query: { teamId: team3Id } },
			{ headers: invitedHeaders },
		);

		expect(team3Members.data).toHaveLength(1);
		expect(team3Members.data.at(0)?.teamId).toBe(team3Id);
	});

	let team4Id: string | null = null;
	test("should directly add a member to a team", async ({ expect }) => {
		expect(organizationId).toBeDefined();
		if (!organizationId) throw new Error("can not run test");

		const team = await api.createTeam(
			{ json: { name: "Team Four", organizationId } },
			{ headers: adminHeaders },
		);

		const teamMember = await api.addTeamMember(
			{ json: { userId: invitedUser.id, teamId: team.data.id } },
			{ headers: adminHeaders },
		);

		expect(teamMember.data.teamId).toBe(team.data.id);
		expect(teamMember.data.userId).toBe(invitedUser.id);

		const teams = await api.listUserTeams({
			headers: invitedHeaders,
		});

		expect(teams.data).toHaveLength(4);

		team4Id = team.data.id;
	});

	test("should remove a member from a team", async ({ expect }) => {
		expect(team4Id).toBeDefined();
		if (!team4Id) throw new Error("can not run test");

		await api.removeTeamMember(
			{ json: { userId: invitedUser.id, teamId: team4Id } },
			{ headers: adminHeaders },
		);

		const teams = await api.listUserTeams({
			headers: invitedHeaders,
		});

		expect(teams.data).toHaveLength(3);
	});
});
