import { createRoute, req, res } from "@faire-auth/core/factory";
import { Definitions, False, SCHEMAS, True } from "@faire-auth/core/static";
import type { InferAdditionalFieldsFromPluginOptions } from "@faire-auth/core/types";
import { toSuccess } from "@faire-auth/core/utils";
import * as z from "zod";
import { createEndpoint } from "../../../api/factory/endpoint";
import { requestOnlySessionMiddleware } from "../../../api/routes/session";
import { toZodSchema } from "../../../db";
import { setSessionCookie } from "../../../utils/cookies";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import type { InferTeam } from "../schema";
import { teamSchema } from "../schema";
import {
	addTeamMemberSchema,
	createTeamBaseSchema,
	listTeamMembersQuerySchema,
	listTeamsQuerySchema,
	removeTeamMemberSchema,
	removeTeamSchema,
	setActiveTeamSchema,
	teamListResponseSchema,
	teamMemberListResponseSchema,
	teamMemberResponseSchema,
	updateTeamSchema,
} from "../schema/team";
import type { OrganizationOptions } from "../types";

export const createTeam = <O extends OrganizationOptions>(options: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.team?.additionalFields ?? {},
		isClientSide: true,
	});

	const baseSchema = createTeamBaseSchema;

	type Body = InferAdditionalFieldsFromPluginOptions<"team", O> &
		z.infer<typeof baseSchema>;

	return createEndpoint(
		createRoute({
			operationId: "createTeam",
			method: "post",
			path: "/organization/create-team",
			description: "Create a new team within an organization",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(options)],
			request: req()
				.bdy(
					baseSchema.extend(
						additionalFieldsSchema.shape,
					) as unknown as z.ZodType<Body, Body>,
				)
				.bld(),
			responses: res(
				teamSchema.transform(toSuccess),
				"Team created successfully",
			)
				.err(400)
				.err(401)
				.err(403)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session") ?? null;
			const {
				name,
				organizationId = session?.session.activeOrganizationId as
					| string
					| undefined,
				...additionalFields
			} = ctx.req.valid("json");

			if (!organizationId) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);
			}

			const adapter = getOrgAdapter<O>(ctx.get("context"), options as O);

			if (session) {
				const member = await adapter.findMemberByOrgId({
					userId: session.user.id,
					organizationId,
				});

				if (!member)
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION,
						},
						403,
					);

				const canCreate = hasPermission(
					{
						role: member.role,
						options: ctx.get("orgOptions"),
						permissions: { team: ["create"] },
						organizationId,
					},
					ctx,
				);

				if (!canCreate)
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_TEAMS_IN_THIS_ORGANIZATION,
						},
						403,
					);
			}

			const existingTeams = await adapter.listTeams(organizationId);
			const maximumTeams = ctx.get("orgOptions").teams?.maximumTeams;
			const maximum =
				typeof maximumTeams === "function"
					? await maximumTeams({ organizationId, session }, ctx.req)
					: maximumTeams;

			const maxTeamsReached = maximum ? existingTeams.length >= maximum : false;
			if (maxTeamsReached)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_TEAMS,
					},
					400,
				);

			const createdTeam = await adapter.createTeam({
				name,
				organizationId,
				createdAt: new Date(),
				updatedAt: new Date(),
				...additionalFields,
			});

			return ctx.render(createdTeam, 200);
		},
	);
};

export const removeTeam = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "removeTeam",
			method: "post",
			path: "/organization/remove-team",
			description: "Remove a team from an organization",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(options)],
			request: req().bdy(removeTeamSchema).bld(),
			responses: res(
				SCHEMAS[Definitions.SUCCESS].default,
				"Team removed successfully",
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof removeTeamSchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const {
				teamId,
				organizationId = session?.session.activeOrganizationId as
					| string
					| undefined,
			} = ctx.req.valid("json");

			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			if (session) {
				const member = await adapter.findMemberByOrgId({
					userId: session.user.id,
					organizationId,
				});

				if (!member || session.session?.activeTeamId === teamId) {
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_TEAM,
						},
						403,
					);
				}

				const canRemove = hasPermission(
					{
						role: member.role,
						options: ctx.get("orgOptions"),
						permissions: { team: ["delete"] },
						organizationId,
					},
					ctx,
				);

				if (!canRemove)
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_TEAMS_IN_THIS_ORGANIZATION,
						},
						403,
					);
			}

			const team = await adapter.findTeamById({
				teamId,
				organizationId,
			});
			if (!team || team.organizationId !== organizationId)
				return ctx.render(
					{ success: False, message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND },
					400,
				);

			if (!ctx.get("orgOptions").teams?.allowRemovingAllTeams) {
				const teams = await adapter.listTeams(organizationId);
				if (teams.length <= 1) {
					return ctx.render(
						{
							success: False,
							message: ORGANIZATION_ERROR_CODES.UNABLE_TO_REMOVE_LAST_TEAM,
						},
						400,
					);
				}
			}

			await adapter.deleteTeam(team.id);
			return ctx.render(
				{ success: True, message: "Team removed successfully." },
				200,
			);
		},
	);

export const updateTeam = <O extends OrganizationOptions>(options: O) => {
	const additionalFieldsSchema = toZodSchema<
		InferAdditionalFieldsFromPluginOptions<"team", O>,
		true
	>({
		fields: options?.schema?.team?.additionalFields ?? {},
		isClientSide: true,
	});

	type Body = {
		teamId: string;
		data: Partial<
			Omit<z.infer<typeof teamSchema>, "id" | "createdAt" | "updatedAt"> &
				InferAdditionalFieldsFromPluginOptions<"team", O>
		>;
	};

	return createEndpoint(
		createRoute({
			operationId: "updateTeam",
			method: "post",
			path: "/organization/update-team",
			description: "Update an existing team in an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req()
				.bdy(
					updateTeamSchema.extend({
						data: updateTeamSchema.shape.data
							.extend(additionalFieldsSchema.shape)
							.partial(),
					}) as unknown as z.ZodType<Body, Body>,
				)
				.bld(),
			responses: res(
				teamSchema.transform(toSuccess) as unknown as z.ZodType<{
					success: true;
					data:
						| ({
								id: string;
								name: string;
								organizationId: string;
								createdAt: Date;
								updatedAt?: Date | undefined;
						  } & InferAdditionalFieldsFromPluginOptions<"team", O, true>)
						| null;
				}>,
				"Team updated successfully",
			)
				.err(400)
				.err(401)
				.err(403)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const {
				teamId,
				data: {
					name,
					organizationId = session.session.activeOrganizationId,
					...additionalFields
				},
			} = ctx.req.valid("json");

			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), options);

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId,
			});

			if (!member)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM,
					},
					403,
				);

			const canUpdate = hasPermission(
				{
					role: member.role,
					options: ctx.get("orgOptions"),
					permissions: { team: ["update"] },
					organizationId,
				},
				ctx,
			);

			if (!canUpdate)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM,
					},
					403,
				);

			const team = await adapter.findTeamById({
				teamId,
				organizationId,
			});
			if (!team || team.organizationId !== organizationId)
				return ctx.render(
					{ success: False, message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND },
					400,
				);

			const updatedTeam = await adapter.updateTeam(team.id, {
				name,
				...additionalFields,
			});

			return ctx.render(updatedTeam, 200);
		},
	);
};

export const listOrganizationTeams = <O extends OrganizationOptions>(
	options: O,
) =>
	createEndpoint(
		createRoute({
			operationId: "listOrganizationTeams",
			method: "get",
			path: "/organization/list-teams",
			description: "List all teams in an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().qry(listTeamsQuerySchema).bld(),
			responses: res(
				teamListResponseSchema.transform(toSuccess),
				"Teams retrieved successfully",
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof listTeamsQuerySchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const { organizationId } = ctx.req.valid("query");

			const orgId = organizationId ?? session.session.activeOrganizationId;
			if (!orgId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), options);

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: orgId,
			});

			if (!member) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION,
					},
					403,
				);
			}

			const teams = await adapter.listTeams(orgId);
			return ctx.render(teams, 200);
		},
	);

export const setActiveTeam = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "setActiveTeam",
			method: "post",
			path: "/organization/set-active-team",
			description: "Set the active team",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(setActiveTeamSchema).bld(),
			responses: res(
				teamSchema.nullable().transform(toSuccess) as unknown as z.ZodType<{
					success: true;
					data: InferTeam<OrganizationOptions> | null;
				}>,
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof setActiveTeamSchema>()
				.bld(),
		}),
		(authOptions) => async (ctx) => {
			const adapter = getOrgAdapter(ctx.get("context"), ctx.get("orgOptions"));
			const session = ctx.get("session");
			let { teamId } = ctx.req.valid("json");

			if (teamId === null) {
				const sessionTeamId = session.session.activeTeamId;
				if (!sessionTeamId) return ctx.render(null, 200);

				const updatedSession = await adapter.setActiveTeam(
					session.session.token,
					null,
				);

				await setSessionCookie(ctx, authOptions, {
					session: updatedSession,
					user: session.user,
				});

				return ctx.render(null, 200);
			}

			if (teamId === undefined) {
				const sessionTeamId = session.session.activeTeamId;
				// this would classify as a bad request
				// if (!sessionTeamId) return ctx.render(null, 200)
				if (!sessionTeamId)
					return ctx.render(
						{
							success: False,
							message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
						},
						400,
					);
				teamId = sessionTeamId;
			} else teamId = teamId;

			const team = await adapter.findTeamById({ teamId });
			if (!team)
				return ctx.render(
					{ success: False, message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND },
					400,
				);

			const member = await adapter.findTeamMember({
				teamId,
				userId: session.user.id,
			});

			if (!member)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_TEAM,
					},
					403,
				);

			const updatedSession = await adapter.setActiveTeam(
				session.session.token,
				team.id,
			);

			await setSessionCookie(ctx, authOptions, {
				session: updatedSession,
				user: session.user,
			});

			return ctx.render(team, 200);
		},
	);

export const listUserTeams = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "listUserTeams",
			method: "get",
			path: "/organization/list-user-teams",
			description: "List all teams that the current user is a part of",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bld(),
			responses: res(
				teamListResponseSchema.transform(toSuccess),
				"Teams retrieved successfully",
			)
				.err(401)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const adapter = getOrgAdapter(ctx.get("context"), ctx.get("orgOptions"));
			const teams = await adapter.listTeamsByUser({ userId: session.user.id });
			return ctx.render(teams, 200);
		},
	);

export const listTeamMembers = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "listTeamMembers",
			method: "get",
			path: "/organization/list-team-members",
			description: "List the members of the given team",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().qry(listTeamMembersQuerySchema).bld(),
			responses: res(
				teamMemberListResponseSchema.transform(toSuccess),
				"Teams retrieved successfully",
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof listTeamMembersQuerySchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const adapter = getOrgAdapter(ctx.get("context"), ctx.get("orgOptions"));
			let { teamId } = ctx.req.valid("query");

			teamId ??= session.session.activeTeamId;
			if (!teamId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM,
					},
					400,
				);

			const member = await adapter.findTeamMember({
				userId: session.user.id,
				teamId,
			});

			if (!member)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_TEAM,
					},
					403,
				);

			const members = await adapter.listTeamMembers({ teamId });
			return ctx.render(members, 200);
		},
	);

export const addTeamMember = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "addTeamMember",
			method: "post",
			path: "/organization/add-team-member",
			description: "Add a user as a member of a team",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(addTeamMemberSchema).bld(),
			responses: res(
				teamMemberResponseSchema.transform(toSuccess),
				"Team member created successfully",
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof addTeamMemberSchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const adapter = getOrgAdapter(ctx.get("context"), ctx.get("orgOptions"));
			const { teamId, userId } = ctx.req.valid("json");

			if (!session.session.activeOrganizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const currentMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: session.session.activeOrganizationId,
			});

			if (!currentMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					400,
				);

			const canUpdateMember = hasPermission(
				{
					role: currentMember.role,
					options: ctx.get("orgOptions"),
					permissions: { member: ["update"] },
					organizationId: session.session.activeOrganizationId,
				},
				ctx,
			);

			if (!canUpdateMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER,
					},
					403,
				);

			const toBeAddedMember = await adapter.findMemberByOrgId({
				userId,
				organizationId: session.session.activeOrganizationId,
			});

			if (!toBeAddedMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					400,
				);

			const teamMember = await adapter.findOrCreateTeamMember({
				teamId,
				userId,
			});

			return ctx.render(teamMember, 200);
		},
	);

export const removeTeamMember = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "removeTeamMember",
			method: "post",
			path: "/organization/remove-team-member",
			description: "Remove a member from a team",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(removeTeamMemberSchema).bld(),
			responses: res(
				SCHEMAS[Definitions.SUCCESS].default,
				"Team member removed successfully",
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof removeTeamMemberSchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const adapter = getOrgAdapter(ctx.get("context"), ctx.get("orgOptions"));
			const { teamId, userId } = ctx.req.valid("json");

			if (!session.session.activeOrganizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const currentMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: session.session.activeOrganizationId,
			});

			if (!currentMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					400,
				);

			const canDeleteMember = hasPermission(
				{
					role: currentMember.role,
					options: ctx.get("orgOptions"),
					permissions: { member: ["delete"] },
					organizationId: session.session.activeOrganizationId,
				},
				ctx,
			);

			if (!canDeleteMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REMOVE_A_TEAM_MEMBER,
					},
					403,
				);

			const toBeAddedMember = await adapter.findMemberByOrgId({
				userId,
				organizationId: session.session.activeOrganizationId,
			});

			if (!toBeAddedMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					400,
				);

			await adapter.removeTeamMember({ teamId, userId });

			return ctx.render(
				{ success: True, message: "Team member removed successfully." },
				200,
			);
		},
	);
