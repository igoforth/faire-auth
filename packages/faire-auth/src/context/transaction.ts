import type {
	DBAdapter,
	DBTransactionAdapter,
} from "@faire-auth/core/db/adapter";
import { AsyncLocalStorage } from "node:async_hooks";

import { getContext } from "./hono";

/**
 * @internal
 */
const currentAdapterAsyncStorage =
	new AsyncLocalStorage<DBTransactionAdapter>();

/*
 * Only need to pass in adapter if outside request context
 */
export const getCurrentAdapter = (
	adapter?: DBTransactionAdapter,
): DBTransactionAdapter =>
	currentAdapterAsyncStorage.getStore() ??
	adapter ??
	getContext().get("context").adapter;

export const runWithAdapter = <R>(
	adapter: DBAdapter,
	fn: () => R | Promise<R>,
) => currentAdapterAsyncStorage.run(adapter, fn);

export const runWithTransaction = <R>(
	adapter: DBAdapter,
	fn: () => R | Promise<R>,
) => adapter.transaction((trx) => currentAdapterAsyncStorage.run(trx, fn));
