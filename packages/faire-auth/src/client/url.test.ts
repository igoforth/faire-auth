import { describe } from "vitest";
import type { InferApp } from "../api";
import { serverPlugin, testClientPlugin } from "./test-plugin";
import { createAuthClient } from "./vanilla";

type PluginApp = InferApp<{ plugins: [typeof serverPlugin] }>;

describe("url", (test) => {
	test("should not require base url", async ({ expect }) => {
		const client = createAuthClient<PluginApp>()({
			plugins: [testClientPlugin()],
			baseURL: "",
			fetchOptions: {
				customFetchImpl: async (_url, _init) =>
					new Response(JSON.stringify({ hello: "world" })),
			},
		});
		const response = await client.test.$get();
		expect(response.data).toEqual({ hello: "world" });
	});

	test("should use base url and append `/api/auth` by default", async ({
		expect,
	}) => {
		const client = createAuthClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, _init) =>
					new Response(JSON.stringify({ url })),
			},
		});
		const response = await client.test.$get();
		expect(response.data).toEqual({
			url: "http://localhost:3000/api/auth/test",
		});
	});

	test("should use base url and use the provider path if provided", async ({
		expect,
	}) => {
		const client = createAuthClient<PluginApp>()({
			plugins: [testClientPlugin()],
			baseURL: "http://localhost:3000/auth",
			fetchOptions: {
				customFetchImpl: async (url, _init) =>
					new Response(JSON.stringify({ url })),
			},
		});
		const response = await client.test.$get();
		expect(response.data).toEqual({ url: "http://localhost:3000/auth/test" });
	});

	test("should use be able to detect `/` in the base url", async ({
		expect,
	}) => {
		const client = createAuthClient<PluginApp>()({
			plugins: [testClientPlugin()],
			basePath: "/",
			fetchOptions: {
				customFetchImpl: async (url, _init) =>
					new Response(JSON.stringify({ url })),
			},
		});
		const response = await client.test.$get();
		expect(response.data).toEqual({ url: "http://localhost:3000/test" });
	});
});
