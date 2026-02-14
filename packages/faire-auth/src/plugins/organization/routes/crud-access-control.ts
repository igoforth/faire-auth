import type { User } from "@faire-auth/core/db";
import { createRoute, req, res } from "@faire-auth/core/factory";
import { Definitions, False, SCHEMAS, True } from "@faire-auth/core/static";
import type { InferAdditionalFieldsFromPluginOptions } from "@faire-auth/core/types";
import { toSuccess } from "@faire-auth/core/utils";
import type { Context } from "hono";
import * as z from "zod";
import { createEndpoint } from "../../../api/factory/endpoint";
import { toZodSchema } from "../../../db";
import type { Where } from "../../../types/adapter";
import type { ContextVars } from "../../../types/hono";
import type { AccessControl, Statements, Subset } from "../../access";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import type { Member, OrganizationRole } from "../schema";
import { organizationRoleSchema } from "../schema/base";
import type { OrganizationOptions } from "../types";

type IsExactlyEmptyObject<T> = keyof T extends never // no keys
	? T extends {} // is assignable to {}
		? {} extends T
			? true
			: false // and {} is assignable to it
		: false
	: false;

const normalizeRoleName = (role: string) => role.toLowerCase();
const DEFAULT_MAXIMUM_ROLES_PER_ORGANIZATION = Number.POSITIVE_INFINITY;

const getAdditionalFields = <
	O extends OrganizationOptions,
	AllPartial extends boolean = false,
>(
	options: O,
	shouldBePartial: AllPartial = false as AllPartial,
) => {
	let additionalFields =
		options?.schema?.organizationRole?.additionalFields || {};
	if (shouldBePartial)
		for (const key in additionalFields) additionalFields[key]!.required = false;

	const additionalFieldsSchema = toZodSchema({
		fields: additionalFields,
		isClientSide: true,
	});
	type AdditionalFields = AllPartial extends true
		? Partial<InferAdditionalFieldsFromPluginOptions<"organizationRole", O>>
		: InferAdditionalFieldsFromPluginOptions<"organizationRole", O>;
	type ReturnAdditionalFields = InferAdditionalFieldsFromPluginOptions<
		"organizationRole",
		O,
		false
	>;

	return {
		additionalFieldsSchema,
		$AdditionalFields: {} as AdditionalFields,
		$ReturnAdditionalFields: {} as ReturnAdditionalFields,
	};
};

export const createOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O>(options, false);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	const createOrgRoleRequestSchema = z.object({
		organizationId: z.string().optional().openapi({
			description:
				"The id of the organization to create the role in. If not provided, the user's active organization will be used.",
		}),
		role: z.string().openapi({
			description: "The name of the role to create",
		}),
		permission: z.record(z.string(), z.array(z.string())).openapi({
			description: "The permission to assign to the role",
		}),
		additionalFields: z.object(additionalFieldsSchema.shape).optional(),
		// additionalFields: additionalFieldsSchema.optional(),
	}) as unknown as z.ZodType<
		{
			organizationId?: string;
			role: string;
			permission: Record<string, string[]>;
		} & (IsExactlyEmptyObject<AdditionalFields> extends true
			? { additionalFields?: {} }
			: { additionalFields: AdditionalFields }),
		{
			organizationId?: string;
			role: string;
			permission: Record<string, string[]>;
		} & (IsExactlyEmptyObject<AdditionalFields> extends true
			? { additionalFields?: {} }
			: { additionalFields: AdditionalFields })
	>;

	const createOrgRoleResponseSchema = z
		.object({
			roleData: organizationRoleSchema.extend(additionalFieldsSchema.shape),
			statements: z.record(z.string(), z.array(z.string())),
		})
		.transform(toSuccess) as unknown as z.ZodType<
		{
			success: true;
			data: {
				roleData: OrganizationRole & ReturnAdditionalFields;
				statements: Subset<string, Statements>;
			};
		},
		{
			roleData: OrganizationRole & ReturnAdditionalFields;
			statements: Subset<string, Statements>;
		}
	>;

	return createEndpoint(
		createRoute({
			operationId: "createOrgRole",
			method: "post",
			path: "/organization/create-role",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(createOrgRoleRequestSchema).bld(),
			responses: res(createOrgRoleResponseSchema)
				.err(400)
				.err(
					403,
					"Not a member or not allowed to create a role",
					SCHEMAS[Definitions.ERROR].default.extend({
						missingPermissions: z
							.array(
								z.custom<`${string}:${string}`>(
									(v) => typeof v === "string" && v.includes(":"),
								),
							)
							.optional(),
					}),
				)
				.err(501)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { session, user } = ctx.get("session");

			// Get the organization id where the role will be created.
			// We can verify if the org id is valid and associated with the user in the next step when we try to find the member.
			const {
				organizationId = session.activeOrganizationId,
				role,
				permission,
				additionalFields,
			} = ctx.req.valid("json");

			const ac = options.ac;
			if (!ac) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The organization plugin is missing a pre-defined ac instance.`,
						`\nPlease refer to the documentation here: https://faire-auth.com/docs/plugins/organization#dynamic-access-control`,
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MISSING_AC_INSTANCE,
					},
					501,
				);
			}

			if (!organizationId) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The session is missing an active organization id to create a role. Either set an active org id, or pass an organizationId in the request body.`,
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_MUST_BE_IN_AN_ORGANIZATION_TO_CREATE_A_ROLE,
					},
					400,
				);
			}

			const roleName = normalizeRoleName(role);
			const takenRes = await checkIfRoleNameIsTakenByPreDefinedRole({
				role: roleName,
				organizationId,
				options,
				ctx,
			});
			if (takenRes instanceof Response) return takenRes;

			// Get the user's role associated with the organization.
			// This also serves as a check to ensure the org id is valid.
			const member = await ctx.get("context").adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not a member of the organization to create a role.`,
						{
							userId: user.id,
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					403,
				);
			}

			const canCreateRole = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["create"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canCreateRole) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not permitted to create a role. If this is unexpected, please make sure the role associated to that member has the "ac" resource with the "create" permission.`,
						{
							userId: user.id,
							organizationId,
							role: member.role,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE,
					},
					403,
				);
			}

			const maximumRolesPerOrganization =
				typeof options.dynamicAccessControl?.maximumRolesPerOrganization ===
				"function"
					? await options.dynamicAccessControl.maximumRolesPerOrganization(
							organizationId,
						)
					: (options.dynamicAccessControl?.maximumRolesPerOrganization ??
						DEFAULT_MAXIMUM_ROLES_PER_ORGANIZATION);

			const rolesInDB = await ctx.get("context").adapter.count({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (rolesInDB >= maximumRolesPerOrganization) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] Failed to create a new role, the organization has too many roles. Maximum allowed roles is ${maximumRolesPerOrganization}.`,
						{
							organizationId,
							maximumRolesPerOrganization,
							rolesInDB,
						},
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.TOO_MANY_ROLES,
					},
					400,
				);
			}

			const invalidRes = await checkForInvalidResources({
				ac,
				ctx,
				permission,
			});
			if (invalidRes instanceof Response) return invalidRes;

			const permissionRes = await checkIfMemberHasPermission({
				ctx,
				member,
				options,
				organizationId,
				permissionRequired: permission,
				user,
				action: "create",
			});
			if (permissionRes instanceof Response) return permissionRes;

			const dbRes = await checkIfRoleNameIsTakenByRoleInDB({
				ctx,
				organizationId,
				role: roleName,
			});
			if (dbRes instanceof Response) return dbRes;

			const newRole = ac.newRole(permission);

			const newRoleInDB = await ctx
				.get("context")
				.adapter.create<
					Omit<OrganizationRole, "permission"> & { permission: string }
				>({
					model: "organizationRole",
					data: {
						createdAt: new Date(),
						updatedAt: new Date(),
						organizationId,
						permission: JSON.stringify(permission),
						role: roleName,
						...additionalFields,
					},
				});

			const data = {
				...newRoleInDB,
				permission,
			} as OrganizationRole & ReturnAdditionalFields;
			return ctx.render(
				{
					roleData: data,
					statements: newRole.statements,
				},
				200,
			);
		},
	);
};

export const deleteOrgRole = <O extends OrganizationOptions>(options: O) => {
	const deleteOrgRoleRequestSchema = z
		.object({
			organizationId: z.string().optional().openapi({
				description:
					"The id of the organization to create the role in. If not provided, the user's active organization will be used.",
			}),
		})
		.and(
			z.union([
				z.object({
					roleName: z.string().openapi({
						description: "The name of the role to delete",
					}),
				}),
				z.object({
					roleId: z.string().openapi({
						description: "The id of the role to delete",
					}),
				}),
			]),
		);

	const deleteOrgRoleResponseSchema = z.object({
		success: z.literal(true),
	});

	return createEndpoint(
		createRoute({
			operationId: "deleteOrgRole",
			method: "post",
			path: "/organization/delete-role",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(deleteOrgRoleRequestSchema).bld(),
			responses: res(deleteOrgRoleResponseSchema).err(400).err(403).bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { session, user } = ctx.get("session");

			// We can verify if the org id is valid and associated with the user in the next step when we try to find the member.
			const validData = ctx.req.valid("json");
			const { organizationId = session.activeOrganizationId } = validData;
			const roleName = "roleName" in validData ? validData.roleName : undefined;
			const roleId = "roleId" in validData ? validData.roleId : undefined;

			if (!organizationId) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The session is missing an active organization id to delete a role. Either set an active org id, or pass an organizationId in the request body.`,
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);
			}

			// Get the user's role associated with the organization.
			// This also serves as a check to ensure the org id is valid.
			const member = await ctx.get("context").adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not a member of the organization to delete a role.`,
						{
							userId: user.id,
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					403,
				);
			}

			const canDeleteRole = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["delete"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canDeleteRole) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not permitted to delete a role. If this is unexpected, please make sure the role associated to that member has the "ac" resource with the "delete" permission.`,
						{
							userId: user.id,
							organizationId,
							role: member.role,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE,
					},
					403,
				);
			}

			if (roleName) {
				const defaultRoles = options.roles
					? Object.keys(options.roles)
					: ["owner", "admin", "member"];
				if (defaultRoles.includes(roleName)) {
					ctx
						.get("context")
						.logger.error(
							`[Dynamic Access Control] Cannot delete a pre-defined role.`,
							{
								roleName,
								organizationId,
								defaultRoles,
							},
						);
					return ctx.render(
						{
							success: False,
							message:
								ORGANIZATION_ERROR_CODES.CANNOT_DELETE_A_PRE_DEFINED_ROLE,
						},
						400,
					);
				}
			}

			let condition: Where;
			if (roleName)
				condition = {
					field: "role",
					value: roleName,
					operator: "eq",
					connector: "AND",
				};
			else
				condition = {
					field: "id",
					value: roleId!,
					operator: "eq",
					connector: "AND",
				};

			const existingRoleInDB = await ctx
				.get("context")
				.adapter.findOne<OrganizationRole>({
					model: "organizationRole",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
						condition,
					],
				});
			if (!existingRoleInDB) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The role name/id does not exist in the database.`,
						{
							...(roleName ? { roleName } : { roleId }),
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
					},
					400,
				);
			}

			existingRoleInDB.permission = JSON.parse(
				existingRoleInDB.permission as never as string,
			);

			await ctx.get("context").adapter.delete({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
			});

			return ctx.render(
				{
					success: True,
				},
				200,
			);
		},
	);
};

export const listOrgRoles = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	const listOrgRolesRequestSchema = z.object({
		organizationId: z.string().optional().openapi({
			description:
				"The id of the organization to list roles for. If not provided, the user's active organization will be used.",
		}),
	});

	const { additionalFieldsSchema } = getAdditionalFields<O>(options, false);

	const listOrgRolesResponseSchema = z
		.array(organizationRoleSchema.extend(additionalFieldsSchema.shape))
		.transform(toSuccess) as unknown as z.ZodType<
		{ success: true; data: (OrganizationRole & ReturnAdditionalFields)[] },
		(OrganizationRole & ReturnAdditionalFields)[]
	>;

	return createEndpoint(
		createRoute({
			operationId: "listOrgRoles",
			method: "get",
			path: "/organization/list-roles",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().qry(listOrgRolesRequestSchema).bld(),
			responses: res(listOrgRolesResponseSchema).err(400).err(403).bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { session, user } = ctx.get("session");
			const { organizationId = session.activeOrganizationId } =
				ctx.req.valid("query");

			if (!organizationId) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The session is missing an active organization id to list roles. Either set an active org id, or pass an organizationId in the request query.`,
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);
			}

			const member = await ctx.get("context").adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not a member of the organization to list roles.`,
						{
							userId: user.id,
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					403,
				);
			}

			const canListRoles = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["read"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canListRoles) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not permitted to list roles.`,
						{
							userId: user.id,
							organizationId,
							role: member.role,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE,
					},
					403,
				);
			}

			let roles = await ctx
				.get("context")
				.adapter.findMany<OrganizationRole & ReturnAdditionalFields>({
					model: "organizationRole",
					where: [
						{
							field: "organizationId",
							value: organizationId,
							operator: "eq",
							connector: "AND",
						},
					],
				});

			roles = roles.map((x) => ({
				...x,
				permission: JSON.parse(x.permission as never as string),
			}));

			return ctx.render(roles, 200);
		},
	);
};

export const getOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { $ReturnAdditionalFields } = getAdditionalFields<O>(options, false);
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	const getOrgRoleRequestSchema = z.object({
		organizationId: z.string().optional().openapi({
			description:
				"The id of the organization to read a role for. If not provided, the user's active organization will be used.",
		}),
		roleName: z.string().optional().openapi({
			description: "The name of the role to read",
		}),
		roleId: z.string().optional().openapi({
			description: "The id of the role to read",
		}),
	});

	const { additionalFieldsSchema } = getAdditionalFields<O>(options, false);

	const getOrgRoleResponseSchema = organizationRoleSchema
		.extend(additionalFieldsSchema.shape)
		.transform(toSuccess) as unknown as z.ZodType<
		{ success: true; data: OrganizationRole & ReturnAdditionalFields },
		OrganizationRole & ReturnAdditionalFields
	>;

	return createEndpoint(
		createRoute({
			operationId: "getOrgRole",
			method: "get",
			path: "/organization/get-role",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().qry(getOrgRoleRequestSchema).bld(),
			responses: res(getOrgRoleResponseSchema).err(400).err(403).bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { session, user } = ctx.get("session");
			const {
				organizationId = session.activeOrganizationId,
				roleName,
				roleId,
			} = ctx.req.valid("query");

			if (!organizationId) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The session is missing an active organization id to read a role. Either set an active org id, or pass an organizationId in the request query.`,
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);
			}

			const member = await ctx.get("context").adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not a member of the organization to read a role.`,
						{
							userId: user.id,
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					403,
				);
			}

			const canListRoles = await hasPermission(
				{
					options,
					organizationId,
					permissions: {
						ac: ["read"],
					},
					role: member.role,
				},
				ctx,
			);
			if (!canListRoles) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not permitted to read a role.`,
						{
							userId: user.id,
							organizationId,
							role: member.role,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE,
					},
					403,
				);
			}

			let condition: Where;
			if (roleName)
				condition = {
					field: "role",
					value: roleName,
					operator: "eq",
					connector: "AND",
				};
			else
				condition = {
					field: "id",
					value: roleId!,
					operator: "eq",
					connector: "AND",
				};

			let role = await ctx.get("context").adapter.findOne<OrganizationRole>({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
			});
			if (!role) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The role name/id does not exist in the database.`,
						{
							...(roleName ? { roleName } : { roleId }),
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
					},
					400,
				);
			}

			role.permission = JSON.parse(role.permission as never as string);

			return ctx.render(role, 200);
		},
	);
};

export const updateOrgRole = <O extends OrganizationOptions>(options: O) => {
	const { additionalFieldsSchema, $AdditionalFields, $ReturnAdditionalFields } =
		getAdditionalFields<O, true>(options, true);
	type AdditionalFields = typeof $AdditionalFields;
	type ReturnAdditionalFields = typeof $ReturnAdditionalFields;

	const updateOrgRoleRequestSchema = z
		.object({
			organizationId: z.string().optional().openapi({
				description:
					"The id of the organization to update the role in. If not provided, the user's active organization will be used.",
			}),
			data: z
				.object({
					permission: z
						.record(z.string(), z.array(z.string()))
						.optional()
						.openapi({
							description: "The permission to update the role with",
						}),
					roleName: z.string().optional().openapi({
						description: "The name of the role to update",
					}),
				})
				.extend(additionalFieldsSchema.shape),
		})
		.and(
			z.union([
				z.object({
					roleName: z.string().openapi({
						description: "The name of the role to update",
					}),
				}),
				z.object({
					roleId: z.string().openapi({
						description: "The id of the role to update",
					}),
				}),
			]),
		) as unknown as z.ZodType<
		{
			organizationId?: string;
			data: {
				permission?: Record<string, string[]>;
				roleName?: string;
			} & AdditionalFields;
		} & ({ roleName: string } | { roleId: string }),
		{
			organizationId?: string;
			data: {
				permission?: Record<string, string[]>;
				roleName?: string;
			} & AdditionalFields;
		} & ({ roleName: string } | { roleId: string })
	>;

	const updateOrgRoleResponseSchema = organizationRoleSchema
		.extend(additionalFieldsSchema.shape)
		.transform(toSuccess) as unknown as z.ZodType<
		{ success: true; data: OrganizationRole & ReturnAdditionalFields },
		OrganizationRole & ReturnAdditionalFields
	>;

	return createEndpoint(
		createRoute({
			operationId: "updateOrgRole",
			method: "post",
			path: "/organization/update-role",
			middleware: [orgSessionMiddleware, orgMiddleware(options)],
			request: req().bdy(updateOrgRoleRequestSchema).bld(),
			responses: res(updateOrgRoleResponseSchema)
				.err(400)
				.err(403)
				.err(501)
				.bld(),
		}),
		(_authOptions) => async (ctx) => {
			const { session, user } = ctx.get("session");
			const validData = ctx.req.valid("json");
			const { organizationId = session.activeOrganizationId, data } = validData;
			const roleName = "roleName" in validData ? validData.roleName : undefined;
			const roleId = "roleId" in validData ? validData.roleId : undefined;

			const ac = options.ac;
			if (!ac) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The organization plugin is missing a pre-defined ac instance.`,
						`\nPlease refer to the documentation here: https://faire-auth.com/docs/plugins/organization#dynamic-access-control`,
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.MISSING_AC_INSTANCE,
					},
					501,
				);
			}

			if (!organizationId) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The session is missing an active organization id to update a role. Either set an active org id, or pass an organizationId in the request body.`,
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
					},
					400,
				);
			}

			const member = await ctx.get("context").adapter.findOne<Member>({
				model: "member",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					{
						field: "userId",
						value: user.id,
						operator: "eq",
						connector: "AND",
					},
				],
			});
			if (!member) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not a member of the organization to update a role.`,
						{
							userId: user.id,
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
					},
					403,
				);
			}

			const canUpdateRole = await hasPermission(
				{
					options,
					organizationId,
					role: member.role,
					permissions: {
						ac: ["update"],
					},
				},
				ctx,
			);
			if (!canUpdateRole) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The user is not permitted to update a role.`,
					);
				return ctx.render(
					{
						success: False,
						message:
							ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE,
					},
					403,
				);
			}

			let condition: Where;
			if (roleName)
				condition = {
					field: "role",
					value: roleName,
					operator: "eq",
					connector: "AND",
				};
			else
				condition = {
					field: "id",
					value: roleId!,
					operator: "eq",
					connector: "AND",
				};

			let role = await ctx.get("context").adapter.findOne<OrganizationRole>({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
			});
			if (!role) {
				ctx
					.get("context")
					.logger.error(
						`[Dynamic Access Control] The role name/id does not exist in the database.`,
						{
							...(roleName ? { roleName } : { roleId }),
							organizationId,
						},
					);
				return ctx.render(
					{
						success: False,
						message: ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND,
					},
					400,
				);
			}
			role.permission = role.permission
				? JSON.parse(role.permission as never as string)
				: undefined;

			const { permission: _, roleName: __, ...additionalFields } = data;

			let updateData: Partial<OrganizationRole> = {
				...additionalFields,
			};

			if (data.permission) {
				let newPermission = data.permission;

				const invalidRes = await checkForInvalidResources({
					ac,
					ctx,
					permission: newPermission,
				});
				if (invalidRes instanceof Response) return invalidRes;

				const permissionRes = await checkIfMemberHasPermission({
					ctx,
					member,
					options,
					organizationId,
					permissionRequired: newPermission,
					user,
					action: "update",
				});
				if (permissionRes instanceof Response) return permissionRes;

				updateData.permission = newPermission;
			}
			if (data.roleName) {
				let newRoleName = data.roleName;

				newRoleName = normalizeRoleName(newRoleName);

				const takenRes = await checkIfRoleNameIsTakenByPreDefinedRole({
					role: newRoleName,
					organizationId,
					options,
					ctx,
				});
				if (takenRes instanceof Response) return takenRes;
				const dbRes = await checkIfRoleNameIsTakenByRoleInDB({
					role: newRoleName,
					organizationId,
					ctx,
				});
				if (dbRes instanceof Response) return dbRes;

				updateData.role = newRoleName;
			}

			// -----
			// Apply the updates
			const update = {
				...updateData,
				...(updateData.permission
					? { permission: JSON.stringify(updateData.permission) }
					: {}),
			};
			await ctx.get("context").adapter.update<OrganizationRole>({
				model: "organizationRole",
				where: [
					{
						field: "organizationId",
						value: organizationId,
						operator: "eq",
						connector: "AND",
					},
					condition,
				],
				update,
			});

			return ctx.render(
				{
					...role,
					...update,
					permission: updateData.permission || role.permission || null,
				} as OrganizationRole & ReturnAdditionalFields,
				200,
			);
		},
	);
};

async function checkForInvalidResources<V extends object>({
	ac,
	ctx,
	permission,
}: {
	ac: AccessControl;
	ctx: Context<ContextVars<V>>;
	permission: Record<string, string[]>;
}) {
	const validResources = Object.keys(ac.statements);
	const providedResources = Object.keys(permission);
	const hasInvalidResource = providedResources.some(
		(r) => !validResources.includes(r),
	);
	if (hasInvalidResource) {
		ctx
			.get("context")
			.logger.error(
				`[Dynamic Access Control] The provided permission includes an invalid resource.`,
				{
					providedResources,
					validResources,
				},
			);
		return ctx.render(
			{
				success: False,
				message: ORGANIZATION_ERROR_CODES.INVALID_RESOURCE,
			},
			400,
		);
	}
}

async function checkIfMemberHasPermission<V extends object>({
	ctx,
	permissionRequired: permission,
	options,
	organizationId,
	member,
	user,
	action,
}: {
	ctx: Context<ContextVars<V>>;
	permissionRequired: Record<string, string[]>;
	options: OrganizationOptions;
	organizationId: string;
	member: Member;
	user: User;
	action: "create" | "update" | "delete" | "read" | "list" | "get";
}) {
	const hasNecessaryPermissions: {
		resource: { [x: string]: string[] };
		hasPermission: boolean;
	}[] = [];
	const permissionEntries = Object.entries(permission);
	for await (const [resource, permissions] of permissionEntries) {
		for await (const perm of permissions) {
			hasNecessaryPermissions.push({
				resource: { [resource]: [perm] },
				hasPermission: await hasPermission(
					{
						options,
						organizationId,
						permissions: { [resource]: [perm] },
						useMemoryCache: true,
						role: member.role,
					},
					ctx,
				),
			});
		}
	}
	const missingPermissions = hasNecessaryPermissions
		.filter((x) => x.hasPermission === false)
		.map((x) => {
			const key = Object.keys(x.resource)[0];
			return `${key}:${x.resource[key][0]}` as const;
		});
	if (missingPermissions.length > 0) {
		ctx
			.get("context")
			.logger.error(
				`[Dynamic Access Control] The user is missing permissions necessary to ${action} a role with those set of permissions.\n`,
				{
					userId: user.id,
					organizationId,
					role: member.role,
					missingPermissions,
				},
			);
		let errorMessage: string;
		if (action === "create")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_ROLE;
		else if (action === "update")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_A_ROLE;
		else if (action === "delete")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_DELETE_A_ROLE;
		else if (action === "read")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_READ_A_ROLE;
		else if (action === "list")
			errorMessage =
				ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_LIST_A_ROLE;
		else
			errorMessage = ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_GET_A_ROLE;

		return ctx.render(
			{ success: False, message: errorMessage, missingPermissions },
			403,
		);
	}
}

async function checkIfRoleNameIsTakenByPreDefinedRole<V extends object>({
	options,
	organizationId,
	role,
	ctx,
}: {
	options: OrganizationOptions;
	organizationId: string;
	role: string;
	ctx: Context<ContextVars<V>>;
}) {
	const defaultRoles = options.roles
		? Object.keys(options.roles)
		: ["owner", "admin", "member"];
	if (defaultRoles.includes(role)) {
		ctx
			.get("context")
			.logger.error(
				`[Dynamic Access Control] The role name "${role}" is already taken by a pre-defined role.`,
				{
					role,
					organizationId,
					defaultRoles,
				},
			);

		return ctx.render(
			{
				success: False,
				message: ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
			},
			400,
		);
	}
}

async function checkIfRoleNameIsTakenByRoleInDB<V extends object>({
	organizationId,
	role,
	ctx,
}: {
	ctx: Context<ContextVars<V>>;
	organizationId: string;
	role: string;
}) {
	const existingRoleInDB = await ctx
		.get("context")
		.adapter.findOne<OrganizationRole>({
			model: "organizationRole",
			where: [
				{
					field: "organizationId",
					value: organizationId,
					operator: "eq",
					connector: "AND",
				},
				{
					field: "role",
					value: role,
					operator: "eq",
					connector: "AND",
				},
			],
		});
	if (existingRoleInDB) {
		ctx
			.get("context")
			.logger.error(
				`[Dynamic Access Control] The role name "${role}" is already taken by a role in the database.`,
				{
					role,
					organizationId,
				},
			);

		return ctx.render(
			{
				success: False,
				message: ORGANIZATION_ERROR_CODES.ROLE_NAME_IS_ALREADY_TAKEN,
			},
			400,
		);
	}
}
