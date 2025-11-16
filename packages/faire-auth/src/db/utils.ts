import type { DBFieldAttribute } from "@faire-auth/core/db";
import type { DBAdapter } from "@faire-auth/core/db/adapter";
import { logger } from "@faire-auth/core/env";
import { FaireAuthError } from "@faire-auth/core/error";
import { isPromise } from "@faire-auth/core/static";
import { getAuthTables } from ".";
import { kyselyAdapter } from "../adapters/kysely-adapter";
import { createKyselyAdapter } from "../adapters/kysely-adapter/dialect";
import { type MemoryDB, memoryAdapter } from "../adapters/memory-adapter";
import type { FaireAuthOptions } from "../types";

function patchAdapterTransaction<O extends FaireAuthOptions>(
	adapter: DBAdapter<O>,
): DBAdapter<O> {
	if (!adapter.transaction) {
		logger.warn(
			"Adapter does not correctly implement transaction function, patching it automatically. Please update your adapter implementation.",
		);
		adapter.transaction = (cb) => {
			const res = cb(adapter);
			return isPromise(res) ? res : Promise.resolve(res);
		};
	}
	return adapter;
}

export function getAdapter(
	options: FaireAuthOptions,
): DBAdapter<FaireAuthOptions> {
	if (!options.database) {
		const tables = getAuthTables(options);
		const memoryDB = Object.keys(tables).reduce<MemoryDB>((acc, key) => {
			acc[key] = [];
			return acc;
		}, {});
		if (options.logger && options.logger.log)
			options.logger.log(
				"debug",
				"No database configuration provided. Using memory adapter in development",
			);
		else
			logger.debug(
				"No database configuration provided. Using memory adapter in development",
			);
		return patchAdapterTransaction(memoryAdapter(memoryDB)(options));
	}

	if (typeof options.database === "function")
		return patchAdapterTransaction(options.database(options));

	const adapter = createKyselyAdapter(options);
	const checkKysely = () => {
		if (!adapter.kysely)
			throw new FaireAuthError("Failed to initialize database adapter");
		return adapter.kysely;
	};

	return patchAdapterTransaction(
		kyselyAdapter(
			"initialize" in adapter
				? adapter.initialize().then(checkKysely)
				: checkKysely(),
			{
				type: adapter.databaseType ?? "sqlite",
				debugLogs:
					"debugLogs" in options.database! ? options.database.debugLogs : false,
				transaction: adapter.transaction,
			},
		)(options),
	);
}

export function convertToDB<T extends Record<string, any>>(
	fields: Record<string, DBFieldAttribute>,
	values: T,
) {
	let result: Record<string, any> = values.id
		? {
				id: values.id,
			}
		: {};
	for (const key in fields) {
		const field = fields[key]!;
		const value = values[key];
		if (value === undefined) {
			continue;
		}
		result[field.fieldName || key] = value;
	}
	return result as T;
}

export function convertFromDB<T extends Record<string, any>>(
	fields: Record<string, DBFieldAttribute>,
	values: T | null,
) {
	if (!values) {
		return null;
	}
	let result: Record<string, any> = {
		id: values.id,
	};
	for (const [key, value] of Object.entries(fields)) {
		result[key] = values[value.fieldName || key];
	}
	return result as T;
}
