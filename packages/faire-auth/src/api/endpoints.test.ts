import { APIError } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import { False } from "@faire-auth/core/static";
import { describe } from "vitest";
import * as z from "zod";
import { defineOptions } from "../auth";
import { init } from "../init";
import { getTestInstance } from "../test-utils";
import type { FaireAuthPlugin } from "../types/plugin";
import { setCookie } from "../utils/cookies";
import { createEndpoint } from "./factory/endpoint";
import { createHook } from "./factory/middleware";
import { router } from "./index";
import type { InferAPI, InferApp } from "./types";

describe("before hook", async (test) => {
	describe("context", async (test) => {
		const aPlugin = {
			id: "aPlugin",
			routes: {
				query: createEndpoint(
					createRoute({
						operationId: "query",
						method: "get",
						path: "/query",
						request: req().qry(z.looseObject({})).bld(),
						responses: res(z.looseObject({})).bld(),
					}),
					(_o) => async (ctx) => ctx.render(ctx.req.valid("query"), 200),
				),
				body: createEndpoint(
					createRoute({
						operationId: "body",
						method: "post",
						path: "/body",
						request: req().bdy(z.looseObject({})).bld(),
						responses: res(z.looseObject({})).bld(),
					}),
					(_o) => async (ctx) => ctx.render(ctx.req.valid("json"), 200),
				),
				params: createEndpoint(
					createRoute({
						operationId: "params",
						method: "get",
						path: "/params/:key",
						request: req().prm(z.looseObject({})).bld(),
						responses: res(z.looseObject({})).bld(),
					}),
					(_o) => async (ctx) => ctx.render(ctx.req.valid("param"), 200),
				),
				headers: createEndpoint(
					createRoute({
						operationId: "headers",
						method: "get",
						path: "/headers",
						request: req().hdr(z.looseObject({})).bld(),
						responses: res(z.looseObject({})).bld(),
					}),
					(_o) => async (ctx) => ctx.render(ctx.req.valid("header"), 200),
				),
			},
		} satisfies FaireAuthPlugin;

		const opts = defineOptions({
			plugins: [aPlugin],
			hooks: {
				before: (_opts) =>
					createHook<
						object,
						string,
						{
							out: {
								json: { [x: string]: any };
								query: { [x: string]: any };
								param: { [x: string]: any };
								header: { [x: string]: any };
							};
						}
					>()(async (ctx) => {
						switch (ctx.get("path")) {
							case "/body":
								ctx.req.addValidatedData("json", {
									...ctx.req.valid("json"),
									name: "body",
								});
								return;
							case "/params":
								ctx.req.addValidatedData("param", {
									...ctx.req.valid("param"),
									name: "params",
								});
								return;
							case "/headers":
								ctx.req.addValidatedData("header", {
									...ctx.req.valid("header"),
									name: "headers",
								});
								return;
						}

						ctx.req.addValidatedData("query", {
							...ctx.req.valid("query"),
							name: "query",
						});
						return;
					}),
			},
		});
		const [authContext, authOptions] = init(opts);
		const { app: preApp, api: preApi } = router(authContext, authOptions);
		const app = preApp as unknown as InferApp<typeof opts>;
		const api = preApi as unknown as InferAPI<typeof app>;

		test("should return hook set query", async ({ expect }) => {
			const res2 = await api.query({ query: { key: "value" } });
			expect(res2).toMatchObject({ key: "value" });
		});

		test("should return hook set body", async ({ expect }) => {
			const res2 = await api.body({
				json: { key: "value" },
			});
			expect(res2).toMatchObject({ key: "value" });
		});

		test("should return hook set param", async ({ expect }) => {
			const res2 = await api.params({ param: { key: "value" } });
			expect(res2).toMatchObject({ key: "value" });
		});

		test("should return hook set headers", async ({ expect }) => {
			const res = await api.headers({
				header: { key: "value" },
			});
			expect(res).toMatchObject({ key: "value" });
		});
	});

	describe("response", async (test) => {
		const aPlugin = {
			id: "aPlugin",
			routes: {
				response: createEndpoint(
					createRoute({
						operationId: "response",
						method: "get",
						path: "/response",
						responses: res(z.object({ response: z.literal(true) })).bld(),
					}),
					(_o) => async (ctx) => ctx.json({ response: true as true }, 200),
				),
				json: createEndpoint(
					createRoute({
						operationId: "json",
						method: "get",
						path: "/json",
						responses: res(z.object({ response: z.literal(true) })).bld(),
					}),
					(_o) => async (ctx) => ctx.json({ response: true as true }, 200),
				),
			},
		} satisfies FaireAuthPlugin;

		const opts = defineOptions({
			plugins: [aPlugin],
			hooks: {
				before: (_opts) =>
					createHook()(async (ctx) => {
						if (ctx.get("path") === "/json")
							return ctx.json({ before: true }, 200);
						return;
					}),
			},
		});
		const [authContext, authOptions] = init(opts);
		const { app: preApp, api: preApi } = router(authContext, authOptions);
		const app = preApp as unknown as InferApp<typeof opts>;
		const api = preApi as unknown as InferAPI<typeof app>;

		test("should return Response object", async ({ expect }) => {
			const response = await api.response({ asResponse: true });
			expect(response).toBeInstanceOf(Response);
		});

		test("should return the hook response", async ({ expect }) => {
			const response = await api.json();
			expect(response).toMatchObject({ before: true });
		});
	});
});

describe("after hook", async (test) => {
	describe("response", async (test) => {
		const aPlugin = {
			id: "aPlugin",
			routes: {
				changeResponse: createEndpoint(
					createRoute({
						operationId: "changeResponse",
						method: "get",
						path: "/change-response",
						responses: res(z.object({ hello: z.literal("world") })).bld(),
					}),
					(_o) => async (ctx) => ctx.json({ hello: "world" as "world" }, 200),
				),
				throwError: createEndpoint(
					createRoute({
						operationId: "throwError",
						method: "post",
						path: "/throw-error",
						request: req()
							.qry(z.object({ throwHook: z.boolean() }))
							.bld(),
						responses: res(z.null()).bld(),
					}),
					(_o) => async (c) => {
						const { throwHook } = c.req.valid("query");
						return c.json(null, 200);
					},
				),
				multipleHooks: createEndpoint(
					createRoute({
						operationId: "multipleHooks",
						method: "get",
						path: "/multi-hooks",
						responses: res(z.object({ return: z.literal("1") })).bld(),
					}),
					(_o) => async (ctx) => ctx.json({ return: "1" as "1" }, 200),
				),
			},
		} satisfies FaireAuthPlugin;

		const opts = defineOptions({
			plugins: [
				aPlugin,
				{
					id: "test",
					hooks: {
						after: [
							{
								matcher: () => true,
								handler: (_opts) =>
									createHook()(async (ctx) => {
										if (ctx.get("path") === "/multi-hooks")
											return ctx.json({ return: "3" }, 200);
										return;
									}),
							},
						],
					},
				} satisfies FaireAuthPlugin,
			],
			hooks: {
				after: (_opts) =>
					createHook()(async (ctx) => {
						if (ctx.get("path") === "/change-response")
							return ctx.json({ hello: "auth" }, 200);

						if (ctx.get("path") === "/multi-hooks")
							return ctx.json({ return: "2" }, 200);

						if (ctx.req.query("throwHook"))
							return ctx.json(
								{ status: False, message: "from after hook" },
								400,
							);

						return;
					}),
			},
		});
		const [authContext, authOptions] = init(opts);
		const { app: preApp, api: preApi } = router(authContext, authOptions);
		const app = preApp as unknown as InferApp<typeof opts>;
		const api = preApi as unknown as InferAPI<typeof app>;

		test("should change the response object from `hello:world` to `hello:auth`", async ({
			expect,
		}) => {
			const response = await api.changeResponse();
			expect(response).toMatchObject({ hello: "auth" });
		});

		test("should return the last hook returned response", async ({
			expect,
		}) => {
			const response = await api.multipleHooks();
			expect(response).toMatchObject({ return: "3" });
		});

		test("should return error as response", async ({ expect }) => {
			const response = await api.throwError(
				// @ts-expect-error throwHook not supplied
				{},
				{ asResponse: true },
			);
			expect(response.status).toBe(422);
		});

		test("should throw the last error", async ({ expect }) => {
			await api.throwError({ query: { throwHook: true } }).catch((e) => {
				expect(e).toBeInstanceOf(APIError);
				expect(e?.message).toBe("from after hook");
			});
		});
	});

	describe("cookies", async (test) => {
		const aPlugin = {
			id: "aPlugin",
			routes: {
				cookies: createEndpoint(
					createRoute({
						operationId: "cookies",
						method: "post",
						path: "/cookies",
						responses: res(z.object({ hello: z.literal("world") })).bld(),
					}),
					(_o) => async (ctx) => {
						setCookie(ctx, "session", "value");
						return ctx.json({ hello: "world" as "world" }, 200);
					},
				),
				cookieOverride: createEndpoint(
					createRoute({
						operationId: "cookieOverride",
						method: "get",
						path: "/cookie",
						responses: res(z.null()).bld(),
					}),
					(_o) => async (ctx) => {
						setCookie(ctx, "data", "1");
						return ctx.json(null, 200);
					},
				),
				noCookie: createEndpoint(
					createRoute({
						operationId: "noCookie",
						method: "get",
						path: "/no-cookie",
						responses: res(z.null()).bld(),
					}),
					(_o) => async (ctx) => ctx.json(null, 200),
				),
			},
		} satisfies FaireAuthPlugin;

		const opts = defineOptions({
			plugins: [aPlugin],
			hooks: {
				after: (_opts) =>
					createHook()(async (ctx) => {
						ctx.header("key", "value");
						setCookie(ctx, "data", "2");
					}),
			},
		});
		const [authContext, authOptions] = init(opts);
		const { app: preApp, api: preApi } = router(authContext, authOptions);
		const app = preApp as unknown as InferApp<typeof opts>;
		const api = preApi as unknown as InferAPI<typeof app>;

		test("set cookies from both hook", async ({ expect }) => {
			const result = await api.cookies({ asResponse: true });
			expect(result.headers.get("set-cookie")).toContain("session=value");
			expect(result.headers.get("set-cookie")).toContain("data=2");
		});

		test("should override cookie", async ({ expect }) => {
			const result = await api.cookieOverride({ asResponse: true });
			expect(result.headers.get("set-cookie")).toContain("data=2");
		});

		test("should only set the hook cookie", async ({ expect }) => {
			const result = await api.noCookie({ asResponse: true });
			expect(result.headers.get("set-cookie")).toContain("data=2");
		});

		test("should return cookies from return headers", async ({ expect }) => {
			const result = await api.noCookie({ returnHeaders: true });
			expect(result.headers.get("set-cookie")).toContain("data=2");

			const result2 = await api.cookies({ asResponse: true });
			expect(result2.headers.get("set-cookie")).toContain("session=value");
			expect(result2.headers.get("set-cookie")).toContain("data=2");
		});
	});
});

describe("disabled paths", async (test) => {
	const { client } = await getTestInstance(
		{
			disabledPaths: ["/sign-in/email"],
		},
		// TODO: someday figure out why turning this off prevents automatic user creation from working
		// (same in social.test.ts)
		{ disableTestUser: true },
	);

	test("should return 404 for disabled paths", async ({ expect }) => {
		const response = await client.$fetch("/ok");
		expect(response.data).toEqual({ success: true });
		const { error } = await client.signIn.email.$post({
			json: { email: "test@test.com", password: "test" },
		});
		expect(error?.status).toBe(404);
	});
});
