import type { FaireAuthPluginDBSchema } from "@faire-auth/core/db";
import type { OrganizationOptions } from "../types";

type InferSchema<
	Schema extends FaireAuthPluginDBSchema,
	TableName extends string,
	DefaultFields,
> = {
	modelName: Schema[TableName] extends { modelName: infer M }
		? M extends string
			? M
			: string
		: string;
	fields: {
		[K in keyof DefaultFields]: DefaultFields[K];
	} & (Schema[TableName] extends { additionalFields: infer F } ? F : {});
};

interface OrganizationRoleDefaultFields {
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	role: {
		type: "string";
		required: true;
	};
	permission: {
		type: "string";
		required: true;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface TeamDefaultFields {
	name: {
		type: "string";
		required: true;
	};
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	createdAt: {
		type: "date";
		required: true;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface TeamMemberDefaultFields {
	teamId: {
		type: "string";
		required: true;
		references: {
			model: "team";
			field: "id";
		};
	};
	userId: {
		type: "string";
		required: true;
		references: {
			model: "user";
			field: "id";
		};
	};
	createdAt: {
		type: "date";
		required: false;
	};
}

interface OrganizationDefaultFields {
	name: {
		type: "string";
		required: true;
		sortable: true;
	};
	slug: {
		type: "string";
		required: true;
		unique: true;
		sortable: true;
	};
	logo: {
		type: "string";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
	};
	updatedAt: {
		type: "date";
		required: false;
	};
}

interface MemberDefaultFields {
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	userId: {
		type: "string";
		required: true;
		references: {
			model: "user";
			field: "id";
		};
	};
	role: {
		type: "string";
		required: true;
		defaultValue: "member";
	};
	createdAt: {
		type: "date";
		required: true;
	};
}

interface InvitationDefaultFields {
	organizationId: {
		type: "string";
		required: true;
		references: {
			model: "organization";
			field: "id";
		};
	};
	email: {
		type: "string";
		required: true;
		sortable: true;
	};
	role: {
		type: "string";
		required: true;
		sortable: true;
	};
	status: {
		type: "string";
		required: true;
		sortable: true;
		defaultValue: "pending";
	};
	expiresAt: {
		type: "date";
		required: false;
	};
	createdAt: {
		type: "date";
		required: true;
		defaultValue: Date;
	};
	inviterId: {
		type: "string";
		required: true;
		references: {
			model: "user";
			field: "id";
		};
	};
}

interface SessionDefaultFields {
	activeOrganizationId: {
		type: "string";
		required: false;
	};
}

export type OrganizationSchema<O extends OrganizationOptions> =
	O["dynamicAccessControl"] extends { enabled: true }
		? {
				organizationRole: InferSchema<
					O["schema"] extends FaireAuthPluginDBSchema ? O["schema"] : {},
					"organizationRole",
					OrganizationRoleDefaultFields
				>;
			}
		: {} & (O["teams"] extends { enabled: true }
				? {
						team: InferSchema<
							O["schema"] extends FaireAuthPluginDBSchema ? O["schema"] : {},
							"team",
							TeamDefaultFields
						>;
						teamMember: InferSchema<
							O["schema"] extends FaireAuthPluginDBSchema ? O["schema"] : {},
							"teamMember",
							TeamMemberDefaultFields
						>;
					}
				: {}) & {
					organization: InferSchema<
						O["schema"] extends FaireAuthPluginDBSchema ? O["schema"] : {},
						"organization",
						OrganizationDefaultFields
					>;
					member: InferSchema<
						O["schema"] extends FaireAuthPluginDBSchema ? O["schema"] : {},
						"member",
						MemberDefaultFields
					>;
					invitation: {
						modelName: O["schema"] extends FaireAuthPluginDBSchema
							? InferSchema<
									O["schema"],
									"invitation",
									InvitationDefaultFields
								>["modelName"]
							: string;
						fields: InferSchema<
							O["schema"] extends FaireAuthPluginDBSchema ? O["schema"] : {},
							"invitation",
							InvitationDefaultFields
						>["fields"] &
							(O extends { teams: { enabled: true } }
								? {
										teamId: {
											type: "string";
											required: false;
											sortable: true;
										};
									}
								: {});
					};
					session: {
						fields: InferSchema<
							O["schema"] extends FaireAuthPluginDBSchema ? O["schema"] : {},
							"session",
							SessionDefaultFields
						>["fields"] &
							(O["teams"] extends { enabled: true }
								? {
										activeTeamId: {
											type: "string";
											required: false;
										};
									}
								: {});
					};
				};
