import { beforeEach, describe, expect, test } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { safeJSONParse } from "../utils/json";

describe("secondary storage - get returns JSON string", async (test) => {
	let store = new Map<string, string>();

	const { client, signIn, testUser } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		},
		rateLimit: {
			enabled: false,
		},
	});

	beforeEach(() => {
		store.clear();
	});

	test("should work end-to-end with string return", async ({ expect }) => {
		expect(store.size).toBe(0);
		const { headers } = await signIn();
		expect(store.size).toBe(2);

		const s1 = await client.getSession.$get(
			{ query: {} },
			{
				headers,
			},
		);
		expect(s1.data?.data).toMatchObject({
			session: {
				userId: expect.any(String),
				token: expect.any(String),
				expiresAt: expect.any(Date),
				ipAddress: expect.any(String),
				// userAgent: expect.any(String),
			},
			user: {
				id: expect.any(String),
				name: testUser.name,
				email: testUser.email,
				emailVerified: false,
				image: null,
				createdAt: expect.any(Date),
				updatedAt: expect.any(Date),
			},
		});

		const list = await client.listSessions.$get({ headers });
		expect(list.data?.data.length).toBe(1);

		const token = s1.data!.data.session.token;
		const revoke = await client.revokeSession.$post(
			{ json: { token } },
			{
				headers,
			},
		);
		expect(revoke.data?.success).toBe(true);

		const after = await client.getSession.$get({ query: {} }, { headers });
		expect(after.data).toBeNull();
		expect(store.size).toBe(0);
	});
});

describe("secondary storage - get returns already-parsed object", async (test) => {
	let store = new Map<string, any>();

	const { client, signIn } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, safeJSONParse(value));
			},
			get(key) {
				return store.get(key);
			},
			delete(key) {
				store.delete(key);
			},
		},
		rateLimit: {
			enabled: false,
		},
	});

	beforeEach(() => {
		store.clear();
	});

	test("should work end-to-end with object return", async ({ expect }) => {
		const { headers } = await signIn();

		const s1 = await client.getSession.$get({ query: {} }, { headers });
		expect(s1.data).not.toBeNull();

		const userId = s1.data!.data.session.userId;
		const activeList = store.get(`active-sessions-${userId}`);
		expect(Array.isArray(activeList)).toBe(true);
		expect(activeList.length).toBe(1);

		const list = await client.listSessions.$get({ headers });
		expect(list.data?.data.length).toBe(1);

		const token = s1.data!.data.session.token;
		const revoke = await client.revokeSession.$post(
			{ json: { token } },
			{
				headers,
			},
		);
		expect(revoke.data?.success).toBe(true);

		const after = await client.getSession.$get({ query: {} }, { headers });
		expect(after.data).toBeNull();
		const activeAfter = store.get(`active-sessions-${userId}`);
		expect(activeAfter ?? null).toBeNull();
	});
});
