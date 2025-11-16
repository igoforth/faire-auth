import { Hono } from "hono";
import type { Context } from "hono";
import { contextStorage } from "hono/context-storage";

export const getTestContext = async <V extends Record<string, any>>(
	req: Request = new Request("http://localhost:3000"),
	variables?: V,
): Promise<Context<{ Variables: V }>> => {
	let c: Context;

	// Create a temporary Hono app to capture the context
	await new Hono()
		.use("*", async (ctx) => {
			if (variables)
				Object.entries(variables).forEach(([k, v]) => ctx.set(k as any, v));
			c = ctx;
			return ctx.text("");
		})
		.request(req);

	return c!;
};

export const runWithContext = async <T, V extends Record<string, any> = {}>(
	variables: V = {} as V,
	callback: (ctx: Context<{ Variables: V }>) => T | Promise<T>,
): Promise<T> => {
	let result: T;

	await new Hono<{ Variables: V }>()
		.use("*", contextStorage(), async (ctx) => {
			if (variables)
				Object.entries(variables).forEach(([k, v]) => ctx.set(k as any, v));
			result = await callback(ctx as any);
			return ctx.text("");
		})
		.request(new Request("http://localhost:3000"));

	return result!;
};
