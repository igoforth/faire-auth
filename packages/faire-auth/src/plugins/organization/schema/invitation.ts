import { emailSchema } from "@faire-auth/core/factory";
import * as z from "zod";
import { invitationSchema, memberSchema, role } from "./base";

/**
 * Schema for creating an invitation
 */
export const createInvitationSchema = z.object({
	email: invitationSchema.shape.email,
	role: z
		.union([
			role.openapi({ description: "The role to assign to the user" }),
			z.array(role.openapi({ description: "The roles to assign to the user" })),
		])
		.openapi({
			description:
				'The role(s) to assign to the user. It can be `admin`, `member`, or `guest`. Eg: "member"',
		}),
	organizationId: invitationSchema.shape.organizationId.optional(),
	resend: z
		.boolean()
		.openapi({
			description:
				"Resend the invitation email, if the user is already invited. Eg: true",
		})
		.optional(),
	teamId: z
		.union([
			invitationSchema.shape.teamId.unwrap(),
			z.array(invitationSchema.shape.teamId.unwrap()),
		])
		.optional(),
});

/**
 * Schema for accepting/rejecting/cancelling an invitation
 */
export const invitationRequestSchema = z.object({
	invitationId: invitationSchema.shape.id.unwrap().openapi({
		description: "The ID of the invitation to accept, reject, or cancel",
	}),
});

/**
 * Schema for accept/rejection response
 * Member is null in rejection response
 */
export const invitationResponseSchema = z
	.object({
		invitation: invitationSchema,
		member: memberSchema.nullable().default(null),
	})
	.openapi({
		description:
			"Response containing invitation details and optional member information",
	});

export const getInvitationQuerySchema = z.object({
	id: z.string().openapi({ description: "The ID of the invitation to get" }),
});

export const getInvitationResponseSchema = invitationSchema.extend({
	organizationName: z
		.string()
		.openapi({ description: "Name of the organization" }),
	organizationSlug: z
		.string()
		.openapi({ description: "URL-friendly slug of the organization" }),
	inviterEmail: emailSchema.openapi({
		description: "Email address of the user who sent the invitation",
	}),
});

/**
 * Schema for listing invitations query
 */
export const listInvitationsQuerySchema = z.object({
	organizationId: z
		.string()
		.openapi({
			description: "The ID of the organization to list invitations for",
		})
		.optional(),
});

/**
 * Schema for listing invitations query
 */
export const listInvitationsResponseSchema = z
	.array(invitationSchema)
	.openapi({ description: "List of invitations" });

/**
 * Schema for listing user invitations query
 */
export const listUserInvitationsQuerySchema = z.object({
	email: emailSchema
		.openapi({
			description:
				"The email of the user to list invitations for. This only works for server side API calls.",
		})
		.optional(),
});
