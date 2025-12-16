import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import { False } from "@faire-auth/core/static";
import type {
	InferAdditionalFieldsFromPluginOptions,
	LiteralStringUnion,
} from "@faire-auth/core/types";
import { toSuccess } from "@faire-auth/core/utils";
import * as z from "zod";
import { createEndpoint } from "../../../api/factory/endpoint";
import { requestOnlySessionMiddleware } from "../../../api/routes/session";
import { toZodSchema } from "../../../db";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import { parseRoles } from "../organization";
import type { InferOrganizationRolesFromOption, Member } from "../schema";
import { memberSchema } from "../schema";
import {
	addMemberSchema,
	leaveOrganizationSchema,
	listMembersQuerySchema,
	memberListResponseSchema,
	removeMemberSchema,
	updateMemberRoleSchema,
} from "../schema/member";
import type { OrganizationOptions } from "../types";

export const addMember = <O extends OrganizationOptions>(option: O) => {
	const additionalFieldsSchema = toZodSchema<
		InferAdditionalFieldsFromPluginOptions<"member", O>,
		true
	>({
		fields: option?.schema?.member?.additionalFields ?? {},
		isClientSide: true,
	});

	return createEndpoint(
		createRoute({
			operationId: "addMember",
			method: "post",
			path: "/organization/add-member",
			SERVER_ONLY: true,
			description: "Add a user as a member to an organization",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(option)],
			request: req()
				.bdy(
					addMemberSchema.extend(
						additionalFieldsSchema.shape,
					) as unknown as z.ZodType<
						{
							userId: string;
							role:
								| InferOrganizationRolesFromOption<O>
								| InferOrganizationRolesFromOption<O>[];
							organizationId?: string;
						} & (O extends { teams: { enabled: true } }
							? { teamId?: string }
							: {}) &
							InferAdditionalFieldsFromPluginOptions<"member", O>,
						{
							userId: string;
							role:
								| InferOrganizationRolesFromOption<O>
								| InferOrganizationRolesFromOption<O>[];
							organizationId?: string;
						} & (O extends { teams: { enabled: true } }
							? { teamId?: string }
							: {}) &
							InferAdditionalFieldsFromPluginOptions<"member", O>
					>,
				)
				.bld(),
			responses: res(memberSchema.transform(toSuccess))
				.err(400, "User not found or already a member")
				.err(401, "Not allowed to perform action")
				.err(403, "Membership limit reached")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			let { organizationId, role, userId, teamId, ...additionalFields } =
				ctx.req.valid("json");
			const session =
				userId == null || organizationId == null
					? (ctx.get("session") ?? null)
					: null;
			userId ??= session?.user.id!;
			organizationId ??= session?.session.activeOrganizationId!;
			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			if (teamId && !option.teams?.enabled) {
				ctx.get("context").logger.error("Teams are not enabled");
				return ctx.render(
					{ success: False, message: "Teams are not enabled" },
					400,
				);
			}

			const adapter = getOrgAdapter<O>(ctx.get("context"), option as O);
			const user =
				session?.user ??
				(await ctx.get("context").internalAdapter.findUserById(userId));
			if (!user)
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.USER_NOT_FOUND },
					400,
				);

			const alreadyMember = await adapter.findMemberByEmail({
				email: user.email,
				organizationId,
			});
			if (alreadyMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					400,
				);

			if (teamId) {
				const team = await adapter.findTeamById({ teamId, organizationId });
				if (!team || team.organizationId !== organizationId) {
					return ctx.render(
						{
							success: False,
							message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
						},
						400,
					);
				}
			}

			const membershipLimit = ctx.get("orgOptions").membershipLimit ?? 100;
			const membersCount = await adapter.countMembers({
				organizationId,
			});

			if (membersCount >= membershipLimit)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
					},
					403,
				);

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			let memberData = {
				organizationId,
				userId: user.id,
				role: parseRoles(role),
				createdAt: new Date(),
				...(additionalFields ? additionalFields : {}),
			};

			// Run beforeAddMember hook
			if (option?.organizationHooks?.beforeAddMember) {
				const response = await option?.organizationHooks.beforeAddMember({
					member: {
						userId: user.id,
						organizationId,
						role: parseRoles(role),
						...additionalFields,
					},
					user,
					organization,
				});
				if (response && typeof response === "object" && "data" in response)
					memberData = {
						...memberData,
						...response.data,
					};
			}

			const createdMember = await adapter.createMember(memberData);

			if (teamId)
				await adapter.findOrCreateTeamMember({ userId: user.id, teamId });

			// Run afterAddMember hook
			if (option?.organizationHooks?.afterAddMember)
				await option?.organizationHooks.afterAddMember({
					member: createdMember,
					user,
					organization,
				});

			return ctx.render(createdMember, 200);
		},
	);
};

export const removeMember = <O extends OrganizationOptions>(option: O) =>
	createEndpoint(
		createRoute({
			operationId: "removeMember",
			method: "post",
			path: "/organization/remove-member",
			description: "Remove a member from an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(option)],
			request: req().bdy(removeMemberSchema).bld(),
			responses: res(memberSchema.transform(toSuccess))
				.err(400, "Member not found")
				.err(401, "Not allowed to perform action or limit reached")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			let { memberIdOrEmail, organizationId } = ctx.req.valid("json");
			organizationId ??= session.session.activeOrganizationId;
			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), option as O);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			let toBeRemovedMember = null;
			if (z.email().safeParse(memberIdOrEmail).success)
				toBeRemovedMember = await adapter.findMemberByEmail({
					email: memberIdOrEmail,
					organizationId: organizationId,
				});
			else toBeRemovedMember = await adapter.findMemberById(memberIdOrEmail);

			if (!toBeRemovedMember)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			const roles = toBeRemovedMember.role.split(",");
			const creatorRole = ctx.get("orgOptions").creatorRole || "owner";
			const isOwner = roles.includes(creatorRole);

			if (isOwner) {
				if (member.role !== creatorRole)
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
						},
						400,
					);

				const { members } = await adapter.listMembers({
					organizationId: organizationId,
				});
				const owners = members.filter((m) =>
					m.role.split(",").includes(creatorRole),
				);
				if (owners.length <= 1)
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
						},
						400,
					);
			}

			const canDeleteMember = await hasPermission(
				{
					role: member.role,
					options: ctx.get("orgOptions"),
					permissions: {
						member: ["delete"],
					},
					organizationId,
				},
				ctx,
			);

			if (!canDeleteMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER,
					},
					401,
				);

			if (toBeRemovedMember?.organizationId !== organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization)
				return ctx.render(
					{
						status: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const userBeingRemoved = await ctx
				.get("context")
				.internalAdapter.findUserById(toBeRemovedMember.userId);
			if (!userBeingRemoved)
				return ctx.render(
					{
						status: False,
						message: "User not found",
					},
					400,
				);

			// Run beforeRemoveMember hook
			if (option?.organizationHooks?.beforeRemoveMember) {
				await option?.organizationHooks.beforeRemoveMember({
					member: toBeRemovedMember,
					user: userBeingRemoved,
					organization,
				});
			}

			await adapter.deleteMember(toBeRemovedMember.id);

			if (
				session.user.id === toBeRemovedMember.userId &&
				session.session.activeOrganizationId ===
					toBeRemovedMember.organizationId
			)
				await adapter.setActiveOrganization(session.session.token, null);

			// Run afterRemoveMember hook
			if (option?.organizationHooks?.afterRemoveMember) {
				await option?.organizationHooks.afterRemoveMember({
					member: toBeRemovedMember,
					user: userBeingRemoved,
					organization,
				});
			}

			return ctx.render(toBeRemovedMember, 200);
		},
	);

export const updateMemberRole = <O extends OrganizationOptions>(option: O) =>
	createEndpoint(
		createRoute({
			operationId: "updateMemberRole",
			method: "post",
			path: "/organization/update-member-role",
			description: "Update the role of a member in an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(option)],
			request: req()
				.bdy(
					updateMemberRoleSchema as unknown as z.ZodType<
						{
							role:
								| LiteralStringUnion<InferOrganizationRolesFromOption<O>>
								| LiteralStringUnion<InferOrganizationRolesFromOption<O>>[];
							// | LiteralString
							// | LiteralString[];
							memberId: string;
							/**
							 * If not provided, the active organization will be used
							 */
							organizationId?: string;
						},
						{
							role:
								| LiteralStringUnion<InferOrganizationRolesFromOption<O>>
								| LiteralStringUnion<InferOrganizationRolesFromOption<O>>[];
							// | LiteralString
							// | LiteralString[];
							memberId: string;
							/**
							 * If not provided, the active organization will be used
							 */
							organizationId?: string;
						}
					>,
				)
				.bld(),

			responses: res(memberSchema.transform(toSuccess))
				.err(400, "Member not found")
				.err(401, "Member limit reached")
				.err(403, "Not allowed to perform this action")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const {
				role,
				memberId,
				organizationId: requestOrganizationId,
			} = ctx.req.valid("json");
			const organizationId =
				requestOrganizationId ?? session.session.activeOrganizationId;

			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), option as O);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});

			if (!member)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			const toBeUpdatedMember =
				member.id !== memberId
					? await adapter.findMemberById(memberId)
					: member;

			if (!toBeUpdatedMember)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			if (toBeUpdatedMember.organizationId !== organizationId)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
					},
					403,
				);

			const creatorRole = ctx.get("orgOptions").creatorRole ?? "owner";
			const updatingMemberRoles = member.role.split(",");
			const toBeUpdatedMemberRoles = toBeUpdatedMember.role.split(",");
			const roleToSet = Array.isArray(role) ? role : [role];

			const isUpdatingCreator = toBeUpdatedMemberRoles.includes(creatorRole);
			const updaterIsCreator = updatingMemberRoles.includes(creatorRole);
			const isSettingCreatorRole = roleToSet.includes(creatorRole);
			const memberIsUpdatingThemselves = member.id === toBeUpdatedMember.id;

			if (
				(isUpdatingCreator && !updaterIsCreator) ||
				(isSettingCreatorRole && !updaterIsCreator)
			)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
					},
					403,
				);

			if (updaterIsCreator && memberIsUpdatingThemselves) {
				const members = await ctx.get("context").adapter.findMany<Member>({
					model: "member",
					where: [
						{
							field: "organizationId",
							value: organizationId,
						},
					],
				});
				const owners = members.filter((member: Member) => {
					const roles = member.role.split(",");
					return roles.includes(creatorRole);
				});
				if (owners.length <= 1 && !isSettingCreatorRole)
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER,
						},
						400,
					);
			}

			const canUpdateMember = await hasPermission(
				{
					role: member.role,
					options: ctx.get("orgOptions"),
					permissions: {
						member: ["update"],
					},
					allowCreatorAllPermissions: true,
					organizationId,
				},
				ctx,
			);

			if (!canUpdateMember)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER,
					},
					403,
				);

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const userBeingUpdated = await ctx
				.get("context")
				.internalAdapter.findUserById(toBeUpdatedMember.userId);
			if (!userBeingUpdated)
				return ctx.render({ success: False, message: "User not found" }, 400);

			const previousRole = toBeUpdatedMember.role;
			const newRole = parseRoles(role);

			// Run beforeUpdateMemberRole hook
			if (option?.organizationHooks?.beforeUpdateMemberRole) {
				const response = await option?.organizationHooks.beforeUpdateMemberRole(
					{
						member: toBeUpdatedMember,
						newRole,
						user: userBeingUpdated,
						organization,
					},
				);
				if (response && typeof response === "object" && "data" in response) {
					// Allow the hook to modify the role
					const updatedMember = await adapter.updateMember(
						memberId,
						response.data.role ?? newRole,
					);
					if (!updatedMember)
						return ctx.render(
							{
								success: False,
								message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
							},
							400,
						);

					// Run afterUpdateMemberRole hook
					if (option?.organizationHooks?.afterUpdateMemberRole)
						await option?.organizationHooks.afterUpdateMemberRole({
							member: updatedMember,
							previousRole,
							user: userBeingUpdated,
							organization,
						});

					return ctx.render(updatedMember, 200);
				}
			}

			const updatedMember = await adapter.updateMember(memberId, newRole);
			if (!updatedMember)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			// Run afterUpdateMemberRole hook
			if (option?.organizationHooks?.afterUpdateMemberRole)
				await option?.organizationHooks.afterUpdateMemberRole({
					member: updatedMember,
					previousRole,
					user: userBeingUpdated,
					organization,
				});

			return ctx.render(updatedMember, 200);
		},
	);

export const getActiveMember = <O extends OrganizationOptions>(option: O) =>
	createEndpoint(
		createRoute({
			operationId: "getActiveMember",
			method: "get",
			path: "/organization/get-active-member",
			description: "Get the member details of the active organization",
			middleware: [orgSessionMiddleware, orgMiddleware(option)],
			responses: res(memberSchema.transform(toSuccess))
				.err(400, "No active organization")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const organizationId = session.session.activeOrganizationId;

			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context")!, option as O);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});

			if (!member)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			return ctx.render(member, 200);
		},
	);

export const leaveOrganization = <O extends OrganizationOptions>(option: O) =>
	createEndpoint(
		createRoute({
			operationId: "leaveOrganization",
			method: "post",
			path: "/organization/leave",
			description: "Leave an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(option)],
			request: req().bdy(leaveOrganizationSchema).bld(),
			responses: res(memberSchema.transform(toSuccess))
				.err(400, "Cannot leave as the only owner")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const { organizationId } = ctx.req.valid("json");

			const adapter = getOrgAdapter<O>(ctx.get("context"), option as O);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId,
			});

			if (!member)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);

			const creatorRole = ctx.get("orgOptions").creatorRole ?? "owner";
			const isOwnerLeaving = member.role === creatorRole;

			if (isOwnerLeaving) {
				const members = await ctx.get("context").adapter.findMany<Member>({
					model: "member",
					where: [{ field: "organizationId", value: organizationId }],
					limit: option?.membershipLimit ?? 100,
				});
				const owners = members.filter((m) => {
					const memberRoles = m.role.split(",");
					return memberRoles.includes(creatorRole);
				});

				if (owners.length <= 1)
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER,
						},
						400,
					);
			}

			await adapter.deleteMember(member.id);
			if (session.session.activeOrganizationId === organizationId)
				await adapter.setActiveOrganization(session.session.token, null);

			return ctx.render(member, 200);
		},
	);

export const listMembers = <O extends OrganizationOptions>(option: O) =>
	createEndpoint(
		createRoute({
			operationId: "listMembers",
			method: "get",
			path: "/organization/list-members",
			description: "List all members of an organization",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(option)],
			request: req().qry(listMembersQuerySchema).bld(),
			responses: res(memberListResponseSchema.transform(toSuccess))
				.err(400, "No active organization")
				.err(403, "Not allowed to perform action or limit reached")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			let {
				limit,
				offset,
				sortBy,
				sortDirection,
				filterField,
				filterValue,
				filterOperator,
				organizationId,
			} = ctx.req.valid("query");

			organizationId ??= session?.session.activeOrganizationId!;
			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), option as O);

			const isMember = session
				? await adapter.findMemberByOrgId({
						userId: session.user.id,
						organizationId: organizationId,
					})
				: null;
			if (!isMember && !ctx.get("isServer"))
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					403,
				);

			const { members, total } = await adapter.listMembers({
				organizationId,
				...(limit && { limit: Number(limit) }),
				...(offset && { offset: Number(offset) }),
				...(sortBy && { sortBy }),
				...(sortDirection && { sortOrder: sortDirection }),
				...(filterField && filterValue !== undefined
					? {
							filter: {
								field: filterField,
								operator: filterOperator ?? "eq",
								value: filterValue,
							},
						}
					: {}),
			});

			return ctx.render({ members, total }, 200);
		},
	);

export const getActiveMemberRole = <O extends OrganizationOptions>(option: O) =>
	createEndpoint(
		createRoute({
			operationId: "getActiveMemberRole",
			method: "get",
			path: "/organization/get-active-member-role",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(option)],
			request: req()
				.qry(
					z.object({
						userId: z
							.string()
							.openapi({
								description:
									"The user ID to get the role for. If not provided, will default to the current user's",
							})
							.optional(),
						organizationId: z
							.string()
							.openapi({
								description:
									'The organization ID to list members for. If not provided, will default to the user\'s active organization. Eg: "organization-id"',
							})
							.optional(),
					}),
				)
				.bld(),
			responses: res(z.string().transform(toSuccess))
				.err(400, "No active organization")
				.err(403, "Not member of organization")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			let { userId, organizationId } = ctx.req.valid("query");
			const session =
				userId == null || organizationId == null
					? (ctx.get("session") ?? null)
					: null;
			userId ??= session?.user.id;
			organizationId ??= session?.session.activeOrganizationId!;
			if (!organizationId || !userId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), option);

			const member = await adapter.findMemberByOrgId({
				userId,
				organizationId,
			});
			if (!member)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					403,
				);

			return ctx.render(member.role, 200);
		},
	);
