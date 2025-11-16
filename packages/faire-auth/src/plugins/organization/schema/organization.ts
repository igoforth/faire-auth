import * as z from "zod";
import {
	invitationSchema,
	memberSchema,
	organizationSchema,
	teamSchema,
} from "./base";
import { memberWithUserSchema } from "./member";

/**
 * Base schema for creating an organization
 */
export const createOrganizationBaseSchema = z.object({
	name: organizationSchema.shape.name,
	slug: organizationSchema.shape.slug,
	userId: z
		.string()
		.openapi({
			description:
				"The user id of the organization creator. If not provided, the current user will be used. Should only be used by admins or when called by the server. server-only.",
		})
		.optional(),
	logo: organizationSchema.shape.logo.unwrap().optional(),
	metadata: organizationSchema.shape.metadata,
	keepCurrentActiveOrganization: z
		.boolean()
		.openapi({
			description:
				"Whether to keep the current active organization active after creating a new one",
		})
		.optional(),
});

/**
 * Schema for updating an organization
 */
export const updateOrganizationSchema = z.object({
	data: z.object({
		name: organizationSchema.shape.name,
		slug: organizationSchema.shape.slug,
		logo: organizationSchema.shape.logo.unwrap().unwrap(),
		metadata: organizationSchema.shape.metadata.unwrap().unwrap(),
	}),
	organizationId: z
		.string()
		.openapi({ description: "The organization ID" })
		.optional(),
});

/**
 * Schema for organization response with members
 */
export const organizationWithMembersSchema = organizationSchema
	.extend({ members: z.array(memberSchema) })
	.openapi({
		description: "Organization details including member information",
	});

/**
 * Schema for checking if a slug is available
 */
export const checkOrganizationSlugSchema = z.object({
	slug: z.string().openapi({ description: "The organization slug to check" }),
});

/**
 * Schema for getting organization details
 */
export const getFullOrganizationQuerySchema = z.object({
	organizationId: z
		.string()
		.openapi({ description: "The organization id to get" })
		.optional(),
	organizationSlug: z
		.string()
		.openapi({ description: "The organization slug to get" })
		.optional(),
	membersLimit: z
		.number()
		.or(z.string().transform((val) => parseInt(val)))
		.openapi({
			description:
				"The limit of members to get. By default, it uses the membershipLimit option which defaults to 100.",
		})
		.optional(),
});

/**
 * Schema for full organization details
 */
export const fullOrganizationSchema = organizationSchema
	.extend({
		members: z.array(memberWithUserSchema),
		invitations: z.array(invitationSchema),
		teams: z.array(teamSchema).nullable(),
	})
	.openapi({
		description:
			"Complete organization details with members, invitations, and teams",
	});

/**
 * Schema for organization list response
 */
export const organizationListResponseSchema = z
	.array(organizationSchema)
	.openapi({ description: "List of organizations" });

/**
 * Schema for setting active organization
 */
export const setActiveOrganizationSchema = z.object({
	organizationId: z
		.string()
		.nullable()
		.openapi({
			description:
				"The organization id to set as active. It can be null to unset the active organization.",
		})
		.optional(),
	organizationSlug: z
		.string()
		.openapi({
			description:
				"The organization slug to set as active. It can be null to unset the active organization if organizationId is not provided.",
		})
		.optional(),
});

/**
 * Schema for deleting organization
 */
export const deleteOrganizationSchema = z.object({
	organizationId: z
		.string()
		.openapi({ description: "The organization id to delete" }),
});

/**
 * Response schema for deleted organization
 */
export const deleteOrganizationResponseSchema = z.string().openapi({
	description: "ID of the organization that was successfully deleted",
});
