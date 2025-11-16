import { registerSchema, res } from "@faire-auth/core/factory";
import { Definitions, SCHEMAS, True } from "@faire-auth/core/static";
import type { FaireAuthClientPlugin, FaireAuthPlugin } from "faire-auth";
import { defineOptions } from "faire-auth";
import { createEndpoint, createRoute } from "faire-auth/plugins";
import * as z from "zod";

export const plugin = {
	id: "foo",
	onRequest: (_c) => {},
	routes: {
		newRoute: createEndpoint(
			createRoute({
				operationId: "newRoute",
				method: "get",
				path: "/new-route",
				responses: res(z.null()).bld(),
			}),
			(_options) => async (c, _next) => c.json(null, 200),
		),
	},
	schemas: {
		newSchema: registerSchema(z.object({ id: z.string() }), {
			id: "newSchema",
		}),
	},
	middleware: { getAccountInfo: (_c, next) => next() },
} satisfies FaireAuthPlugin;

export const aPlugin = {
	id: "a-plugin",
	routes: {
		newRoute2: createEndpoint(
			createRoute({
				operationId: "newRoute2",
				method: "get",
				path: "/new-route-2",
				responses: res(SCHEMAS[Definitions.SUCCESS].default).bld(),
			}),
			(_options) => async (ctx) => ctx.render({ success: True }, 200),
		),
	},
} satisfies FaireAuthPlugin;

export const pluginClient = () =>
	({
		id: "foo" as const,
		$InferServerPlugin: {} as typeof plugin,
	}) satisfies FaireAuthClientPlugin;

export const aPluginClient = () =>
	({
		id: "a-plugin" as const,
		$InferServerPlugin: {} as typeof aPlugin,
	}) satisfies FaireAuthClientPlugin;

export const cfg = defineOptions({
	baseURL: "http://localhost:3000",
	plugins: [aPlugin, plugin],
	routeHooks: {
		updateUser: (result, ctx) => {
			return undefined;
		},
	},
	dto: {
		// user: (a) => ({ id: a.id }),
	},
	middleware: {
		newRoute: async (_ctx, next) => await next(),
		getAccountInfo: async (_ctx, next) => await next(),
	},
	rateLimit: { enabled: true, customRules: { "/get-session": (req) => false } },
});
