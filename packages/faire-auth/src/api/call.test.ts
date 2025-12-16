import { setCookie } from "../utils/cookies";
import { describe, expect } from "vitest";
import * as z from "zod";
import { defineOptions } from "../auth";
import { createAuthClient } from "../client";
import { init } from "../init";
import { bearer } from "../plugins/bearer";
import type { FaireAuthPlugin } from "../types/plugin";
import { False } from "@faire-auth/core/static";
import { APIError } from "@faire-auth/core/error";
import { updateQueryParam } from "../utils/hono";
import { req, res } from "@faire-auth/core/factory";
import { createEndpoint } from "./factory/endpoint";
import { createHook } from "./factory/middleware";
import { createRoute } from "@faire-auth/core/factory";
import { router } from "./index";
import type { InferAPI, InferApp } from "./types";

describe("call", async (test) => {
	const q = z.object({
		testBeforeHook: z.string().optional(),
		testBeforeGlobal: z.string().optional(),
		testAfterHook: z.string().optional(),
		testAfterGlobal: z.string().optional(),
		testContext: z.string().optional(),
		message: z.string().optional(),
	});

	const testPlugin = {
		id: "test",
		routes: {
			test: createEndpoint(
				createRoute({
					operationId: "test",
					path: "/test",
					method: "get",
					request: req().qry(q).bld(),
					responses: res(z.object({ success: z.string() })).bld(),
				}),
				(_o) => async (ctx) =>
					ctx.render(
						{ success: ctx.req.valid("query").message ?? "true" },
						200,
					),
			),
			testCookies: createEndpoint(
				createRoute({
					operationId: "testCookies",
					method: "post",
					path: "/test/cookies",
					request: req()
						.qry(q)
						.bdy(
							z.object({
								cookies: z.array(
									z.object({ name: z.string(), value: z.string() }),
								),
							}),
						)
						.bld(),
					responses: res(z.object({ success: z.boolean() })).bld(),
				}),
				(_o) => async (ctx) => {
					ctx.req
						.valid("json")
						.cookies.forEach(({ name, value }) => setCookie(ctx, name, value));

					return ctx.render({ success: true }, 200);
				},
			),
			testThrow: createEndpoint(
				createRoute({
					operationId: "testThrow",
					method: "get",
					path: "/test/throw",
					request: req().qry(q).bld(),
					responses: res().err(400).rdr().bld(),
				}),
				(_o) => async (ctx) => {
					const { message } = ctx.req.valid("query");
					if (message === "throw-api-error")
						return ctx.render({ success: False, message: "Test error" }, 400);

					if (message === "throw-error") throw new Error("Test error");

					if (message === "throw redirect") return ctx.redirect("/test", 302);

					if (message === "redirect with additional header") {
						ctx.header("key", "value");
						return ctx.redirect("/test", 302);
					}

					return ctx.render(
						{ success: False, ...(message && { message }) },
						400,
					);
					// throw new APIError('BAD_REQUEST', { ...(message && { message }) })
				},
			),
			testDto: createEndpoint(
				createRoute({
					operationId: "testDto",
					path: "/test-dto",
					method: "post",
					request: req()
						.bdy(z.union([z.literal("top"), z.literal("nested")]))
						.bld(),
					responses: {
						200: {
							description: "Success",
							content: {
								"application/json": {
									schema: z.object({
										field1: z.string(),
										field2: z.string(),
										nested: z.object({ field3: z.string() }),
									}),
								},
							},
						},
						201: {
							description: "Success",
							content: {
								"application/json": {
									schema: z.object({ field3: z.string() }),
								},
							},
						},
					},
				}),
				(_o) => async (ctx) =>
					ctx.req.valid("json") === "top"
						? ctx.render(
								{
									field1: "yep",
									field2: "another",
									nested: { field3: "final", field4: "actually" },
								},
								200,
							)
						: ctx.render({ field3: "final" }, 201),
			),
		},
	} satisfies FaireAuthPlugin;

	const testPlugin2 = {
		id: "test2",
		hooks: {
			before: [
				{
					matcher: (ctx) => ctx.get("path") === "/test",
					handler: (_opts) =>
						createHook()(async (ctx) => {
							if (ctx.req.query("testBeforeHook"))
								// need to return json because render not init'd yet
								return ctx.json({ before: "test" }, 201);

							const testContext = ctx.req.query("testContext");
							if (testContext)
								updateQueryParam(ctx.req, "message", testContext);

							return;
						}),
				},
			],
			after: [
				{
					matcher: (ctx) => ctx.get("path") === "/test",
					handler: (_opts) =>
						createHook()(async (ctx) => {
							if (ctx.req.query("testAfterHook"))
								return ctx.render({ after: "test" }, 201);

							return;
						}),
				},
				{
					matcher: (ctx) => ctx.get("path") === "/test/cookies",
					handler: (_opts) =>
						createHook()(async (ctx) => {
							if (ctx.req.query("testAfterHook"))
								setCookie(ctx, "after", "test");

							return;
						}),
				},
				{
					matcher: (ctx) =>
						ctx.get("path") === "/test/throw" &&
						(ctx.req.query("message") === "throw-after-hook" ||
							ctx.req.query("message") === "throw-chained-hook"),
					handler: (_opts) =>
						createHook()(async (ctx) => {
							if (ctx.req.query("message") === "throw-chained-hook")
								throw new APIError("BAD_REQUEST", {
									message: "from chained hook 1",
								});

							// if (ctx.get("context").returned instanceof APIError)
							return ctx.render(
								{ success: False, message: "from after hook" },
								400,
							);
						}),
				},
				{
					matcher: (ctx) =>
						ctx.get("path") === "/test/throw" &&
						ctx.req.query("message") === "throw-chained-hook",
					handler: (_opts) =>
						createHook()(async (ctx) => {
							if (ctx.error instanceof APIError)
								return ctx.render(
									{
										success: False,
										message: ctx.error.message.replace("1", "2"),
									},
									400,
								);

							return;
						}),
				},
			],
		},
	} satisfies FaireAuthPlugin;
	const options = defineOptions({
		plugins: [testPlugin, testPlugin2, bearer()],
		emailAndPassword: { enabled: true },
		routeHooks: {
			signUpEmail: (result, ctx) => {
				if (!result.success)
					return ctx.render(
						{ success: False, message: z.prettifyError(result.error) },
						400,
					);
				if (result.target === "json") result.data.email = "changed@email.com";
				return;
			},
		},
		dto: {
			nestedLevel: (_a) => {
				console.log("nested ran");
				return { new: "yee" };
			},
			topLevel: (a) => {
				console.log("top ran");
				return { field1: a!.field1 };
			},
		},
		hooks: {
			before: (_opts) =>
				createHook()(async (ctx) => {
					if (ctx.req.query("testBeforeGlobal"))
						// need to return json because render not init'd yet
						return ctx.json({ before: "global" }, 201);

					return;
				}),
			after: (_opts) =>
				createHook()(async (ctx) => {
					if (ctx.req.query("testAfterGlobal"))
						return ctx.render({ after: "global" }, 201);
					return;
				}),
		},
	});
	const [authContext, authOptions] = init(options);
	const { app: preApp, api: preApi } = router(authContext, authOptions);
	const app = preApp as unknown as InferApp<typeof options>;
	const api = preApi as unknown as InferAPI<typeof app>;
	const client = createAuthClient<typeof app>()({
		fetchOptions: {
			customFetchImpl: async (url, init) => app.fetch(new Request(url, init)),
		},
	});

	test("should call api", async ({ expect }) => {
		const response = await api.test({ query: {} });
		expect(response).toMatchObject({ success: "true" });
	});

	test("should set cookies", async ({ expect }) => {
		const response = await api.testCookies(
			{
				json: { cookies: [{ name: "test-cookie", value: "test-value" }] },
				query: {},
			},
			{ returnHeaders: true },
		);
		const setCookies = response.headers
			.getSetCookie()
			.map((c) => c.split(";")[0]!);
		expect(setCookies).toContain("test-cookie=test-value");
	});

	test("should intercept on before hook", async ({ expect }) => {
		const response = await api.test({ query: { testBeforeHook: "true" } });
		expect(response).toMatchObject({ before: "test" });
	});

	test("should change context on before hook", async ({ expect }) => {
		const response = await api.test({
			query: { testContext: "context-changed" },
		});
		expect(response).toMatchObject({ success: "context-changed" });
	});

	test("should intercept on after hook", async ({ expect }) => {
		const response = await api.test({ query: { testAfterHook: "true" } });
		expect(response).toMatchObject({ after: "test" });
	});

	test("should return Response object", async ({ expect }) => {
		const response = await api.test({ query: {} }, { asResponse: true });
		expect(response).toBeInstanceOf(Response);
	});

	test("should set cookies on after hook", async ({ expect }) => {
		const response = await api.testCookies(
			{
				json: { cookies: [{ name: "test-cookie", value: "test-value" }] },
				query: { testAfterHook: "true" },
			},
			{ returnHeaders: true },
		);
		const setCookies = response.headers
			.getSetCookie()
			.map((c) => c.split(";")[0]!);
		expect(setCookies).toContain("after=test");
		expect(setCookies).toContain("test-cookie=test-value");
	});

	test("should throw APIError", async ({ expect }) => {
		expect(
			await api.testThrow({ query: { message: "throw-api-error" } }),
		).toMatchObject({ message: "Test error" });
	});

	test("should throw Error", async ({ expect }) => {
		expect(
			await api.testThrow({ query: { message: "throw-error" } }),
		).toMatchObject({ success: false });
	});

	test("should redirect", async ({ expect }) => {
		const response = await api.testThrow(
			{ query: { message: "throw redirect" } },
			{ asResponse: true },
		);

		// expect(e).toBeInstanceOf(APIError)
		// expect(e.status).toBe('FOUND')
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/test");
	});

	test("should include base headers with redirect", async ({ expect }) => {
		const response = await api.testThrow(
			{ query: { message: "redirect with additional header" } },
			{ asResponse: true },
		);

		// expect(e).toBeInstanceOf(APIError)
		// expect(e.status).toBe('FOUND')
		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toBe("/test");
		expect(response.headers.get("key")).toBe("value");
	});

	test("should throw from after hook", async ({ expect }) => {
		const response = await api.testThrow({
			query: { message: "throw-after-hook" },
		});

		// expect(e).toBeInstanceOf(APIError)
		// expect(e.status).toBe('BAD_REQUEST')
		expect(response).not.toBeInstanceOf(Response);
		expect(response.success).toBe(False);
		expect(response.message).toContain("from after hook");
	});

	test("should throw from chained hook", async ({ expect }) => {
		const response = await api.testThrow({
			query: { message: "throw-chained-hook" },
		});

		// expect(e).toBeInstanceOf(APIError)
		// expect(response.status).toBe('BAD_REQUEST')
		expect(response).not.toBeInstanceOf(Response);
		expect(response.success).toBe(False);
		expect(response.message).toContain("from chained hook 2");
	});

	test("should intercept on global before hook", async ({ expect }) => {
		const response = await api.test({ query: { testBeforeGlobal: "true" } });
		expect(response).toMatchObject({ before: "global" });
	});

	test("should intercept on global after hook", async ({ expect }) => {
		const response = await api.test({ query: { testAfterGlobal: "true" } });
		expect(response).toMatchObject({ after: "global" });
	});

	test("global before hook should change the context", async (_ctx) => {
		const response = await api.signUpEmail({
			json: { email: "my-email@test.com", password: "password", name: "test" },
		});
		if (response.success === false)
			throw new Error(`failed to sign up ${JSON.stringify(response)}`);
		const session = await api.getSession(
			{ query: {} },
			{ headers: { Authorization: `Bearer ${response.data.token}` } },
		);
		if (session.success === false)
			throw new Error(`failed to get session ${JSON.stringify(session)}`);
		expect(session?.data.user.email).toBe("changed@email.com");
	});

	test("should fetch using a client with query", async ({ expect }) => {
		const response = await client.$fetch("/test", {
			query: { message: "test" },
		});
		expect(response.data, JSON.stringify(response.error)).toMatchObject({
			success: "test",
		});
	});

	test("should set cookies using a client", async ({ expect }) => {
		await client.$fetch("/test/cookies", {
			method: "POST",
			body: { cookies: [{ name: "test-cookie", value: "test-value" }] },
			onResponse(context) {
				const cookies = context.response.headers
					.getSetCookie()
					.map((c) => c.split(";")[0]!);
				expect(cookies).toContain("test-cookie=test-value");
			},
		});
	});
});
