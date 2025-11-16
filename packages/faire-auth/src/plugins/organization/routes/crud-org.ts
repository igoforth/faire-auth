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
import type {
	InferInvitation,
	InferMember,
	InferOrganization,
	Member,
	Team,
	TeamMember,
} from "../schema";
import { organizationSchema } from "../schema";
import {
	checkOrganizationSlugSchema,
	createOrganizationBaseSchema,
	deleteOrganizationResponseSchema,
	deleteOrganizationSchema,
	fullOrganizationSchema,
	getFullOrganizationQuerySchema,
	organizationListResponseSchema,
	organizationWithMembersSchema,
	setActiveOrganizationSchema,
	updateOrganizationSchema,
} from "../schema/organization";
import type { OrganizationOptions } from "../types";

export const createOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: options?.schema?.organization?.additionalFields ?? {},
		isClientSide: true,
	});

	const baseSchema = createOrganizationBaseSchema;

	type Body = InferAdditionalFieldsFromPluginOptions<"organization", O> &
		z.input<typeof baseSchema>;

	return createEndpoint(
		createRoute({
			operationId: "createOrganization",
			method: "post",
			path: "/organization/create",
			description: "Create a new organization",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(options)],
			request: req()
				.bdy(
					baseSchema.extend(
						additionalFieldsSchema.shape,
					) as unknown as z.ZodType<
						InferAdditionalFieldsFromPluginOptions<"organization", O> &
							z.input<typeof baseSchema>,
						InferAdditionalFieldsFromPluginOptions<"organization", O> &
							z.input<typeof baseSchema>
					>,
				)
				.bld(),
			responses: res(
				organizationWithMembersSchema.transform(
					toSuccess,
				) as unknown as z.ZodType<
					{
						success: true;
						data: InferOrganization<O> & { members: [InferMember<O>] };
					},
					{
						success: true;
						data: InferOrganization<O> & { members: [InferMember<O>] };
					}
				>,
			)
				.err(400)
				.err(401)
				.err(403)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			let {
				name,
				slug,
				userId,
				logo,
				metadata,
				keepCurrentActiveOrganization,
				...additionalFields
			} = ctx.req.valid("json");

			if (userId && !ctx.get("isServer"))
				return ctx.render(
					{ success: False, message: "userId is a server-only field" },
					401,
				);
			userId ??= session?.user.id;
			if (!userId)
				return ctx.render(
					{ success: False, message: "Could not find userId" },
					401,
				);

			let user =
				session?.user ??
				(await ctx.get("context").internalAdapter.findUserById(userId));
			if (!user)
				return ctx.render(
					{ success: False, message: "Could not find user for userId" },
					401,
				);

			const orgOptions = ctx.get("orgOptions");
			const canCreateOrg =
				typeof orgOptions?.allowUserToCreateOrganization === "function"
					? await orgOptions.allowUserToCreateOrganization(user)
					: orgOptions?.allowUserToCreateOrganization === undefined
						? true
						: orgOptions.allowUserToCreateOrganization;

			if (!canCreateOrg)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION,
					},
					403,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), options as O);
			const userOrganizations = await adapter.listOrganizations(user.id);

			const hasReachedOrgLimit =
				typeof orgOptions.organizationLimit === "number"
					? userOrganizations.length >= orgOptions.organizationLimit
					: typeof orgOptions.organizationLimit === "function"
						? await orgOptions.organizationLimit(user)
						: false;

			if (hasReachedOrgLimit)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS,
					},
					403,
				);

			const existingOrganization = await adapter.findOrganizationBySlug(slug);
			if (existingOrganization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_ALREADY_EXISTS,
					},
					400,
				);

			const orgData = { name, slug, logo, metadata, ...additionalFields };
			let hookResponse: { data: Record<string, any> } | undefined = undefined;

			if (orgOptions.organizationHooks?.beforeCreateOrganization) {
				const response =
					await orgOptions.organizationHooks.beforeCreateOrganization({
						organization: { ...orgData, createdAt: new Date() },
						user,
					});
				if (response && typeof response === "object" && "data" in response) {
					hookResponse = response;
				}
			}

			const organization = await adapter.createOrganization({
				organization: {
					...orgData,
					createdAt: new Date(),
					...(hookResponse?.data || {}),
				},
			});

			let member:
				| (Member & InferAdditionalFieldsFromPluginOptions<"member", O, false>)
				| undefined;
			let teamMember: TeamMember | null = null;

			if (
				orgOptions?.teams?.enabled === true &&
				orgOptions.teams.defaultTeam?.enabled !== false
			) {
				const defaultTeam =
					(await orgOptions.teams.defaultTeam?.customCreateDefaultTeam?.(
						organization,
						ctx.req,
					)) ??
					(await adapter.createTeam({
						organizationId: organization.id,
						name: `${organization.name}`,
						createdAt: new Date(),
						updatedAt: new Date(),
					}));

				member = await adapter.createMember({
					userId: user.id,
					organizationId: organization.id,
					role: orgOptions.creatorRole ?? "owner",
				});

				teamMember = await adapter.findOrCreateTeamMember({
					teamId: defaultTeam.id,
					userId: user.id,
				});
			} else
				member = await adapter.createMember({
					userId: user.id,
					organizationId: organization.id,
					role: orgOptions.creatorRole ?? "owner",
				});

			if (orgOptions.organizationHooks?.afterCreateOrganization)
				await orgOptions.organizationHooks.afterCreateOrganization({
					organization,
					user,
					member,
				});

			if (session && !keepCurrentActiveOrganization)
				await adapter.setActiveOrganization(
					session.session.token,
					organization.id,
				);

			if (teamMember && session && !keepCurrentActiveOrganization)
				await adapter.setActiveTeam(session.session.token, teamMember.teamId);

			return ctx.render(
				{
					...organization,
					metadata:
						organization.metadata && typeof organization.metadata === "string"
							? JSON.parse(organization.metadata)
							: organization.metadata,
					members: [member],
				},
				200,
			);
		},
	);
};

export const checkOrganizationSlug = <O extends OrganizationOptions>(
	options: O,
) =>
	createEndpoint(
		createRoute({
			operationId: "checkOrganizationSlug",
			method: "post",
			path: "/organization/check-slug",
			description: "Check if an organization slug is available",
			middleware: [requestOnlySessionMiddleware, orgMiddleware(options)],
			request: req().bdy(checkOrganizationSlugSchema).bld(),
			responses: res(
				SCHEMAS[Definitions.SUCCESS].default,
				"Success - Slug is available",
			)
				.err(400, "Slug is taken")
				.zod<typeof checkOrganizationSlugSchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { slug } = ctx.req.valid("json");
			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const org = await adapter.findOrganizationBySlug(slug);
			if (!org)
				return ctx.render({ success: True, message: "Slug is available" }, 200);
			return ctx.render({ success: False, message: "Slug is taken" }, 400);
		},
	);

export const updateOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	const additionalFieldsSchema = toZodSchema<
		InferAdditionalFieldsFromPluginOptions<"organization", O>,
		true
	>({
		fields: options?.schema?.organization?.additionalFields ?? {},
		isClientSide: true,
	});
	type Body = {
		data: {
			name?: string;
			slug?: string;
			logo?: string;
			metadata?: Record<string, any>;
		} & InferAdditionalFieldsFromPluginOptions<"organization", O>;
		organizationId: string;
	};

	return createEndpoint(
		createRoute({
			operationId: "updateOrganization",
			method: "post",
			path: "/organization/update",
			description: "Update an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req()
				.bdy(
					updateOrganizationSchema.extend({
						data: updateOrganizationSchema.shape.data
							.extend(additionalFieldsSchema.shape)
							.partial(),
					}) as unknown as z.ZodType<Body, Body>,
				)
				.bld(),
			responses: res(
				organizationSchema.transform(toSuccess) as unknown as z.ZodType<
					{
						success: true;
						data:
							| (InferOrganization<O> & {
									metadata: Record<string, any> | undefined;
							  })
							| null;
					},
					{
						success: true;
						data:
							| (InferOrganization<O> & {
									metadata: Record<string, any> | undefined;
							  })
							| null;
					}
				>,
			)
				.err(400)
				.err(401)
				.err(403)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const { data, organizationId } = ctx.req.valid("json");

			const orgId = organizationId ?? session.session.activeOrganizationId;
			if (!orgId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
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
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					400,
				);
			}

			const canUpdateOrg = hasPermission(
				{
					permissions: { organization: ["update"] },
					role: member.role,
					options: ctx.get("orgOptions"),
					organizationId: orgId,
				},
				ctx,
			);

			if (!canUpdateOrg)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION,
					},
					403,
				);

			const updatedOrg = await adapter.updateOrganization(orgId, data);
			return ctx.render(updatedOrg, 200);
		},
	);
};

export const deleteOrganization = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "deleteOrganization",
			method: "post",
			path: "/organization/delete",
			description: "Delete an organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(deleteOrganizationSchema).bld(),
			responses: res(deleteOrganizationResponseSchema.transform(toSuccess))
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof deleteOrganizationSchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const { organizationId } = ctx.req.valid("json");

			if (!organizationId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});

			if (!member)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					400,
				);

			const canDeleteOrg = hasPermission(
				{
					role: member.role,
					permissions: { organization: ["delete"] },
					options: ctx.get("orgOptions"),
					organizationId,
				},
				ctx,
			);

			if (!canDeleteOrg)
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_ORGANIZATION,
					},
					403,
				);

			if (organizationId === session.session.activeOrganizationId)
				await adapter.setActiveOrganization(session.session.token, null);

			const orgOptions = ctx.get("orgOptions");
			if (orgOptions.disableOrganizationDeletion === true)
				return ctx.render(
					{ success: False, message: "Organization deletion is disabled" },
					403,
				);

			const org = await adapter.findOrganizationById(organizationId);
			if (!org)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			if (orgOptions.organizationHooks?.beforeDeleteOrganization)
				await orgOptions.organizationHooks.beforeDeleteOrganization({
					organization: org,
					user: session.user,
				});

			await adapter.deleteOrganization(organizationId);

			if (orgOptions.organizationHooks?.afterDeleteOrganization)
				await orgOptions.organizationHooks.afterDeleteOrganization({
					organization: org,
					user: session.user,
				});

			return ctx.render(org.id, 200);
		},
	);

export const getFullOrganization = <O extends OrganizationOptions>(
	options: O,
) => {
	type OrganizationReturn = O["teams"] extends { enabled: true }
		? {
				members: InferMember<O>[];
				invitations: InferInvitation<O>[];
				teams: Team[];
			} & InferOrganization<O>
		: {
				members: InferMember<O>[];
				invitations: InferInvitation<O>[];
			} & InferOrganization<O>;

	return createEndpoint(
		createRoute({
			operationId: "getFullOrganization",
			method: "get",
			path: "/organization/get-full-organization",
			description: "Get the full organization with members and teams",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().qry(getFullOrganizationQuerySchema).bld(),
			responses: res(
				fullOrganizationSchema.transform(toSuccess) as unknown as z.ZodType<
					{
						success: true;
						data: OrganizationReturn;
					},
					{
						success: true;
						data: OrganizationReturn;
					}
				>,
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof getFullOrganizationQuerySchema>()
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const session = ctx.get("session");
			const { organizationId, organizationSlug, membersLimit } =
				ctx.req.valid("query");

			const orgId =
				organizationSlug ??
				organizationId ??
				session.session.activeOrganizationId;

			// previous comment was:
			// return null if no organization is found to avoid erroring since this is a usual scenario

			// if it was due to an information disclosure concern:
			// which is just security theater because the rest of the codebase leaks org ids
			// so no point in fixing one scenario of information disclosure until we fix it all
			// the inconsistent behavior creates a worse developer experience

			// otherwise:
			// since we're not throwing to return anymore potentially meaning
			// better flow of execution avoiding error handling cases
			// if (!orgId) return ctx.render(null, 200)
			if (!orgId)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const organization = await adapter.findFullOrganization({
				organizationId: orgId,
				isSlug: !!organizationSlug,
				...(membersLimit && { membersLimit }),
				...(ctx.get("orgOptions").teams?.enabled === true && {
					includeTeams: ctx.get("orgOptions").teams!.enabled,
				}),
			});

			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const isMember = organization.members.find(
				(member) => member.userId === session.user.id,
			);

			if (!isMember) {
				await adapter.setActiveOrganization(session.session.token, null);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					403,
				);
			}

			return ctx.render(organization as OrganizationReturn, 200);
		},
	);
};

export const setActiveOrganization = <O extends OrganizationOptions>(
	options: O,
) =>
	createEndpoint(
		createRoute({
			operationId: "setActiveOrganization",
			method: "post",
			path: "/organization/set-active",
			description: "Set the active organization",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(setActiveOrganizationSchema).bld(),
			responses: res(
				organizationSchema
					.nullable()
					.transform(toSuccess) as unknown as z.ZodType<
					{
						success: true;
						data: InferOrganization<O> | null;
					},
					{
						success: true;
						data: InferOrganization<O> | null;
					}
				>,
			)
				.err(400)
				.err(401)
				.err(403)
				.zod<typeof setActiveOrganizationSchema>()
				.bld(),
		}),
		(authOptions) => async (ctx) => {
			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const session = ctx.get("session");
			let { organizationId, organizationSlug } = ctx.req.valid("json");

			if (organizationId === null) {
				const sessionOrgId = session.session.activeOrganizationId;
				if (!sessionOrgId) return ctx.render(null, 200);

				const updatedSession = await adapter.setActiveOrganization(
					session.session.token,
					null,
				);
				await setSessionCookie(ctx, authOptions, {
					session: updatedSession,
					user: session.user,
				});
				return ctx.render(null, 200);
			}

			if (organizationId === undefined && organizationSlug === undefined) {
				const sessionOrgId = session.session.activeOrganizationId;
				// this would classify as a bad request
				// if (!sessionOrgId) return ctx.render(null, 200)
				if (!sessionOrgId)
					return ctx.render(
						{
							success: False,
							message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
						},
						400,
					);

				organizationId = sessionOrgId;
			}

			if (organizationSlug !== undefined && organizationId === undefined) {
				const organization =
					await adapter.findOrganizationBySlug(organizationSlug);
				if (!organization)
					return ctx.render(
						{
							success: False,
							message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
						},
						400,
					);

				organizationId = organization.id;
			}

			if (organizationId === undefined)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const isMember = await adapter.checkMembership({
				userId: session.user.id,
				organizationId,
			});

			if (!isMember) {
				await adapter.setActiveOrganization(session.session.token, null);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION,
					},
					403,
				);
			}

			let organization = await adapter.findOrganizationById(organizationId);
			if (!organization)
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
					},
					400,
				);

			const updatedSession = await adapter.setActiveOrganization(
				session.session.token,
				organization.id,
			);
			await setSessionCookie(ctx, authOptions, {
				session: updatedSession,
				user: session.user,
			});

			return ctx.render(organization, 200);
		},
	);

export const listOrganizations = <O extends OrganizationOptions>(options: O) =>
	createEndpoint(
		createRoute({
			operationId: "listOrganizations",
			method: "get",
			path: "/organization/list",
			description: "List all organizations for the current user",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			responses: res(
				organizationListResponseSchema.transform(
					toSuccess,
				) as unknown as z.ZodType<
					{
						success: true;
						data: InferOrganization<O>[];
					},
					{
						success: true;
						data: InferOrganization<O>[];
					}
				>,
			)
				.err(401)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const adapter = getOrgAdapter<O>(ctx.get("context"), options);
			const session = ctx.get("session");
			const organizations = await adapter.listOrganizations(session.user.id);
			return ctx.render(organizations, 200);
		},
	);
