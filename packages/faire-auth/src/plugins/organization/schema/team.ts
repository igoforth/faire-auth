import { dateOrIsoStringSchema } from "@faire-auth/core/factory";
import * as z from "zod";
import { teamMemberSchema, teamSchema } from "./base";

/**
 * Base schema for creating a team
 */
export const createTeamBaseSchema = z.object({
	name: teamSchema.shape.name,
	organizationId: teamSchema.shape.organizationId.optional(),
});

/**
 * Schema for requesting team removal
 */
export const removeTeamSchema = z.object({
	teamId: teamSchema.shape.id
		.unwrap()
		.openapi({ description: "The team ID of the team to remove" }),
	organizationId: teamSchema.shape.organizationId.optional(),
});

/**
 * Schema for updating a team
 */
export const updateTeamSchema = z.object({
	teamId: teamSchema.shape.id
		.unwrap()
		.openapi({ description: "The ID of the team to be updated" }),
	data: teamSchema.omit({ id: true, createdAt: true, updatedAt: true }),
});

/**
 * Schema for setting active team
 */
export const setActiveTeamSchema = z.object({
	teamId: teamSchema.shape.id.unwrap().nullish().openapi({
		description:
			"The team id to set as active. It can be null to unset the active team",
	}),
});

/**
 * Schema for team list response
 */
export const teamListResponseSchema = z.array(teamSchema);

/**
 * Schema for listing teams query
 */
export const listTeamsQuerySchema = z.object({
	organizationId: teamSchema.shape.organizationId.optional(),
});

/**
 * Schema for listing team members query
 */
export const listTeamMembersQuerySchema = z.object({
	teamId: teamSchema.shape.id.unwrap().optional().openapi({
		description:
			"The team whose members we should return. If this is not provided the members of the current active team get returned.",
	}),
});

/**
 * Schema for adding team member
 */
export const addTeamMemberSchema = z.object({
	teamId: teamMemberSchema.shape.teamId.openapi({
		description: "The team the user should be a member of",
	}),
	userId: teamMemberSchema.shape.userId.openapi({
		description:
			"The user ID which represents the user to be added as a member",
	}),
});

/**
 * Schema for removing team member
 */
export const removeTeamMemberSchema = z.object({
	teamId: teamMemberSchema.shape.teamId.openapi({
		description: "The team the user should be removed from",
	}),
	userId: teamMemberSchema.shape.userId.openapi({
		description: "The user which should be removed from the team",
	}),
});

/**
 * Schema for team member response
 */
export const teamMemberResponseSchema = z.object({
	id: z
		.string()
		.openapi({ description: "Unique identifier for the team member" }),
	userId: z
		.string()
		.openapi({ description: "ID of the user who is a member of the team" }),
	teamId: z
		.string()
		.openapi({ description: "ID of the team this member belongs to" }),
	createdAt: dateOrIsoStringSchema.openapi({
		description: "Timestamp when the member was added to the team",
	}),
});

/**
 * Schema for team member list response
 */
export const teamMemberListResponseSchema = z
	.array(teamMemberResponseSchema)
	.openapi({ description: "List of team members" });
