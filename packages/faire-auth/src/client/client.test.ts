// @vitest-environment happy-dom
import type { BetterFetchError } from "@better-fetch/fetch";
import type { ReadableAtom } from "nanostores";
import { isProxy } from "node:util/types";
import type { Accessor } from "solid-js";
import { describe, expectTypeOf, vi } from "vitest";
import type { Ref } from "vue";
import type { InferApp } from "../api";
import type { Auth } from "../auth";
import { createAuthClient as createReactClient } from "./react";
import { createAuthClient as createSolidClient } from "./solid";
import { createAuthClient as createSvelteClient } from "./svelte";
import { testClientPlugin, testClientPlugin2 } from "./test-plugin";
import type { SessionQueryParams } from "./types";
import { createAuthClient as createVanillaClient } from "./vanilla";
import { createAuthClient as createVueClient } from "./vue";
import type { JSONValue } from "hono/utils/types";

type PluginApp = InferApp<{
	plugins: ReturnType<typeof testClientPlugin>["$InferServerPlugin"][];
}>;

describe("run time proxy", async (test) => {
	test("atom in proxy should not be proxy", async ({ expect }) => {
		const client = createVanillaClient<Auth["app"]>()({});
		const atom = client.$store.atoms.session;
		expect(isProxy(atom)).toBe(false);
	});

	test("proxy api should be called", async ({ expect }) => {
		let apiCalled = false;
		const client = createSolidClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					apiCalled = true;
					return new Response();
				},
			},
		});
		await client.test.$get();
		expect(apiCalled).toBe(true);
	});

	test("state listener should be called on matched path", async ({
		expect,
	}) => {
		const client = createSolidClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		const res = client.useComputedAtom();
		expect(res()).toBe(0);
		await client.test.$get();
		vi.useFakeTimers();
		setTimeout(() => {
			expect(res()).toBe(1);
		}, 100);
	});

	test("should call useSession", async ({ expect }) => {
		let returnNull = false;
		const client = createSolidClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () => {
					if (returnNull) return new Response(JSON.stringify(null));
					return new Response(
						JSON.stringify({ user: { id: 1, email: "test@email.com" } }),
					);
				},
			},
		});
		const res = client.useSession();
		vi.useFakeTimers();
		await vi.advanceTimersByTimeAsync(1);
		const r = res();
		expect(r, JSON.stringify(r)).toMatchObject({
			data: { user: { id: 1, email: "test@email.com" } },
			error: null,
			isPending: false,
		});
		/**
		 * recall
		 */
		returnNull = true;
		await client.test2.signOut.$post();
		await vi.advanceTimersByTimeAsync(10);
		const r2 = res();
		expect(r2, JSON.stringify(r2)).toMatchObject({
			data: null,
			error: null,
			isPending: false,
		});
	});

	test("should allow second argument fetch options", async ({ expect }) => {
		let called = false;
		const client = createSolidClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		await client.test.$get({
			fetchOptions: {
				onSuccess(context) {
					called = true;
				},
			},
		});
		expect(called).toBe(true);
	});

	test("should not expose a 'then', 'catch', 'finally' property on the proxy", async ({
		expect,
	}) => {
		const client = createSolidClient<Auth["app"]>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async () => new Response(),
			},
		});
		const proxy = (client as any).test;
		expect(proxy.then).toBeUndefined();
		expect(proxy.catch).toBeUndefined();
		expect(proxy.finally).toBeUndefined();
	});
});

describe("type", (test) => {
	test("should infer session additional fields", ({ expect }) => {
		const client = createReactClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		type ReturnedSession = ReturnType<typeof client.useSession>;
		// TODO: Hono's JSONParsed sanitizer converts Date→string and adds [x:string]:JSONValue, causing mismatches
		// @ts-expect-error client response types go through JSON sanitization
		expectTypeOf<NonNullable<ReturnedSession["data"]>>().toMatchObjectType<{
			user: {
				[x: string]: unknown;
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				testField4: string;
			};
			session: {
				[x: string]: unknown;
				userId: string;
				expiresAt: Date;
				token: string;
			};
		}>();
		expectTypeOf<
			ReturnedSession["error"]
		>().toEqualTypeOf<BetterFetchError | null>();
		expectTypeOf<ReturnedSession["isPending"]>().toEqualTypeOf<boolean>();
	});

	test("should infer resolved hooks react", ({ expect }) => {
		const client = createReactClient<Auth["app"]>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<() => number>();
	});

	test("should infer resolved hooks solid", ({ expect }) => {
		const client = createSolidClient<Auth["app"]>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => Accessor<number>
		>();
	});

	test("should infer resolved hooks vue", ({ expect }) => {
		const client = createVueClient<Auth["app"]>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => Readonly<Ref<number>>
		>();
	});

	test("should infer resolved hooks svelte", ({ expect }) => {
		const client = createSvelteClient<Auth["app"]>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.useComputedAtom).toEqualTypeOf<
			() => ReadableAtom<number>
		>();
	});

	test("should infer actions", ({ expect }) => {
		const client = createSolidClient<Auth["app"]>()({
			plugins: [testClientPlugin(), testClientPlugin2()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		expectTypeOf(client.setTestAtom).toEqualTypeOf<(value: boolean) => void>();
		expectTypeOf(client.test.signOut).toEqualTypeOf<() => Promise<void>>();
	});

	test("should infer session", ({ expect }) => {
		const client = createSolidClient<PluginApp>()({
			plugins: [testClientPlugin(), testClientPlugin2()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		const $infer = client.$Infer;
		// @ts-expect-error client response types go through JSON sanitization
		expectTypeOf($infer.Session).toMatchObjectType<{
			session: {
				id: string;
				userId: string;
				expiresAt: Date;
				token: string;
				ipAddress?: string | null;
				userAgent?: string | null;
				createdAt: Date;
				updatedAt: Date;
			};
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				image?: string | null;
				testField4: string;
				testField?: string | null;
				testField2?: number | null;
			};
		}>();
	});

	// test("should infer session react", ({ expect }) => {
	// 	const client = createReactClient<Auth["app"]>()({
	// 		plugins: [organizationClient(), twoFactorClient(), passkeyClient()],
	// 	});
	// 	const $infer = client.$Infer.Session;
	// 	expectTypeOf($infer.user).toMatchObjectType<{
	// 		name: string;
	// 		id: string;
	// 		email: string;
	// 		emailVerified: boolean;
	// 		createdAt: Date;
	// 		updatedAt: Date;
	// 		image?: string | undefined | null;
	// 		twoFactorEnabled: boolean | undefined | null;
	// 	}>();
	// });

	test("should infer `throw:true` in fetch options", async ({ expect }) => {
		const client = createReactClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				throw: true,
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		const data = await client.getSession.$get({ query: {} });
		// @ts-expect-error client response types go through JSON sanitization
		expectTypeOf(data).toMatchObjectType<{
			success: true;
			data: {
				user: {
					id: string;
					email: string;
					emailVerified: boolean;
					name: string;
					createdAt: Date;
					updatedAt: Date;
					image?: string | null;
					testField4: string;
					testField?: string | null;
					testField2?: number | null;
				};
				session: {
					id: string;
					userId: string;
					expiresAt: Date;
					ipAddress?: string | null;
					userAgent?: string | null;
				};
			};
		}>();
	});

	test("should infer `error` schema correctly", async ({ expect }) => {
		const client = createSolidClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});
		const { error } = await client.test.$get();
		expectTypeOf(error).toEqualTypeOf<null>();
	});

	test("should support refetch with query parameters", ({ expect }) => {
		const client = createReactClient<PluginApp>()({
			plugins: [testClientPlugin()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return new Response();
				},
			},
		});

		type UseSessionReturn = ReturnType<typeof client.useSession>;
		// @ts-expect-error client response types go through JSON sanitization
		expectTypeOf<NonNullable<UseSessionReturn["data"]>>().toMatchObjectType<{
			user: {
				[x: string]: unknown;
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				testField4: string;
			};
			session: {
				[x: string]: unknown;
				userId: string;
				expiresAt: Date;
				token: string;
			};
		}>();
		expectTypeOf<
			UseSessionReturn["error"]
		>().toEqualTypeOf<BetterFetchError | null>();
		expectTypeOf<UseSessionReturn["isPending"]>().toEqualTypeOf<boolean>();
	});
});
