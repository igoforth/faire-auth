import { describe, expectTypeOf } from "vitest";
import { createTestEndpoint } from "../../test-utils/test-endpoint";
import { createMiddleware } from "./middleware";
import { createRoute } from "@faire-auth/core/factory";

describe("type", (test) => {
	test("should infer middleware environment type", async ({ expect }) => {
		const middleware = createMiddleware<{ test: 1 }>()(
			async (_ctx, next) => await next(),
		);
		const middleware2 = createMiddleware<{ hello: "world" }>()(
			async (_ctx, next) => await next(),
		);
		createTestEndpoint(
			createRoute({
				operationId: "test",
				path: "/",
				method: "post",
				middleware: [middleware, middleware2],
				responses: { 200: { description: "Success" } },
			}),
			() => async (ctx) => {
				expectTypeOf(ctx.var).toExtend<{ hello: string; test: number }>();
				return ctx.newResponse(null, 200);
			},
		);
	});

	test("should infer middleware returned type", async ({ expect }) => {
		const middleware = createMiddleware()(async (ctx) =>
			ctx.json({ test: 1 }, 200),
		);
		const middleware2 = createMiddleware()(async (ctx) =>
			ctx.json({ hello: "world" }, 200),
		);
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				path: "/",
				method: "post",
				middleware: [middleware, middleware2],
				responses: { 200: { description: "Success" } },
			}),
			() => async (ctx) => ctx.newResponse(null, 200),
		);

		const response = await execute();
		expectTypeOf(response).toExtend<
			Response | { test: number } | { hello: string }
		>();
	});
});

describe("runtime", (test) => {
	test("should run middleware", async ({ expect }) => {
		const middleware = createMiddleware()(async (ctx) =>
			ctx.json({ hello: "world" }, 200),
		);
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				path: "/test",
				method: "post",
				middleware: [middleware],
				responses: { 200: { description: "Success" } },
			}),
			() => async (ctx) => ctx.newResponse(null, 200),
		);
		const response = await execute();
		expect(response).toMatchObject({ hello: "world" });
	});

	test("should run multiple middleware", async ({ expect }) => {
		const middleware = createMiddleware<
			object,
			string,
			{ out: { json: { [x: string]: unknown } } }
		>()(async (ctx, next) => {
			ctx.req.addValidatedData("json", {
				...ctx.req.valid("json"),
				hello: "world",
			});
			return await next();
		});
		const middleware2 = createMiddleware<
			object,
			string,
			{ out: { json: { [x: string]: unknown } } }
		>()(async (ctx, next) => {
			ctx.req.addValidatedData("json", { ...ctx.req.valid("json"), test: 2 });
			return await next();
		});
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "test",
				path: "/test",
				method: "post",
				middleware: [middleware, middleware2],
				responses: { 200: { description: "Success" } },
			}),
			() => async (ctx) => ctx.json(ctx.req.valid("json" as never), 200),
		);
		const response = await execute();
		expect(response).toMatchObject({ hello: "world", test: 2 });
	});
});

// N/A
// creator pattern not necessary, contained in createMiddleware

// describe('creator', () => {
//   test('should use creator middleware', async () => {
//     const creator = createMiddleware()({
//       use: [createMiddleware(async (ctx) => ({ hello: 'world' }))],
//     })

//     const middleware = creator(async (c) => {
//       expectTypeOf(ctx.get("context")).toEqualTypeOf<{ hello: string }>()

//       return ctx.get("context")
//     })

//     const endpoint = createTestEndpoint(
//       '/',
//       { use: [middleware], method: 'GET' },
//       async (c) => ctx.get("context"),
//     )
//     const response = await endpoint()
//     expect(response).toMatchObject({ hello: 'world' })
//   })

//   test('should be able to combine with local middleware', async () => {
//     const creator = createMiddleware()({
//       use: [createMiddleware(async () => ({ hello: 'world' }))],
//     })
//     const middleware = creator(
//       { use: [createMiddleware(async () => ({ test: 'payload' }))] },
//       async (c) => ctx.get("context"),
//     )

//     const endpoint = createTestEndpoint(
//       '/path',
//       { use: [middleware], method: 'POST' },
//       async (c) => ctx.get("context"),
//     )
//     const response = await endpoint()
//     expect(response).toMatchObject({ hello: 'world', test: 'payload' })
//   })
// })
