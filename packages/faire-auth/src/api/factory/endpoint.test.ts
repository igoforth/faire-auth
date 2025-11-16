import * as z from "zod";
import { describe, expectTypeOf } from "vitest";
import { createTestEndpoint } from "../../test-utils/test-endpoint";
import { createMiddleware } from "./middleware";
import { createRoute, req, res } from "@faire-auth/core/factory";

describe("validation", (test) => {
	test("should validate and return the body", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "testRoute",
				method: "post",
				path: "/test",
				request: req()
					.bdy(
						z.object({
							name: z.string().transform((val) => `${val}-validated`),
						}),
					)
					.bld(),
				responses: res(z.object({ name: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const body = ctx.req.valid("json");
				return ctx.render(body, 200);
			},
		);

		const response = await execute({ json: { name: "test" } });
		expect(response).toMatchObject({ name: "test-validated" });
	});

	test("should validate and return the query", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "testRoute",
				method: "get",
				path: "/test",
				request: req()
					.qry(
						z.object({
							name: z.string().transform((val) => `${val}-validated`),
						}),
					)
					.bld(),
				responses: res(z.object({ name: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const query = ctx.req.valid("query");
				return ctx.render(query, 200);
			},
		);

		const response = await execute({ query: { name: "test" } });
		expect(response).toMatchObject({ name: "test-validated" });
	});
});

describe("types", (test) => {
	test("body", async ({ expect }) => {
		createTestEndpoint(
			createRoute({
				operationId: "testRoute",
				method: "post",
				path: "/test",
				request: req()
					.bdy(z.object({ name: z.string() }))
					.bld(),
				responses: res(z.object({ name: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const body = ctx.req.valid("json");
				expectTypeOf(body).toEqualTypeOf<{ name: string }>();
				return ctx.render(body, 200);
			},
		);

		createTestEndpoint(
			createRoute({
				operationId: "testRoute2",
				method: "post",
				path: "/test",
				request: req()
					.bdy(z.object({ name: z.string().optional() }))
					.bld(),
				responses: res(z.object({ name: z.string().optional() })).bld(),
			}),
			() => async (ctx) => {
				const body = ctx.req.valid("json");
				expectTypeOf(body).toEqualTypeOf<{ name?: string }>();
				return ctx.render(body, 200);
			},
		);

		createTestEndpoint(
			createRoute({
				operationId: "testRoute3",
				method: "post",
				path: "/test",
				request: req()
					.bdy(z.object({ name: z.string() }).optional())
					.bld(),
				responses: res(z.object({ name: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const body = ctx.req.valid("json");
				expectTypeOf(body).toEqualTypeOf<{ name: string } | undefined>();
				return ctx.render(body ?? { name: "default" }, 200);
			},
		);
	});

	test("query", async ({ expect }) => {
		createTestEndpoint(
			createRoute({
				operationId: "testRoute1",
				method: "get",
				path: "/test",
				request: req()
					.qry(z.object({ name: z.string() }))
					.bld(),
				responses: res(z.object({ name: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const query = ctx.req.valid("query");
				expectTypeOf(query).toEqualTypeOf<{ name: string }>();
				return ctx.render(query, 200);
			},
		);

		createTestEndpoint(
			createRoute({
				operationId: "testRoute2",
				method: "get",
				path: "/test",
				request: req()
					.qry(z.object({ name: z.string().optional() }))
					.bld(),
				responses: res(z.object({ name: z.string().optional() })).bld(),
			}),
			() => async (ctx) => {
				const query = ctx.req.valid("query");
				expectTypeOf(query).toEqualTypeOf<{ name?: string }>();
				return ctx.render(query, 200);
			},
		);

		createTestEndpoint(
			createRoute({
				operationId: "testRoute3",
				method: "get",
				path: "/test",
				request: req()
					.qry(z.object({ name: z.string().optional() }))
					.bld(),
				responses: res(z.object({ name: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const query = ctx.req.valid("query");
				expectTypeOf(query).toEqualTypeOf<{ name?: string | undefined }>();
				return ctx.render({ name: query.name ?? "default" }, 200);
			},
		);
	});

	test("params", async ({ expect }) => {
		createTestEndpoint(
			createRoute({
				operationId: "testRoute1",
				method: "get",
				path: "/:id",
				request: req()
					.prm(
						z.object({
							id: z.string(),
						}),
					)
					.bld(),
				responses: res(z.object({ id: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const params = ctx.req.param();
				expectTypeOf(params).toEqualTypeOf<{ id: string }>();
				return ctx.render(params, 200);
			},
		);

		createTestEndpoint(
			createRoute({
				operationId: "testRoute2",
				method: "get",
				path: "/leading-path/:id",
				request: req()
					.prm(
						z.object({
							id: z.string(),
						}),
					)
					.bld(),
				responses: res(z.object({ id: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const params = ctx.req.param();
				expectTypeOf(params).toEqualTypeOf<{ id: string }>();
				return ctx.render(params, 200);
			},
		);

		createTestEndpoint(
			createRoute({
				operationId: "testRoute3",
				method: "get",
				path: "/leading-path/:id/:name",
				responses: res(z.object({ id: z.string(), name: z.string() })).bld(),
			}),
			() => async (ctx) => {
				const params = ctx.req.param();
				expectTypeOf(params).toEqualTypeOf<{ id: string; name: string }>();
				return ctx.render(params, 200);
			},
		);
	});

	// TODO: N/A?

	// test('wildcard params', async () => {
	//   createTestEndpoint(
	//     createRoute({
	//       key: 'testRoute1',
	//       method: 'get',
	//       path: '/api/*',
	//       responses: {
	//         200: {
	//           description: 'Success',
	//           content: {
	//             'application/json': { schema: z.object({ _: z.string() }) },
	//           },
	//         },
	//       },
	//     }),
	//     () => async (ctx) => {
	//       const params = ctx.req.param()
	//       expectTypeOf(params).toEqualTypeOf<{ _: string }>()
	//       return ctx.render(params, 200)
	//     },
	//   )

	//   createTestEndpoint(
	//     createRoute({
	//       key: 'testRoute2',
	//       method: 'get',
	//       path: '/api/:id/*',
	//       responses: {
	//         200: {
	//           description: 'Success',
	//           content: {
	//             'application/json': {
	//               schema: z.object({ _: z.string(), id: z.string() }),
	//             },
	//           },
	//         },
	//       },
	//     }),
	//     () => async (ctx) => {
	//       const params = ctx.req.param()
	//       expectTypeOf(params).toEqualTypeOf<{ _: string; id: string }>()
	//       return ctx.render(params, 200)
	//     },
	//   )
	// })

	test("method", async ({ expect }) => {
		createTestEndpoint(
			createRoute({
				operationId: "testRoute1",
				method: "get",
				path: "/test",
				responses: res(z.object({ method: z.string() })).bld(),
			}),
			() => async (ctx) => {
				// TODO: will always be string, though strictly typed at route level
				expectTypeOf(ctx.req.method).toEqualTypeOf<string>();
				return ctx.render({ method: ctx.req.method }, 200);
			},
		);

		// N/A, must be split
		// createTestEndpoint(
		//   createRoute({
		//     route: 'testRoute2',
		//     method: ['post', 'get'],
		//     path: '/test',
		//     responses: {
		//       200: {
		//         description: 'Success',
		//         content: {
		//           'application/json': { schema: z.object({ method: z.string() }) },
		//         },
		//       },
		//     },
		//   }),
		//   () => async (ctx) => {
		//     expectTypeOf(ctx.req.method).toEqualTypeOf<'GET' | 'POST'>()
		//     return ctx.render({ method: ctx.req.method }, 200)
		//   },
		// )
	});

	test("response", async ({ expect }) => {
		const { execute } = createTestEndpoint(
			createRoute({
				operationId: "testRoute",
				method: "get",
				path: "/test",
				responses: res(z.object({ name: z.string() })).bld(),
			}),
			() => async (ctx) => ctx.render({ name: "test" }, 200),
		);
		const jsonResponse1 = await execute();
		expectTypeOf(jsonResponse1).toEqualTypeOf<{ name: string }>();
	});
});

describe("response", (test) => {
	describe("flat", (test) => {
		test("should return primitive values", async ({ expect }) => {
			for (const value of [1, "hello", true]) {
				const { execute } = createTestEndpoint(
					createRoute({
						operationId: "testRoute",
						method: "post",
						path: "/path",
						responses: res(z.any()).bld(),
					}),
					() => async (ctx) => ctx.render(value, 200),
				);
				const response = await execute();
				expect(response).toBe(value);
			}
		});
	});

	describe("json", (test) => {
		test("should return a js object response on direct call", async ({
			expect,
		}) => {
			const { execute } = createTestEndpoint(
				createRoute({
					operationId: "testRoute",
					method: "post",
					path: "/path",
					responses: res(z.object({ test: z.string() })).bld(),
				}),
				() => async (ctx) => ctx.render({ test: "response" }, 200),
			);
			const response = await execute();
			expect(response).toMatchObject({ test: "response" });
		});
	});

	// TODO: N/A?

	// describe('as-response', () => {
	//   test('should return a response object', async () => {
	//     const responses = [
	//       { type: 'number', value: 1 },
	//       { type: 'string', value: 'hello world!' },
	//       { type: 'object', value: { hello: 'world' } },
	//       { type: 'object', value: ['1', '2', '3'] },
	//     ]
	//     for (const value of responses) {
	//       const { handler } = createTestEndpoint(
	//         createRoute({operationId: 'testRoute',
	//           method: 'post',
	//           path: '/path',
	//           responses: {
	//             200: {
	//               description: 'Success',
	//               content: { 'application/json': { schema: z.any() } },
	//             },
	//           },
	//         }),
	//         () => async (ctx) => ctx.render(value, 200),
	//       )
	//       // Note: asResponse is not directly supported in the new API
	//       // This test would need to be adapted for the actual hono context
	//     }
	//   })
	// })

	describe("redirect", (test) => {
		test("should return redirect response", async ({ expect }) => {
			const { execute } = createTestEndpoint(
				createRoute({
					operationId: "testRoute",
					method: "post",
					path: "/endpoint",
					responses: res().rdr().bld(),
				}),
				() => async (c) => c.redirect("/", 302),
			);

			const response = await execute();
			expect(response).instanceOf(Response);
			expect(response.status).toEqual(302);
		});
	});

	describe("set-headers", (test) => {
		test("should set headers", async ({ expect }) => {
			const { execute } = createTestEndpoint(
				createRoute({
					operationId: "testRoute",
					method: "post",
					path: "/endpoint",
					responses: { 200: { description: "Success" } },
				}),
				() => async (c) => {
					// In hono context, headers are set via c.header()
					c.header("hello", "world");
					return c.newResponse(null, 200);
				},
			);

			const response = await execute();
			expect(response).instanceOf(Response);
			expect(response.headers.get("hello")).toEqual("world");
		});
	});

	// this isn't necessary anymore

	// describe('API Error', () => {
	//   test('should throw API Error', async () => {
	//     const { execute } = createTestEndpoint(
	//       createRoute({
	//         key: 'testRoute',
	//         method: 'post',
	//         path: '/endpoint',
	//         responses: {
	//           401: {
	//             description: 'Unauthorized',
	//             content: {
	//               'application/json': {
	//                 schema: z.object({ message: z.string() }),
	//               },
	//             },
	//           },
	//         },
	//       }),
	//       () => async (c) => {
	//         throw new APIError('UNAUTHORIZED')
	//       },
	//     )
	//     await expect(execute()).rejects.toThrowError(APIError)
	//   })

	//   test('should return error Response', async () => {
	//     const { execute } = createTestEndpoint(
	//       createRoute({
	//         key: 'testRoute',
	//         method: 'post',
	//         path: '/endpoint',
	//         responses: {
	//           404: {
	//             description: 'Not Found',
	//             content: {
	//               'application/json': {
	//                 schema: z.object({ message: z.string() }),
	//               },
	//             },
	//           },
	//         },
	//       }),
	//       () => async (c) => {
	//         throw new APIError('NOT_FOUND')
	//       },
	//     )
	//     await expect(execute()).rejects.toThrowError(APIError)
	//   })

	//   test("should return error Response with its body", async ({ expect }) => {
	//     const { execute } = createTestEndpoint(
	//       createRoute({
	//         key: 'testRoute',
	//         method: 'post',
	//         path: '/endpoint',
	//         responses: {
	//           400: {
	//             description: 'Bad Request',
	//             content: {
	//               'application/json': {
	//                 schema: z.object({ message: z.string() }),
	//               },
	//             },
	//           },
	//         },
	//       }),
	//       () => async (c) => {
	//         throw new APIError('BAD_REQUEST', { message: 'error message' })
	//       },
	//     )
	//     await expect(execute()).rejects.toThrowError(APIError)
	//   })
	// })
});

describe("creator", (test) => {
	test("should use creator context", async ({ expect }) => {
		const middleware = createMiddleware()(async (ctx) =>
			ctx.render({ hello: "world" }, 200),
		);

		const testRoute = createRoute({
			operationId: "testRoute",
			method: "post",
			path: "/path",
			middleware: [middleware],
			responses: res(z.any()).bld(),
		});

		const { execute } = createTestEndpoint(testRoute, () => async (_c) => {
			throw new Error("Shouldn't hit");
		});
		const response = await execute();
		expect(response).toMatchObject({ hello: "world" });
		expectTypeOf(response).toEqualTypeOf<Response | { hello: string }>();
		// Note: This would need actual middleware setup
	});

	// TODO: test with options middleware?
	// test('should be able to combine with endpoint middleware', async () => {
	//   // TODO: This would need actual middleware combination testing
	// })
});

// not necessary anymore

// describe('onAPIError', () => {
//   test('should call onAPIError', async () => {
//     let error: APIError | undefined

//     const { execute } = createTestEndpoint(
//       createRoute({
//         key: 'testRoute',
//         method: 'post',
//         path: '/path',
//         responses: {
//           401: {
//             description: 'Unauthorized',
//             content: {
//               'application/json': { schema: z.object({ message: z.string() }) },
//             },
//           },
//         },
//       }),
//       () => async (_c) => {
//         throw new APIError('UNAUTHORIZED')
//       },
//     )

//     await execute().catch(() => {})
//     // Note: onAPIError handling would need to be tested in actual context
//   })
// })
