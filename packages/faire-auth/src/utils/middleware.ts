import { False, True } from "@faire-auth/core/static";
import type { Context, MiddlewareHandler, TypedResponse } from "hono";
import type {
	ContentfulStatusCode,
	SuccessStatusCode,
} from "hono/utils/http-status";
import type { ContextVars } from "../types/hono";

/**
 * Adds an item to a tuple if the item is not undefined
 * @param tuple - The original tuple
 * @param item - The item to add (can be undefined)
 * @returns The original tuple if item is undefined, otherwise a new tuple with the item appended
 */
export const addMiddlewareToTuple = <
	T extends readonly unknown[],
	U extends MiddlewareHandler,
>(
	tuple: T,
	item: U | undefined,
): U extends undefined ? T : [...T, U] => {
	if (item === undefined) return tuple as U extends undefined ? T : [...T, U];
	return [...tuple, item] as unknown as U extends undefined ? T : [...T, U];
};

interface Params<T extends ContentfulStatusCode> {
	message: string;
	status: T;
}

// TODO: this is used in hooks so render isn't active yet
// so we changed to json
export const middlewareResponse = <T extends ContentfulStatusCode>(
	ctx: Context<ContextVars>,
	{ message, status }: Params<T>,
): Response &
	TypedResponse<
		{
			success: T extends SuccessStatusCode ? true : false;
			message: string;
		},
		T,
		"json"
	> =>
	ctx.json(
		{
			success: (status > 200 && status < 400
				? True
				: False) as T extends SuccessStatusCode ? true : false,
			message,
		},
		status,
	) as any;
