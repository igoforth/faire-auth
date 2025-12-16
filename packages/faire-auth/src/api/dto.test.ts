import { describe } from "vitest";
import * as z from "zod";
import { defineOptions } from "../auth";
import { init } from "../init";
import { bearer } from "../plugins/bearer";
import { getTestInstance } from "../test-utils";
import type { FaireAuthPlugin } from "../types/plugin";
import { req, res, registerSchema } from "@faire-auth/core/factory";
import { createEndpoint } from "./factory/endpoint";
import { createRoute } from "@faire-auth/core/factory";
import { router } from "./index";

describe("DTO transformations", async (test) => {
	// Test DTO schemas
	const nestedSchema = registerSchema(
		z.object({ field3: z.string(), field4: z.string().optional() }),
		{ id: "nestedLevel" },
	);
	const testDtoSchema = registerSchema(
		z.object({ field1: z.string(), field2: z.string(), nested: nestedSchema }),
		{ id: "topLevel" },
		{ _self: "topLevel", nested: "nestedLevel" },
	);

	// Complex test schema for user data transformation
	const userDataSchema = registerSchema(
		z.object({
			id: z.string(),
			email: z.string(),
			name: z.string().optional(),
			metadata: z.record(z.string(), z.any()).optional(),
			createdAt: z.date(),
			updatedAt: z.date(),
		}),
		{ id: "userData" },
	);

	const deepNestedSchema = registerSchema(
		z.object({
			level1: z.object({
				level2: z.object({
					level3: z.object({
						value: z.string(),
						metadata: z.record(z.string(), z.any()),
					}),
				}),
			}),
			summary: z.string(),
		}),
		{ id: "deepNested" },
	);

	const arrayUserSchema = registerSchema(
		z.array(userDataSchema),
		{ id: "arrayUserData" },
		{ _self: "arrayUserData", _inner: "userData" },
	);

	// Test plugin with various DTO scenarios
	const testPlugin = {
		id: "test",
		routes: {
			// Basic DTO transformation test
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
							content: { "application/json": { schema: testDtoSchema } },
						},
						201: {
							description: "Success",
							content: { "application/json": { schema: nestedSchema } },
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

			// User data transformation test
			testUserData: createEndpoint(
				createRoute({
					operationId: "testUserData",
					path: "/test-user-data",
					method: "get",
					responses: res(userDataSchema).bld(),
				}),
				(_o) => async (ctx) =>
					ctx.render(
						{
							id: "user123",
							email: "test@example.com",
							name: "John Doe",
							metadata: { role: "admin", lastLogin: "2024-01-01" },
							createdAt: new Date("2024-01-01"),
							updatedAt: new Date("2024-01-02"),
						},
						200,
					),
			),

			// Array response test
			testArrayResponse: createEndpoint(
				createRoute({
					operationId: "testArrayResponse",
					path: "/test-array",
					method: "get",
					responses: res(arrayUserSchema).bld(),
				}),
				(_o) => async (ctx) =>
					ctx.render(
						[
							{
								id: "user1",
								email: "user1@example.com",
								name: "User One",
								createdAt: new Date("2024-01-01"),
								updatedAt: new Date("2024-01-02"),
							},
							{
								id: "user2",
								email: "user2@example.com",
								name: "User Two",
								createdAt: new Date("2024-01-03"),
								updatedAt: new Date("2024-01-04"),
							},
						],
						200,
					),
			),

			// Nested DTO with multiple levels
			testDeepNested: createEndpoint(
				createRoute({
					operationId: "testDeepNested",
					path: "/test-deep-nested",
					method: "post",
					request: req().bdy(z.literal("deep")).bld(),
					responses: res(deepNestedSchema).bld(),
				}),
				(_o) => async (ctx) =>
					ctx.render(
						{
							level1: {
								level2: {
									level3: {
										value: "deep-value",
										metadata: { type: "test", depth: 3 },
									},
								},
							},
							summary: "Deep nested structure",
						},
						200,
					),
			),
		},
		schemas: {
			topLevel: testDtoSchema,
			nestedLevel: nestedSchema,
			userData: userDataSchema,
			deepNested: deepNestedSchema,
			arrayUserData: arrayUserSchema,
		},
	} satisfies FaireAuthPlugin;

	const sleep = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	// Configure options with DTO transformations
	const { $Infer, auth, signIn } = await getTestInstance(
		defineOptions({
			plugins: [testPlugin, bearer()],
			emailAndPassword: { enabled: true },
			dto: {
				// Modifying success return
				success: (data) => ({
					success: data.success,
					extraProp: true as true,
					...(data.message && { message: data.message }),
				}),

				// Simple field mapping
				nestedLevel: (data) => ({ new: "yee", original: data.field3 }),

				// User data transformation - sanitize and enhance
				userData: (user) => ({
					id: user.id,
					email: user.email.toLowerCase(),
					displayName: user.name || "Anonymous User",
					isActive: true,
					memberSince: user.createdAt.toISOString().split("T")[0],
					profileComplete: !!(user.name && user.metadata),
				}),

				// Deep nested transformation, async
				deepNested: async (data) => {
					// simulate work
					await sleep(500);
					return {
						deepestValue: data.level1.level2.level3.value,
						metadataCount: Object.keys(data.level1.level2.level3.metadata)
							.length,
						summary: data.summary.toUpperCase(),
					};
				},

				// sessionUser: (_data) => {
				//   console.log('ran sessionUser dto')
				//   return { session: 'modified', user: 'modified' }
				// },

				user: (_data) => ({ field1: "modified" }),
				session: (_data) => ({ field1: "modified" }),
			},
		}),
	);

	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);
	const client = $Infer.client(app);

	test("should get dto from nested return", async ({ expect }) => {
		const res = await api.testDto({ json: "nested" });
		expect(res).toStrictEqual({ new: "yee", original: "final" });
	});

	test("should process dto using a client", async ({ expect }) => {
		const response = await client.$fetch("/ok");
		expect(response.data, JSON.stringify(response.error)).toStrictEqual({
			success: true,
			extraProp: true,
		});
	});

	test("should get dto from top level return", async ({ expect }) => {
		const res = await api.testDto({ json: "top" });
		expect(res).toStrictEqual({
			field1: "yep",
			field2: "another",
			nested: { new: "yee", original: "final" },
		});
	});

	test("should transform user data with DTO", async ({ expect }) => {
		const res = await api.testUserData();
		expect(res).toStrictEqual({
			id: "user123",
			email: "test@example.com", // lowercase transformation
			displayName: "John Doe",
			isActive: true,
			memberSince: "2024-01-01",
			profileComplete: true,
		});
	});

	test("should transform array responses with DTO", async ({ expect }) => {
		const res = await api.testArrayResponse();
		expect(Array.isArray(res)).toBe(true);
		expect(res).toHaveLength(2);
		expect(res[0]).toMatchObject({
			id: "user1",
			email: "user1@example.com",
			displayName: "User One",
			isActive: true,
		});
		expect(res[1]).toMatchObject({
			id: "user2",
			email: "user2@example.com",
			displayName: "User Two",
			isActive: true,
		});
	});

	test("should handle deep nested DTO transformations", async ({ expect }) => {
		const res = await api.testDeepNested({ json: "deep" });
		expect(res).toStrictEqual({
			deepestValue: "deep-value",
			metadataCount: 2,
			summary: "DEEP NESTED STRUCTURE",
		});
	});

	test("should handle DTO with common use case", async ({ expect }) => {
		const { headers } = await signIn();
		const res = await api.getSession({ query: {} }, { headers });
		expect(res).toStrictEqual({
			success: true,
			data: { session: { field1: "modified" }, user: { field1: "modified" } },
		});
	});

	test("should apply DTO transformations to client responses", async ({
		expect,
	}) => {
		const response = await client.testDto.$post({ json: "nested" });
		expect(response.data).toStrictEqual({ new: "yee", original: "final" });
	});

	test("should handle complex client requests with DTO", async ({ expect }) => {
		const response = await client.testDeepNested.$post({ json: "deep" });
		expect(response.data).toStrictEqual({
			deepestValue: "deep-value",
			metadataCount: 2,
			summary: "DEEP NESTED STRUCTURE",
		});
	});

	test("should maintain response structure with DTO transformations", async ({
		expect,
	}) => {
		const res = await api.testUserData();
		expect(res).toHaveProperty("id");
		expect(res).toHaveProperty("email");
		expect(res).toHaveProperty("displayName");
		expect(res).toHaveProperty("isActive");
		expect(res).toHaveProperty("memberSince");
		expect(res).toHaveProperty("profileComplete");
		// Should not have original properties that weren't mapped
		expect(res).not.toHaveProperty("name");
		expect(res).not.toHaveProperty("metadata");
		expect(res).not.toHaveProperty("createdAt");
		expect(res).not.toHaveProperty("updatedAt");
	});

	test("should handle DTO transformations with empty arrays", async ({
		expect,
	}) => {
		// Create a test route that returns empty array
		const emptyArrayPlugin = {
			id: "emptyArrayTest",
			routes: {
				testEmptyArray: createEndpoint(
					createRoute({
						operationId: "testEmptyArray",
						path: "/test-empty-array",
						method: "get",
						responses: res(arrayUserSchema).bld(),
					}),
					(_o) => async (ctx) => ctx.render([], 200),
				),
			},
			schemas: { userData: userDataSchema, arrayUserData: arrayUserSchema },
		} satisfies FaireAuthPlugin;

		const emptyArrayOptions = defineOptions({
			plugins: [emptyArrayPlugin],
			dto: {
				userData: (user) => ({
					id: user.id,
					email: user.email,
					displayName: user.name || "Anonymous",
				}),
			},
		});

		const [emptyContext, emptyAuthOptions] = init(emptyArrayOptions);
		const { api: emptyApi } = router(emptyContext, emptyAuthOptions);

		const resp = await emptyApi.testEmptyArray();
		expect(Array.isArray(resp)).toBe(true);
		expect(resp).toHaveLength(0);
	});

	test("should handle concurrent DTO transformations", async ({ expect }) => {
		// Test multiple concurrent requests
		const promises = [
			api.testDto({ json: "top" }),
			api.testDto({ json: "nested" }),
			api.testUserData(),
			api.testArrayResponse(),
		];

		const results = await Promise.all(promises);

		expect(results[0]).toStrictEqual({
			field1: "yep",
			field2: "another",
			nested: { new: "yee", original: "final" },
		});
		expect(results[1]).toStrictEqual({ new: "yee", original: "final" });
		expect(results[2]).toHaveProperty("displayName");
		expect(Array.isArray(results[3])).toBe(true);
	});

	test("should handle DTO errors gracefully", async ({ expect }) => {
		// Test with a DTO that might throw an error
		const errorPlugin = {
			id: "errorTest",
			routes: {
				testErrorDto: createEndpoint(
					createRoute({
						operationId: "testErrorDto",
						path: "/test-error-dto",
						method: "get",
						responses: res(userDataSchema).bld(),
					}),
					(_o) => async (ctx) =>
						ctx.render(
							{
								id: "error-user",
								email: "error@example.com",
								createdAt: new Date(),
								updatedAt: new Date(),
							},
							200,
						),
				),
			},
			schemas: { userData: userDataSchema },
		} satisfies FaireAuthPlugin;

		const errorOptions = defineOptions({
			plugins: [errorPlugin],
			dto: {
				userData: (user) => {
					// Simulate a DTO that might throw
					if (!user.name) throw new Error("Email is required");
					return {
						id: user.id,
						email: user.email,
						displayName: user.name || "Anonymous",
					};
				},
			},
		});

		const [errorContext, errorAuthOptions] = init(errorOptions);
		const { api: errorApi } = router(errorContext, errorAuthOptions);

		// Should handle the error gracefully
		await expect(errorApi.testErrorDto()).resolves.toMatchObject({
			success: false,
		});
	});
});
