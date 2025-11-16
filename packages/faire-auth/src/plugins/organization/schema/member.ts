import { looseUserSchema } from "@faire-auth/core/db";
import * as z from "zod";
import { memberSchema, role } from "./base";

export const memberWithUserSchema = memberSchema.extend({
	user: looseUserSchema.extend({
		// TODO: the only reason why this is z.string() instead of z.email()
		// is because of the dumb test setup in sso.test.ts where localhost:8000.com
		// counts as a valid domain but not a valid email
		email: z.string(),
	}),
});

/**
 * Schema for adding a member
 */
export const addMemberSchema = z.object({
	userId: z.string().nullable().default(null).openapi({
		description:
			'The user ID which represents the user to be added as a member. If `null` is provided, then it\'s expected to provide session headers. Eg: "user-id"',
	}),
	role: z
		.union([
			role.openapi({ description: "The role to assign to the user" }),
			z.array(role.openapi({ description: "The roles to assign to the user" })),
		])
		.openapi({
			description:
				'The role(s) to assign to the new member. It can be `admin`, `member`, or `guest`. Eg: "member"',
		}),
	organizationId: memberSchema.shape.organizationId.optional(),
	teamId: z
		.string()
		.openapi({
			description: 'An optional team ID to add the member to. Eg: "team-id"',
		})
		.optional(),
});

/**
 * Schema for updating member role
 */
export const updateMemberRoleSchema = z.object({
	role: z
		.union([
			role.openapi({ description: "The role to assign to the user" }),
			z.array(role.openapi({ description: "The roles to assign to the user" })),
		])
		.openapi({
			description:
				'The role(s) to assign to the member. It can be `admin`, `member`, or `guest`. Eg: "member"',
		}),
	memberId: memberSchema.shape.id
		.unwrap()
		.openapi({ description: "The member ID to apply the role update to" }),
	organizationId: memberSchema.shape.organizationId.optional(),
});

/**
 * Schema for removing a member
 */
export const removeMemberSchema = z.object({
	memberIdOrEmail: z
		.string()
		.openapi({ description: "The ID or email of the member to remove" }),
	organizationId: memberSchema.shape.organizationId.optional(),
});

/**
 * Schema for member response with pagination
 */
export const memberListResponseSchema = z
	.object({ members: z.array(memberWithUserSchema), total: z.number() })
	.openapi({ description: "Paginated list of organization members" });

/**
 * Schema for listing members query parameters
 */
export const listMembersQuerySchema = z.object({
	limit: z
		.string()
		.or(z.number())
		.openapi({ description: "The number of members to return" })
		.optional(),
	offset: z
		.string()
		.or(z.number())
		.openapi({ description: "The offset to start from" })
		.optional(),
	sortBy: z
		.string()
		.openapi({ description: "The field to sort by" })
		.optional(),
	sortDirection: z
		.enum(["asc", "desc"])
		.openapi({ description: "The direction to sort by" })
		.optional(),
	filterField: z
		.string()
		.openapi({ description: "The field to filter by" })
		.optional(),
	filterValue: z
		.string()
		.or(z.number())
		.or(z.boolean())
		.openapi({ description: "The value to filter by" })
		.optional(),
	filterOperator: z
		.enum(["eq", "ne", "lt", "lte", "gt", "gte", "contains"])
		.openapi({ description: "The operator to use for the filter" })
		.optional(),
	organizationId: z
		.string()
		.openapi({
			description:
				"The organization ID to list members for. If not provided, will default to the user's active organization.",
		})
		.optional(),
});

/**
 * Schema for leave organization
 */
export const leaveOrganizationSchema = z.object({
	organizationId: memberSchema.shape.organizationId.openapi({
		description: "The organization ID to leave",
	}),
});
