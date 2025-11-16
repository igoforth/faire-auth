import type {
	InferAdditionalFieldsFromPluginOptions,
	Prettify,
} from "@faire-auth/core/types";
import type { z } from "zod";
import type { OrganizationOptions } from "../types";
import type {
	defaultRolesSchema,
	invitationSchema,
	memberSchema,
	organizationRoleSchema,
	organizationSchema,
	teamMemberSchema,
	teamSchema,
} from "./base";

export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.input<typeof invitationSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type TeamMemberInput = z.input<typeof teamMemberSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

type CustomRolesSchema<O> = O extends { roles: { [key: string]: any } }
	? z.ZodType<keyof O["roles"] | Array<keyof O["roles"]>>
	: typeof defaultRolesSchema;

export type InferOrganizationZodRolesFromOption<
	O extends OrganizationOptions | undefined,
> = CustomRolesSchema<O>;

export type InferOrganizationRolesFromOption<
	O extends OrganizationOptions | undefined,
> = O extends { roles: any }
	? keyof O["roles"] extends string
		? keyof O["roles"]
		: never
	: "admin" | "member" | "owner";

export type InvitationStatus = "pending" | "accepted" | "rejected" | "canceled";

export type InferMember<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	{
		id: string;
		organizationId: string;
		role: InferOrganizationRolesFromOption<O>;
		createdAt: Date;
		userId: string;
		user: { email: string; name: string; image?: string };
	} & (O["teams"] extends { enabled: true } ? { teamId?: string } : {}) &
		InferAdditionalFieldsFromPluginOptions<"member", O, isClientSide>
>;

export type InferOrganization<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Organization &
		InferAdditionalFieldsFromPluginOptions<"organization", O, isClientSide>
>;

export type InferTeam<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	Team & InferAdditionalFieldsFromPluginOptions<"team", O, isClientSide>
>;

export type InferInvitation<
	O extends OrganizationOptions,
	isClientSide extends boolean = true,
> = Prettify<
	{
		id: string;
		organizationId: string;
		email: string;
		role: InferOrganizationRolesFromOption<O>;
		status: InvitationStatus;
		inviterId: string;
		expiresAt: Date;
	} & (O["teams"] extends { enabled: true } ? { teamId?: string } : {}) &
		InferAdditionalFieldsFromPluginOptions<"invitation", O, isClientSide>
>;
