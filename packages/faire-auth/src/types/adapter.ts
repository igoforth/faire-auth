import type {
	DBAdapter,
	DBAdapterInstance,
	DBAdapterSchemaCreation,
	DBTransactionAdapter,
	Where,
} from "@faire-auth/core/db/adapter";

export type {
	DBAdapter,
	DBAdapterInstance,
	DBAdapterSchemaCreation,
	DBTransactionAdapter,
} from "@faire-auth/core/db/adapter";

export type { Where };

/**
 * Adapter Interface
 *
 * @deprecated Use `DBAdapter` from `@faire-auth/core/db/adapter` instead.
 */
export type Adapter = DBAdapter;

/**
 * @deprecated Use `DBTransactionAdapter` from `@faire-auth/core/db/adapter` instead.
 */
export type TransactionAdapter = DBTransactionAdapter;

/**
 * @deprecated Use `DBAdapterSchemaCreation` from `@faire-auth/core/db/adapter` instead.
 */
export type AdapterSchemaCreation = DBAdapterSchemaCreation;

/**
 * @deprecated Use `DBAdapterInstance` from `@faire-auth/core/db/adapter` instead.
 */
export type AdapterInstance = DBAdapterInstance;
