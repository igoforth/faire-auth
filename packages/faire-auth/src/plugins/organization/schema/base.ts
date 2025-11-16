import { dateOrIsoStringSchema, emailSchema } from "@faire-auth/core/factory";
import * as z from "zod";
import { generateId } from "../../../utils";

export const role = z.string().openapi({
	description:
		"Role identifier for organization members (e.g., admin, member, owner)",
});
export const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending")
	.openapi({ description: "Status of an invitation to join an organization" });

const defaultRoles = ["admin", "member", "owner"] as const;
export const defaultRolesSchema = z
	.union([z.enum(defaultRoles), z.array(z.enum(defaultRoles))])
	.openapi({ description: "Default role options for organization members" });

export const organizationSchema = z.looseObject({
	id: z
		.string()
		.default(generateId)
		.openapi({ description: "Unique identifier for the organization" }),
	name: z.string().openapi({ description: "Display name of the organization" }),
	slug: z
		.string()
		.openapi({ description: "URL-friendly slug for the organization" }),
	logo: z
		.string()
		.nullish()
		.openapi({ description: "URL or path to the organization logo image" }),
	metadata: z
		.record(z.string(), z.unknown())
		.or(z.string().transform((v) => JSON.parse(v) as Record<string, unknown>))
		// TODO: changed from .optional(), fixed a unit test but idk if best
		.nullish()
		.openapi({
			description:
				"Additional metadata for the organization as key-value pairs",
		}),
	createdAt: dateOrIsoStringSchema.openapi({
		description: "Timestamp when the organization was created",
	}),
});

export const organizationRoleSchema = z.looseObject({
	id: z.string().default(generateId),
	organizationId: z.string(),
	role: z.string(),
	permission: z.record(z.string(), z.array(z.string())),
	createdAt: dateOrIsoStringSchema.default(() => new Date()),
	updatedAt: dateOrIsoStringSchema.optional(),
});

export const memberSchema = z.looseObject({
	id: z
		.string()
		.default(generateId)
		.openapi({ description: "Unique identifier for the organization member" }),
	organizationId: z
		.string()
		.openapi({ description: "ID of the organization this member belongs to" }),
	userId: z.coerce.string().openapi({
		description: "ID of the user who is a member of the organization",
	}),
	role,
	createdAt: dateOrIsoStringSchema
		.default(() => new Date())
		.openapi({
			description: "Timestamp when the member was added to the organization",
		}),
});

export const invitationSchema = z.looseObject({
	id: z
		.string()
		.default(generateId)
		.openapi({ description: "Unique identifier for the invitation" }),
	organizationId: z
		.string()
		.openapi({ description: "The organization ID to invite the user to" }),
	email: emailSchema.openapi({
		description: "The email address of the user to invite",
	}),
	role: role.openapi({
		description:
			'The role(s) to assign to the user. It can be `admin`, `member`, or `guest`. Eg: "member"',
	}),
	status: invitationStatus,
	teamId: z
		.string()
		.optional()
		.openapi({ description: "The team ID to invite the user to" }),
	inviterId: z
		.string()
		.openapi({ description: "ID of the user who sent the invitation" }),
	expiresAt: dateOrIsoStringSchema.openapi({
		description: "Timestamp when the invitation expires",
	}),
});

export const teamSchema = z.looseObject({
	id: z
		.string()
		.default(generateId)
		.openapi({ description: "Unique identifier of the team" }),
	name: z.string().min(1).openapi({ description: "Name of the team" }),
	organizationId: z
		.string()
		.openapi({ description: "ID of the organization the team belongs to" }),
	createdAt: dateOrIsoStringSchema.openapi({
		description: "Timestamp when the team was created",
	}),
	updatedAt: dateOrIsoStringSchema
		.optional()
		.openapi({ description: "Timestamp when the team was last updated" }),
});

export const teamMemberSchema = z.looseObject({
	id: z
		.string()
		.default(generateId)
		.openapi({ description: "Unique identifier for the team member" }),
	teamId: z
		.string()
		.openapi({ description: "ID of the team this member belongs to" }),
	userId: z
		.string()
		.openapi({ description: "ID of the user who is a member of the team" }),
	createdAt: dateOrIsoStringSchema
		.default(() => new Date())
		.openapi({
			description: "Timestamp when the member was added to the team",
		}),
});
