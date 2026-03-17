import { createRoute, req, res } from "@faire-auth/core/factory";
import { False } from "@faire-auth/core/static";
import type { InferAdditionalFieldsConfig, InferAdditionalFieldsFromPluginOptions } from "@faire-auth/core/types";
import { getDate, toSuccess } from "@faire-auth/core/utils";
import type { z } from "zod";
import { createEndpoint } from "../../../api/factory/endpoint";
import { requestOnlySessionMiddleware } from "../../../api/routes/session";
import { toZodSchema } from "../../../db";
import { setSessionCookie } from "../../../utils/cookies";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import { parseRoles } from "../organization";
import type { InferOrganizationRolesFromOption } from "../schema";
import { invitationSchema } from "../schema";
import {
	createInvitationSchema,
	getInvitationQuerySchema,
	getInvitationResponseSchema,
	invitationRequestSchema,
	invitationResponseSchema,
	listInvitationsQuerySchema,
	listInvitationsResponseSchema,
	listUserInvitationsQuerySchema,
} from "../schema/invitation";
import type { OrganizationOptions } from "../types";

export const createInvitation = <O extends OrganizationOptions>(option: O) => {
	const additionalFieldsSchema = toZodSchema<
		InferAdditionalFieldsConfig<"invitation", O, false>,
		true
	>({
		fields: (option?.schema?.invitation?.additionalFields ?? {}) as InferAdditionalFieldsConfig<"invitation", O, false>,
		isClientSide: true,
	});

	return createEndpoint(
		createRoute({
			operationId: "createInvitation",
			method: "post",
			path: "/organization/invite-member",
			description: "Invite a user to an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(option)],
			request: req()
				.bdy(
					createInvitationSchema.extend(
						additionalFieldsSchema.shape,
					) as unknown as z.ZodType<
						{
							/**
							 * The email address of the user
							 * to invite
							 */
							email: string;
							/**
							 * The role to assign to the user
							 */
							role:
								| InferOrganizationRolesFromOption<O>
								| InferOrganizationRolesFromOption<O>[];
							/**
							 * The organization ID to invite
							 * the user to
							 */
							organizationId?: string;
							/**
							 * Resend the invitation email, if
							 * the user is already invited
							 */
							resend?: boolean;
						} & (O extends { teams: { enabled: true } }
							? {
									/**
									 * The team the user is
									 * being invited to.
									 */
									teamId?: string | string[];
								}
							: {}) &
							InferAdditionalFieldsFromPluginOptions<"invitation", O, false>,
						{
							/**
							 * The email address of the user
							 * to invite
							 */
							email: string;
							/**
							 * The role to assign to the user
							 */
							role:
								| InferOrganizationRolesFromOption<O>
								| InferOrganizationRolesFromOption<O>[];
							/**
							 * The organization ID to invite
							 * the user to
							 */
							organizationId?: string;
							/**
							 * Resend the invitation email, if
							 * the user is already invited
							 */
							resend?: boolean;
						} & (O extends { teams: { enabled: true } }
							? {
									/**
									 * The team the user is
									 * being invited to.
									 */
									teamId?: string | string[];
								}
							: {}) &
							InferAdditionalFieldsFromPluginOptions<"invitation", O, false>
					>,
				)
				.bld(),
			responses: res(invitationResponseSchema.transform(toSuccess))
				.err(400, "Not found or already invited")
				.err(401, "Not allowed to perform action")
				.err(
					403,
					"Not allowed to perform action or invitation or member limit reached",
				)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const {
				organizationId: requestOrganizationId,
				role,
				email,
				resend,
				teamId,
				...additionalFields
			} = ctx.req.valid("json") as any;
			const organizationId =
				requestOrganizationId ?? session.session.activeOrganizationId;
			if (!organizationId) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);
			}
			const adapter = getOrgAdapter<O>(ctx.get("context"), option as O);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);
			}
			const canInvite = await hasPermission(
				{
					role: member.role,
					options: ctx.get("orgOptions"),
					permissions: { invitation: ["create"] },
					organizationId,
				},
				ctx,
			);
			if (!canInvite)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION,
					},
					403,
				);

			const creatorRole = ctx.get("orgOptions").creatorRole || "owner";

			const roles = parseRoles(role as string | string[]);

			if (
				member.role !== creatorRole &&
				roles.split(",").includes(creatorRole)
			) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
					},
					403,
				);
			}

			const alreadyMember = await adapter.findMemberByEmail({
				email,
				organizationId,
			});
			if (alreadyMember) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					400,
				);
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email,
				organizationId,
			});
			if (alreadyInvited.length && !resend) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
					},
					400,
				);
			}

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			// If resend is true and there's an existing invitation, reuse it
			if (alreadyInvited.length && resend) {
				const existingInvitation = alreadyInvited[0];

				// Update the invitation's expiration date using the same logic as createInvitation
				const defaultExpiration = 60 * 60 * 48; // 48 hours in seconds
				const newExpiresAt = getDate(
					ctx.get("orgOptions").invitationExpiresIn ?? defaultExpiration,
					"sec",
				);

				await ctx.get("context").adapter.update({
					model: "invitation",
					where: [
						{
							field: "id",
							value: existingInvitation!.id,
						},
					],
					update: {
						expiresAt: newExpiresAt,
					},
				});

				const updatedInvitation = {
					...existingInvitation,
					expiresAt: newExpiresAt,
				};

				await ctx.get("orgOptions").sendInvitationEmail?.(
					{
						id: updatedInvitation.id!,
						role: updatedInvitation.role as string,
						email: updatedInvitation.email!.toLowerCase(),
						organization: organization,
						inviter: {
							...member,
							user: session.user,
						},
						invitation: updatedInvitation as any,
					},
					ctx.req,
				);

				return ctx.render({ invitation: updatedInvitation }, 200);
			}

			if (
				alreadyInvited.length > 0 &&
				ctx.get("orgOptions").cancelPendingInvitationsOnReInvite
			) {
				await adapter.updateInvitation({
					invitationId: alreadyInvited[0]!.id,
					status: "canceled",
				});
			}

			const optionInvitationLimit = ctx.get("orgOptions").invitationLimit;
			const invitationLimit =
				typeof optionInvitationLimit === "function"
					? await optionInvitationLimit(
							{ user: session.user, organization, member: member },
							ctx.get("context"),
						)
					: (optionInvitationLimit ?? 100);

			const pendingInvitations = await adapter.findPendingInvitations({
				organizationId: organizationId,
			});

			if (pendingInvitations.length >= invitationLimit) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
					},
					403,
				);
			}

			const orgOptions = ctx.get("orgOptions");
			if (
				orgOptions.teams &&
				orgOptions.teams!.enabled &&
				orgOptions.teams!.maximumMembersPerTeam !== undefined &&
				teamId
			) {
				const teamIds = typeof teamId === "string" ? [teamId] : teamId;

				for (const teamId of teamIds) {
					const team = await adapter.findTeamById({
						teamId,
						organizationId: organizationId,
						includeTeamMembers: true,
					});

					if (!team)
						return ctx.render(
							{
								success: False,
								message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
							},
							400,
						);

					const teamsEnabled = !!orgOptions.teams?.enabled;
					if (teamsEnabled) {
						const maximumMembersPerTeam =
							typeof orgOptions.teams!.maximumMembersPerTeam === "function"
								? await orgOptions.teams!.maximumMembersPerTeam({
										teamId,
										session: session,
										organizationId: organizationId,
									})
								: (orgOptions.teams!.maximumMembersPerTeam ?? Infinity);
						if (team.members.length >= maximumMembersPerTeam) {
							return ctx.render(
								{
									success: False,
									message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
								},
								403,
							);
						}
					}
				}
			}

			const teamIds: string[] =
				typeof teamId === "string" ? [teamId] : (teamId ?? []);

			let invitationData = {
				role: roles,
				email,
				organizationId: organizationId,
				teamIds,
				...(additionalFields ? additionalFields : {}),
			};

			// Run beforeCreateInvitation hook
			if (option?.organizationHooks?.beforeCreateInvitation) {
				const response = await option?.organizationHooks.beforeCreateInvitation(
					{
						invitation: {
							...invitationData,
							inviterId: session.user.id,
							...(teamIds.length > 0 && { teamId: teamIds[0] }),
						},
						inviter: session.user,
						organization,
					},
				);
				if (response && typeof response === "object" && "data" in response) {
					invitationData = {
						...invitationData,
						...response.data,
					};
				}
			}

			const invitation = await adapter.createInvitation({
				invitation: invitationData,
				user: session.user,
			});

			await ctx.get("orgOptions").sendInvitationEmail?.(
				{
					id: invitation.id,
					role: invitation.role as string,
					email: invitation.email.toLowerCase(),
					organization,
					inviter: { ...member, user: session.user },
					invitation,
				},
				ctx.req,
			);

			// Run afterCreateInvitation hook
			if (option?.organizationHooks?.afterCreateInvitation) {
				await option?.organizationHooks.afterCreateInvitation({
					invitation,
					inviter: session.user,
					organization,
				});
			}

			return ctx.render({ invitation }, 200);
		},
	);
};

export const acceptInvitation = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "acceptInvitation",
			method: "post",
			path: "/organization/accept-invitation",
			description: "Accept an invitation to an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(invitationRequestSchema).bld(),
			responses: res(invitationResponseSchema.transform(toSuccess))
				.err(400, "Not found or already invited")
				.err(401, "Not allowed to perform action or limit reached")
				.err(403, "Not recipient of invitation")
				.bld(),
		}),
		(authOptions) => async (ctx) => {
			const { invitationId } = ctx.req.valid("json");
			const session = ctx.get("session");
			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const invitation = await adapter.findInvitationById(invitationId);

			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
					},
					400,
				);
			}

			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
					},
					403,
				);
			}

			if (
				ctx.get("orgOptions").requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION,
					},
					403,
				);
			}

			const membershipLimit = ctx.get("orgOptions")?.membershipLimit || 100;
			const membersCount = await adapter.countMembers({
				organizationId: invitation.organizationId,
			});

			if (membersCount >= membershipLimit) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
					},
					401,
				);
			}

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			// Run beforeAcceptInvitation hook
			if (options?.organizationHooks?.beforeAcceptInvitation) {
				await options?.organizationHooks.beforeAcceptInvitation({
					invitation,
					user: session.user,
					organization,
				});
			}

			const acceptedI = await adapter.updateInvitation({
				invitationId,
				status: "accepted",
			});

			if (!acceptedI) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.FAILED_TO_RETRIEVE_INVITATION,
					},
					400,
				);
			}

			if (
				ctx.get("orgOptions").teams &&
				ctx.get("orgOptions").teams!.enabled &&
				"teamId" in acceptedI &&
				acceptedI.teamId
			) {
				const teamIds = (acceptedI.teamId as string).split(",");
				const onlyOne = teamIds.length === 1;

				for (const teamId of teamIds) {
					await adapter.findOrCreateTeamMember({
						teamId: teamId,
						userId: session.user.id,
					});

					if (
						typeof ctx.get("orgOptions").teams!.maximumMembersPerTeam !==
						"undefined"
					) {
						const members = await adapter.countTeamMembers({ teamId });

						const optionMaximumMembersPerTeam =
							ctx.get("orgOptions").teams!.maximumMembersPerTeam;
						const maximumMembersPerTeam =
							typeof optionMaximumMembersPerTeam === "function"
								? await optionMaximumMembersPerTeam({
										teamId,
										session: session,
										organizationId: invitation.organizationId,
									})
								: (optionMaximumMembersPerTeam ?? Infinity);

						if (members >= maximumMembersPerTeam) {
							return ctx.render(
								{
									success: False,
									message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
								},
								403,
							);
						}
					}
				}

				if (onlyOne) {
					const teamId = teamIds[0]!;
					const updatedSession = await adapter.setActiveTeam(
						session.session.token,
						teamId,
					);

					await setSessionCookie(ctx, authOptions, {
						session: updatedSession,
						user: session.user,
					});
				}
			}

			const member = await adapter.createMember({
				organizationId: invitation.organizationId,
				userId: session.user.id,
				role: invitation.role as string,
				createdAt: new Date(),
			});

			await adapter.setActiveOrganization(
				session.session.token,
				invitation.organizationId,
			);

			if (!acceptedI)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
					},
					400,
				);

			if (options?.organizationHooks?.afterAcceptInvitation)
				await options?.organizationHooks.afterAcceptInvitation({
					invitation: acceptedI,
					member,
					user: session.user,
					organization,
				});

			return ctx.render({ invitation: acceptedI, member }, 200);
		},
	);

export const rejectInvitation = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "rejectInvitation",
			method: "post",
			path: "/organization/reject-invitation",
			description: "Reject an invitation to an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(invitationRequestSchema).bld(),
			responses: res(invitationResponseSchema.transform(toSuccess))
				.err(400, "Not found or already invited")
				.err(401, "Not allowed to perform action or limit reached")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { invitationId } = ctx.req.valid("json");
			const session = ctx.get("session");
			const adapter = getOrgAdapter(ctx.get("context"), ctx.get("orgOptions"));
			const invitation = await adapter.findInvitationById(invitationId);
			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			)
				return ctx.render(
					{ success: False, message: "Invitation not found!" },
					400,
				);

			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
					},
					401,
				);
			}

			if (
				ctx.get("orgOptions").requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION,
					},
					403,
				);

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			// Run beforeRejectInvitation hook
			if (options?.organizationHooks?.beforeRejectInvitation)
				await options?.organizationHooks.beforeRejectInvitation({
					invitation,
					user: session.user,
					organization,
				});

			const rejectedI = await adapter.updateInvitation({
				invitationId,
				status: "rejected",
			});

			// Run afterRejectInvitation hook
			if (options?.organizationHooks?.afterRejectInvitation)
				await options?.organizationHooks.afterRejectInvitation({
					invitation: rejectedI ?? invitation,
					user: session.user,
					organization,
				});

			return ctx.render({ invitation: rejectedI! }, 200);
		},
	);

export const cancelInvitation = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "cancelInvitation",
			method: "post",
			path: "/organization/cancel-invitation",
			description: "Cancel an invitation to an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(invitationRequestSchema).bld(),
			responses: res(invitationSchema.transform(toSuccess))
				.err(400, "Not found or already invited")
				.err(401, "Not allowed to perform action or limit reached")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { invitationId } = ctx.req.valid("json");
			const session = ctx.get("session");
			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const invitation = await adapter.findInvitationById(invitationId);
			if (!invitation) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
					},
					400,
				);
			}
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: invitation.organizationId,
			});
			if (!member) {
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
					},
					400,
				);
			}
			const canCancel = await hasPermission(
				{
					role: member.role,
					options: ctx.get("orgOptions"),
					permissions: { invitation: ["cancel"] },
					organizationId: invitation.organizationId,
				},
				ctx,
			);
			if (!canCancel)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION,
					},
					401,
				);

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			// Run beforeCancelInvitation hook
			if (options?.organizationHooks?.beforeCancelInvitation)
				await options?.organizationHooks.beforeCancelInvitation({
					invitation,
					cancelledBy: session.user,
					organization,
				});

			const canceledI = await adapter.updateInvitation({
				invitationId,
				status: "canceled",
			});

			// Run afterCancelInvitation hook
			if (options?.organizationHooks?.afterCancelInvitation)
				await options?.organizationHooks.afterCancelInvitation({
					invitation: canceledI ?? invitation,
					cancelledBy: session.user,
					organization,
				});

			return ctx.render(canceledI!, 200);
		},
	);

export const getInvitation = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "getInvitation",
			method: "get",
			path: "/organization/get-invitation",
			description: "Get an invitation by ID",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().qry(getInvitationQuerySchema).bld(),
			responses: res(getInvitationResponseSchema.transform(toSuccess))
				.err(400, "Not found or already invited")
				.err(401, "Not allowed to perform action or limit reached")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { id } = ctx.req.valid("query");
			const session = ctx.get("session");

			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const invitation = await adapter.findInvitationById(id);
			if (
				!invitation ||
				invitation.status !== "pending" ||
				invitation.expiresAt < new Date()
			)
				return ctx.render(
					{ success: False, message: "Invitation not found!" },
					400,
				);

			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase())
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
					},
					403,
				);

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const member = await adapter.findMemberByOrgId({
				userId: invitation.inviterId,
				organizationId: invitation.organizationId,
			});
			if (!member)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION,
					},
					400,
				);

			return ctx.render(
				{
					...invitation,
					organizationName: organization["name"],
					organizationSlug: organization["slug"],
					inviterEmail: member.user.email,
				},
				200,
			);
		},
	);

export const listInvitations = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "listInvitations",
			method: "get",
			path: "/organization/list-invitations",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().qry(listInvitationsQuerySchema).bld(),
			responses: res(listInvitationsResponseSchema.transform(toSuccess))
				.err(400, "Not found or already invited")
				.err(401, "Not allowed to perform action or limit reached")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const { organizationId } = ctx.req.valid("query");

			const orgId = organizationId ?? session.session.activeOrganizationId;
			if (!orgId) {
				return ctx.render(
					{ success: False, message: "Organization ID is required" },
					400,
				);
			}
			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: orgId,
			});
			if (!isMember)
				return ctx.render(
					{
						success: False,
						message: "You are not a member of this organization",
					},
					401,
				);

			const invitations = await adapter.listInvitations({
				organizationId: orgId,
			});

			return ctx.render(invitations, 200);
		},
	);

/**
 * List all invitations a user has received
 */
export const listUserInvitations = <O extends OrganizationOptions>(
	options: O,
) =>
	createEndpoint(
		createRoute({
			operationId: "listUserInvitations",
			method: "get",
			path: "/organization/list-user-invitations",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(options)],
			request: req().qry(listUserInvitationsQuerySchema).bld(),
			responses: res(listInvitationsResponseSchema.transform(toSuccess))
				.err(400, "Not found or already invited")
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const { email } = ctx.req.valid("query");

			if (!ctx.get("isServer") && email)
				return ctx.render(
					{
						success: False,
						message: "User email cannot be passed for client side API calls.",
					},
					400,
				);

			const userEmail = session?.user.email ?? email;
			if (!userEmail)
				return ctx.render(
					{
						success: False,
						message: "Missing session headers, or email query parameter.",
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), options);

			const invitations = await adapter.listUserInvitations(userEmail);

			return ctx.render(invitations, 200);
		},
	);
