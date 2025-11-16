import Database from "better-sqlite3";
import { describe, expect, test, vi } from "vitest";
import { faireAuth } from "./auth";
import { createAuthClient } from "./client";
import { init } from "./init";
import { getTestInstance } from "./test-utils/test-instance";
import type { FaireAuthPlugin } from "./types/plugin";
import { True } from "@faire-auth/core/static";

describe("init", async (test) => {
	const database = new Database(":memory:");

	// this is options that are no longer in ctx
	// "options": {
	//   "basePath": "/api/auth",
	//   "baseURL": "http://localhost:3000",
	//   "database": Database {
	//     "inTransaction": false,
	//     "memory": true,
	//     "name": ":memory:",
	//     "open": true,
	//     "readonly": false,
	//   },
	//   "plugins": [],
	//   "secret": "faire-auth-secret-123456789",
	// },

	// this is adapter which is stubbed until initialized
	// "adapter": {
	//   "count": [Function],
	//   "create": [Function],
	//   "createSchema": undefined,
	//   "delete": [Function],
	//   "deleteMany": [Function],
	//   "findMany": [Function],
	//   "findOne": [Function],
	//   "id": "kysely",
	//   "options": {
	//     "adapterConfig": {
	//       "adapterId": "kysely",
	//       "adapterName": "Kysely Adapter",
	//       "debugLogs": false,
	//       "supportsBooleans": false,
	//       "supportsDates": false,
	//       "supportsJSON": false,
	//       "supportsNumericIds": true,
	//       "transaction": [Function],
	//       "usePlural": undefined,
	//     },
	//     "debugLogs": false,
	//     "type": "sqlite",
	//   },
	//   "transaction": [Function],
	//   "update": [Function],
	//   "updateMany": [Function],
	// },
	test("should match config", async (c) => {
		const [{ adapter, ...res }] = init({
			database,
		});
		expect(res).toMatchSnapshot();
	});

	test("should infer BASE_URL from env", async ({ expect }) => {
		vi.stubEnv("FAIRE_AUTH_URL", "http://localhost:5147");
		const [res, options] = init({ database });
		expect(options.baseURL).toBe("http://localhost:5147");
		expect(res.baseURL).toBe("http://localhost:5147/api/auth");
		vi.unstubAllEnvs();
	});

	test("should respect base path", async ({ expect }) => {
		const [res] = init({
			database,
			basePath: "/custom-path",
			baseURL: "http://localhost:5147",
		});
		expect(res.baseURL).toBe("http://localhost:5147/custom-path");
	});

	test("should work with base path", async ({ expect }) => {
		const { client } = await getTestInstance({ basePath: "/custom-path" });

		await client.$fetch("/ok", {
			onSuccess: (ctx) => {
				expect(ctx.data.success).toBe(True);
			},
		});
	});

	test("should execute plugins init", async ({ expect }) => {
		const newBaseURL = "http://test.test";
		const [res] = init({
			database,
			plugins: [
				{
					id: "test",
					init: () => {
						return { context: { baseURL: newBaseURL } };
					},
				},
			],
		});
		expect(res.baseURL).toBe(newBaseURL);
	});

	test("should work with custom path", async ({ expect }) => {
		const customPath = "/custom-path";
		const [ctx] = init({
			database,
			basePath: customPath,
		});
		expect(ctx.baseURL).toBe(`http://localhost:3000${customPath}`);

		const res = faireAuth({
			database,
			basePath: customPath,
		});

		const client = createAuthClient<(typeof res)["app"]>()({
			basePath: customPath,
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return res.handler(new Request(url, init));
				},
			},
		});
		const ok = await client.$fetch("/ok");
		expect(ok.data.success).toBe(True);
	});

	test("should allow plugins to set config values", async ({ expect }) => {
		const [, options] = init({
			database,
			plugins: [
				{
					id: "test-plugin",
					init(ctx) {
						return {
							context: ctx,
							options: { emailAndPassword: { enabled: true } },
						};
					},
				} satisfies FaireAuthPlugin,
			],
		});
		expect(options.emailAndPassword?.enabled).toBe(true);
	});

	test("should not allow plugins to set config values if they are set in the main config", async ({
		expect,
	}) => {
		const [, options] = init({
			database,
			emailAndPassword: { enabled: false },
			plugins: [
				{
					id: "test-plugin",
					init(ctx) {
						return {
							context: ctx,
							options: { emailAndPassword: { enabled: true } },
						};
					},
				} satisfies FaireAuthPlugin,
			],
		});
		expect(options.emailAndPassword?.enabled).toBe(false);
	});

	test("should properly pass modified context from one plugin to another", async ({
		expect,
	}) => {
		const mockProvider = {
			id: "test-oauth-provider",
			name: "Test OAuth Provider",
			createAuthorizationURL: vi.fn(),
			validateAuthorizationCode: vi.fn(),
			refreshAccessToken: vi.fn(),
			getUserInfo: vi.fn(),
		};

		const [ctx] = init({
			database,
			socialProviders: {
				github: {
					clientId: "test-github-id",
					clientSecret: "test-github-secret",
				},
			},
			plugins: [
				{
					id: "test-oauth-plugin",
					init(ctx) {
						return {
							context: {
								socialProviders: [mockProvider, ...ctx.socialProviders],
							},
						};
					},
				} satisfies FaireAuthPlugin,
				{
					id: "test-oauth-plugin-2",
					init(ctx) {
						return { context: ctx };
					},
				} satisfies FaireAuthPlugin,
			],
		});
		expect(ctx.socialProviders).toHaveLength(2);
		const testProvider = ctx.socialProviders.find(
			(p) => p.id === "test-oauth-provider",
		);
		expect(testProvider).toBeDefined();
		expect(testProvider?.refreshAccessToken).toBeDefined();
		const githubProvider = ctx.socialProviders.find((p) => p.id === "github");
		expect(githubProvider).toBeDefined();
	});
});
