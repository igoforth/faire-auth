import type {
	AccountInput,
	SessionInput,
	UserInput,
	VerificationInput,
} from "@faire-auth/core/db";
import type { DBAdapter, Where } from "@faire-auth/core/db/adapter";
import type { OmitId } from "@faire-auth/core/types";
import { getContext } from "../context/hono";
import { getCurrentAdapter } from "../context/transaction";
import type { FaireAuthOptions } from "../types";

type BaseModels = keyof NonNullable<FaireAuthOptions["databaseHooks"]>;
type ModelShape = {
	[K in BaseModels]: K extends "user"
		? UserInput
		: K extends "session"
			? SessionInput
			: K extends "account"
				? AccountInput
				: K extends "verification"
					? VerificationInput
					: unknown;
};

type ModelFn<
	M extends BaseModels,
	Op extends "create" | "update" | "delete",
> = Exclude<
	Exclude<
		Exclude<
			Exclude<FaireAuthOptions["databaseHooks"], undefined>[M],
			undefined
		>[Op],
		undefined
	>["before"],
	undefined
> extends (
	...args: [infer Model extends Partial<ModelShape[M]>, ...any[]]
) => Promise<infer Return>
	? {
			arg: Model;
			ret: Return extends any
				? Return extends { data: infer D }
					? D
					: never
				: never;
		}
	: never;

export const getWithHooks = (
	adapter: DBAdapter<FaireAuthOptions>,
	hooks: Exclude<FaireAuthOptions["databaseHooks"], undefined>[] = [],
) => ({
	async createWithHooks<M extends BaseModels>(
		data: OmitId<ModelFn<M, "create">["arg"]>,
		model: M,
		customCreateFn?:
			| {
					fn: (
						data: OmitId<ModelFn<M, "create">["arg"]>,
					) => Promise<ModelFn<M, "create">["ret"] | void>;
					executeMainFn?: boolean;
			  }
			| undefined,
	): Promise<ModelFn<M, "create">["ret"] | null> {
		const ctx = getContext();
		let actualData = data;
		for (const hook of hooks) {
			const toRun = hook[model]?.create?.before;
			if (toRun) {
				const result = await toRun(actualData as any, ctx);
				if (result === false) return null;

				const isObject = typeof result === "object" && "data" in result;
				if (isObject) {
					actualData = {
						...actualData,
						...result.data,
					};
				}
			}
		}

		const customCreated = customCreateFn
			? await customCreateFn.fn(actualData)
			: null;
		const created =
			!customCreateFn || customCreateFn.executeMainFn
				? await getCurrentAdapter(adapter).create<
						ModelFn<M, "create">["arg"],
						ModelFn<M, "create">["ret"]
					>({
						model,
						data: actualData,
						forceAllowId: true,
					})
				: customCreated!;

		for (const hook of hooks) {
			const toRun = hook[model]?.create?.after;
			if (toRun) await toRun(created, ctx);
		}

		return created;
	},
	async updateWithHooks<M extends BaseModels>(
		data: ModelFn<M, "update">["arg"],
		where: Where[],
		model: M,
		customUpdateFn?:
			| {
					fn: (
						data: ModelFn<M, "update">["arg"],
					) => Promise<ModelFn<M, "update">["ret"] | void>;
					executeMainFn?: boolean;
			  }
			| undefined,
	): Promise<ModelFn<M, "update">["ret"] | null> {
		const ctx = getContext();
		let actualData = data;

		for (const hook of hooks) {
			const toRun = hook[model]?.update?.before;
			if (toRun) {
				const result = await toRun(data as any, ctx);
				if (result === false) return null;

				const isObject = typeof result === "object";
				actualData = isObject ? result.data : (result as any);
			}
		}

		const customUpdated = customUpdateFn
			? await customUpdateFn.fn(actualData)
			: null;

		const updated =
			!customUpdateFn || customUpdateFn.executeMainFn
				? await getCurrentAdapter(adapter).update<ModelFn<M, "update">["ret"]>({
						model,
						update: actualData,
						where,
					})
				: customUpdated!;

		for (const hook of hooks) {
			const toRun = hook[model]?.update?.after;
			if (toRun) await toRun(updated as any, ctx);
		}
		return updated;
	},
	async updateManyWithHooks<M extends BaseModels>(
		data: ModelFn<M, "update">["arg"],
		where: Where[],
		model: M,
		customUpdateFn?:
			| {
					fn: (
						data: ModelFn<M, "update">["arg"],
					) => Promise<ModelFn<M, "update">["ret"] | void>;
					executeMainFn?: boolean;
			  }
			| undefined,
	): Promise<number | ModelFn<M, "update">["ret"] | null> {
		const ctx = getContext();
		let actualData = data;

		for (const hook of hooks) {
			const toRun = hook[model]?.update?.before;
			if (toRun) {
				const result = await toRun(data as any, ctx);
				if (result === false) return null;

				const isObject = typeof result === "object";
				actualData = isObject ? (result as any).data : result;
			}
		}

		const customUpdated = customUpdateFn
			? await customUpdateFn.fn(actualData)
			: null;

		const updated =
			!customUpdateFn || customUpdateFn.executeMainFn
				? await getCurrentAdapter(adapter).updateMany({
						model,
						update: actualData,
						where,
					})
				: customUpdated!;

		for (const hook of hooks) {
			const toRun = hook[model]?.update?.after;
			if (toRun) await toRun(updated as any, ctx);
		}

		return updated;
	},
	async deleteWithHooks<M extends BaseModels>(
		where: Where[],
		model: M,
		customDeleteFn?:
			| {
					fn: (where: Where[]) => Promise<void>;
					executeMainFn?: boolean;
			  }
			| undefined,
	): Promise<void | null> {
		const ctx = getContext();
		let entityToDelete: ModelFn<M, "delete">["ret"] | null = null;

		try {
			const entities = await getCurrentAdapter(adapter).findMany<
				ModelFn<M, "delete">["ret"]
			>({
				model,
				where,
				limit: 1,
			});
			entityToDelete = entities[0] ?? null;
		} catch (error) {
			// If we can't find the entity, we'll still proceed with deletion
		}

		if (entityToDelete) {
			for (const hook of hooks) {
				const toRun = hook[model]?.delete?.before;
				if (toRun) {
					const result = await toRun(entityToDelete, ctx);
					if (result === false) return null;
				}
			}
		}

		const customDeleted = customDeleteFn
			? await customDeleteFn.fn(where)
			: null;

		const deleted =
			!customDeleteFn || customDeleteFn.executeMainFn
				? await getCurrentAdapter(adapter).delete<ModelFn<M, "delete">["ret"]>({
						model,
						where,
					})
				: customDeleted!;

		if (entityToDelete) {
			for (const hook of hooks) {
				const toRun = hook[model]?.delete?.after;
				if (toRun) await toRun(entityToDelete, ctx);
			}
		}

		return deleted;
	},
	async deleteManyWithHooks<M extends BaseModels>(
		where: Where[],
		model: M,
		customDeleteFn?:
			| {
					fn: (where: Where[]) => Promise<void>;
					executeMainFn?: boolean;
			  }
			| undefined,
	): Promise<number | void | null> {
		const ctx = getContext();
		let entitiesToDelete: ModelFn<M, "delete">["ret"][] = [];

		try {
			entitiesToDelete = await getCurrentAdapter(adapter).findMany<
				ModelFn<M, "delete">["ret"]
			>({
				model,
				where,
			});
		} catch (error) {
			// If we can't find the entities, we'll still proceed with deletion
		}

		for (const entity of entitiesToDelete) {
			for (const hook of hooks) {
				const toRun = hook[model]?.delete?.before;
				if (toRun) {
					const result = await toRun(entity, ctx);
					if (result === false) return null;
				}
			}
		}

		const customDeleted = customDeleteFn
			? await customDeleteFn.fn(where)
			: null;

		const deleted =
			!customDeleteFn || customDeleteFn.executeMainFn
				? await getCurrentAdapter(adapter).deleteMany({
						model,
						where,
					})
				: customDeleted!;

		for (const entity of entitiesToDelete) {
			for (const hook of hooks) {
				const toRun = hook[model]?.delete?.after;
				if (toRun) await toRun(entity, ctx);
			}
		}

		return deleted;
	},
});
