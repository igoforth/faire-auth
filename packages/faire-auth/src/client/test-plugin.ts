import { createRoute, registerSchema, res } from "@faire-auth/core/factory";
import { Definitions, SCHEMAS, True } from "@faire-auth/core/static";
import { atom, computed } from "nanostores";
import * as z from "zod";
import { createEndpoint } from "../api/factory/endpoint";
import type { FaireAuthPlugin } from "../types/plugin";
import { useAuthQuery } from "./query";
import type { FaireAuthClientPlugin } from "./types";

const serverPlugin = {
	id: "test",
	routes: {
		test: createEndpoint(
			createRoute({
				operationId: "test",
				method: "get",
				path: "/test",
				responses: res(z.object({ data: z.literal("test") })).bld(),
			}),
			(_o) => async (ctx) => ctx.json({ data: "test" as "test" }, 200),
		),
		testSignOut2: createEndpoint(
			createRoute({
				operationId: "testSignOut2",
				method: "post",
				path: "/test-2/sign-out",
				responses: res(z.null()).bld(),
			}),
			(_o) => async (ctx) => ctx.json(null, 200),
		),
	},
	schema: {
		user: {
			fields: {
				testField: { type: "string", required: false },
				testField2: { type: "number", required: false },
				testField3: { type: "string", returned: false },
				testField4: { type: "string", defaultValue: "test" },
			},
		},
	},
} satisfies FaireAuthPlugin;

export const testClientPlugin = () => {
	const $test = atom(false);
	let testValue = 0;
	const computedAtom = computed($test, () => {
		return testValue++;
	});
	return {
		id: "test" as const,
		getActions(_$fetch) {
			return {
				setTestAtom(value: boolean) {
					$test.set(value);
				},
				test: { signOut: async () => {} },
			};
		},
		getAtoms($fetch) {
			const $signal = atom(false);
			const queryAtom = useAuthQuery<any>($signal, "/test", $fetch, {
				method: "GET",
			});
			return { $test, $signal, computedAtom, queryAtom };
		},
		$InferServerPlugin: {} as typeof serverPlugin,
		atomListeners: [
			{ matcher: (path) => path === "/test", signal: "$test" },
			{
				matcher: (path) => path === "/test2/sign-out",
				signal: "$sessionSignal",
			},
		],
	} satisfies FaireAuthClientPlugin;
};
export const testClientPlugin2 = () => {
	const $test2 = atom(false);
	let testValue = 0;
	const anotherAtom = computed($test2, () => {
		return testValue++;
	});
	return {
		id: "test",
		getAtoms(_$fetch) {
			return { $test2, anotherAtom };
		},
		atomListeners: [
			{ matcher: (path) => path === "/test", signal: "$test" },
			{
				matcher: (path) => path === "/test2/sign-out",
				signal: "$sessionSignal",
			},
		],
	} satisfies FaireAuthClientPlugin;
};

const plugin = {
	id: "foo",
	onRequest: (_c) => {},
	routes: {
		newRoute: createEndpoint(
			createRoute({
				operationId: "newRoute",
				method: "get",
				path: "/new-path",
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

const aPlugin = {
	id: "a-plugin",
	routes: {
		newRoute2: createEndpoint(
			createRoute({
				operationId: "newRoute2",
				method: "get",
				path: "/get-stuff",
				responses: res(SCHEMAS[Definitions.SUCCESS].default).bld(),
			}),
			(_options) => async (ctx) => ctx.render({ success: True }, 200),
		),
	},
	// schemas: { NewSchema2: z.object({ id: z.string() }) },
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
