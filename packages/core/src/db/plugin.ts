import type { DBFieldAttribute } from "./type";

export type FaireAuthPluginDBSchema = {
	[table in string]: {
		fields: {
			[field: string]: DBFieldAttribute;
		};
		disableMigration?: boolean | undefined;
		modelName?: string | undefined;
	};
};
