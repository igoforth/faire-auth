// @vitest-environment happy-dom
import type { BetterFetchError } from "@better-fetch/fetch";
import type { ReadableAtom } from "nanostores";
import { isProxy } from "node:util/types";
import type { Accessor } from "solid-js";
import { describe, expect, expectTypeOf, test, vi } from "vitest";
import type { Ref } from "vue";
import type { InferApp } from "../api";
import type { Auth } from "../auth";
import type { Session } from "../types/models";
import { createAuthClient as createReactClient } from "./react";
import { createAuthClient as createSolidClient } from "./solid";
import { createAuthClient as createSvelteClient } from "./svelte";
import { testClientPlugin, testClientPlugin2 } from "./test-plugin";
import type { SessionQueryParams } from "./types";
import { createAuthClient as createVanillaClient } from "./vanilla";
import { createAuthClient as createVueClient } from "./vue";

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
		expectTypeOf<ReturnedSession>().toMatchObjectType<{
			data: {
				user: {
					id: string;
					email: string;
					emailVerified: boolean;
					name: string;
					createdAt: Date;
					updatedAt: Date;
					image?: string | undefined | null;
					testField4: string;
					testField?: string | undefined | null;
					testField2?: number | undefined | null;
				};
				session: Session;
			} | null;
			error: BetterFetchError | null;
			isPending: boolean;
		}>();
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
		expectTypeOf($infer.Session).toEqualTypeOf<{
			session: {
				id: string;
				userId: string;
				expiresAt: Date;
				token: string;
				ipAddress?: string | undefined | null;
				userAgent?: string | undefined | null;
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
				image?: string | undefined | null;
				testField4: string;
				testField?: string | undefined | null;
				testField2?: number | undefined | null;
			};
		}>();
	});

	// test("should infer session react", ({ expect }) => {
	// 	const client = createReactClient<Auth["app"]>()({
	// 		plugins: [organizationClient(), twoFactorClient(), passkeyClient()],
	// 	});
	// 	const $infer = client.$Infer.Session;
	// 	expectTypeOf($infer.user).toEqualTypeOf<{
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
					image?: string | undefined | null;
					testField4: string;
					testField?: string | undefined | null;
					testField2?: number | undefined | null;
				};
				session: {
					id: string;
					userId: string;
					expiresAt: Date;
					ipAddress?: string | undefined | null;
					userAgent?: string | undefined | null;
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
		expectTypeOf(error!).toMatchObjectType<{
			code: number;
			message: string;
			test: boolean;
		}>();
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
		expectTypeOf<UseSessionReturn>().toMatchObjectType<{
			data: {
				user: {
					id: string;
					email: string;
					emailVerified: boolean;
					name: string;
					createdAt: Date;
					updatedAt: Date;
					image?: string | undefined | null;
					testField4: string;
					testField?: string | undefined | null;
					testField2?: number | undefined | null;
				};
				session: Session;
			} | null;
			isPending: boolean;
			error: BetterFetchError | null;
			refetch: (queryParams?: { query?: SessionQueryParams }) => void;
		}>();
	});
});
