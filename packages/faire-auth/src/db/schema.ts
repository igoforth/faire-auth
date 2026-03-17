import type {
	Account,
	DBFieldAttribute,
	FaireAuthPluginDBSchema,
	Session,
	User,
} from "@faire-auth/core/db";
import type { FaireAuthOptions } from "../types";
import { getContext } from "../context/hono";
import { False } from "@faire-auth/core/static";

// Cache for parsed schemas to avoid reparsing on every request
const cache = new WeakMap<
	Pick<FaireAuthOptions, "user" | "session" | "plugins">,
	Map<string, Record<string, DBFieldAttribute>>
>();

function parseOutputData<T extends Record<string, any>>(
	data: T,
	schema: {
		fields: Record<string, DBFieldAttribute>;
	},
) {
	const fields = schema.fields;
	const parsedData: Record<string, any> = {};
	for (const key in data) {
		const field = fields[key];
		if (!field) {
			parsedData[key] = data[key];
			continue;
		}
		if (field.returned === false) continue;
		parsedData[key] = data[key];
	}
	return parsedData as T;
}

function getAllFields(
	options: Pick<FaireAuthOptions, "user" | "session" | "plugins">,
	table: string,
) {
	if (!cache.has(options)) cache.set(options, new Map());
	const tableCache = cache.get(options)!;
	if (tableCache.has(table)) return tableCache.get(table)!;
	let schema: Record<string, DBFieldAttribute> = {
		...(table === "user" ? options.user?.additionalFields : {}),
		...(table === "session" ? options.session?.additionalFields : {}),
	};
	for (const plugin of options.plugins ?? []) {
		if (plugin.schema && plugin.schema[table]) {
			schema = {
				...schema,
				...plugin.schema[table].fields,
			};
		}
	}
	cache.get(options)!.set(table, schema);
	return schema;
}

export function parseUserOutput(
	options: Pick<FaireAuthOptions, "user" | "plugins">,
	user: User,
) {
	const schema = getAllFields(options, "user");
	return parseOutputData(user, { fields: schema });
}

export function parseAccountOutput(
	options: Pick<FaireAuthOptions, "plugins">,
	account: Account,
) {
	const schema = getAllFields(options, "account");
	return parseOutputData(account, { fields: schema });
}

export function parseSessionOutput(
	options: Pick<FaireAuthOptions, "session" | "plugins">,
	session: Session,
) {
	const schema = getAllFields(options, "session");
	return parseOutputData(session, { fields: schema });
}

export function parseInputData<T extends Record<string, any>>(
	data: T,
	schema: {
		fields: Record<string, DBFieldAttribute>;
		action?: ("create" | "update") | undefined;
	},
) {
	const ctx = getContext();
	const action = schema.action || "create";
	const fields = schema.fields;
	const parsedData: Record<string, any> = Object.assign(
		Object.create(null),
		null,
	);
	let fieldError: Response | undefined;
	for (const key in fields) {
		if (key in data) {
			if (fields[key]!.input === false) {
				if (fields[key]!.defaultValue !== undefined) {
					if (action !== "update") {
						parsedData[key] = fields[key]!.defaultValue;
						continue;
					}
				}
				if (data[key]) {
					fieldError = ctx.render(
						{ success: False, message: `${key} is not allowed to be set` },
						400,
					) as unknown as Response;
					break;
				}
				continue;
			}
			if (fields[key]!.validator?.input && data[key] !== undefined) {
				parsedData[key] = fields[key]!.validator.input["~standard"].validate(
					data[key],
				);
				continue;
			}
			if (fields[key]!.transform?.input && data[key] !== undefined) {
				parsedData[key] = fields[key]!.transform?.input(data[key]);
				continue;
			}
			parsedData[key] = data[key];
			continue;
		}

		if (fields[key]!.defaultValue !== undefined && action === "create") {
			parsedData[key] = fields[key]!.defaultValue;
			continue;
		}

		if (fields[key]!.required && action === "create") {
			fieldError = ctx.render(
				{ success: False, message: `${key} is required` },
				400,
			) as unknown as Response;
			break;
		}
	}
	if (fieldError) return fieldError;
	return parsedData as Partial<T>;
}

export function parseUserInput(
	options: Pick<FaireAuthOptions, "user" | "plugins">,
	user: Record<string, any> = {},
	action: "create" | "update",
) {
	const schema = getAllFields(options, "user");
	return parseInputData(user, { fields: schema, action });
}

export function parseAdditionalUserInput(
	options: Pick<FaireAuthOptions, "user" | "plugins">,
	user?: Record<string, any>,
) {
	const schema = getAllFields(options, "user");
	return parseInputData(user || {}, { fields: schema });
}

export function parseAccountInput(
	options: Pick<FaireAuthOptions, "plugins">,
	account: Partial<Account>,
) {
	const schema = getAllFields(options, "account");
	return parseInputData(account, { fields: schema });
}

export function parseSessionInput(
	options: Pick<FaireAuthOptions, "session" | "plugins">,
	session: Partial<Session>,
) {
	const schema = getAllFields(options, "session");
	return parseInputData(session, { fields: schema });
}

export function mergeSchema<S extends FaireAuthPluginDBSchema>(
	schema: S,
	newSchema?: {
		[K in keyof S]?: {
			modelName?: string | undefined;
			fields?:
				| {
						[P: string]: string;
				  }
				| undefined;
		};
	},
) {
	if (!newSchema) return schema;
	for (const table in newSchema) {
		const newModelName = newSchema[table]?.modelName;
		if (newModelName) schema[table]!.modelName = newModelName;
		for (const field in schema[table]!.fields) {
			const newField = newSchema[table]?.fields?.[field];
			if (!newField) continue;
			schema[table]!.fields[field]!.fieldName = newField;
		}
	}
	return schema;
}
