import { afterEach, beforeEach, describe, vi } from "vitest";
import { migrateAction } from "../src/commands/migrate";
import * as config from "../src/utils/get-config";
import { faireAuth, type FaireAuthPlugin } from "faire-auth";
import Database from "better-sqlite3";

describe("migrate base auth instance", (test) => {
	const db = new Database(":memory:");

	const auth = faireAuth({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
	});

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	test("should migrate the database and sign-up a user", async ({ expect }) => {
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			y: true,
		});
		const signUpRes = await auth.api.signUpEmail({
			json: {
				name: "test",
				email: "test@email.com",
				password: "password",
			},
		});
		expect(signUpRes.success).toBe(true);
		if (signUpRes.success) {
			expect(signUpRes.data.token).toBeDefined();
		}
	});
});

describe("migrate auth instance with plugins", (test) => {
	const db = new Database(":memory:");
	const testPlugin = {
		id: "plugin",
		schema: {
			plugin: {
				fields: {
					test: {
						type: "string",
						fieldName: "test",
					},
				},
			},
		},
	} satisfies FaireAuthPlugin;

	const auth = faireAuth({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [testPlugin],
	});

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
	});

	test("should migrate the database and sign-up a user", async ({ expect }) => {
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			y: true,
		});
		const res = db
			.prepare("INSERT INTO plugin (id, test) VALUES (?, ?)")
			.run("1", "test");
		expect(res.changes).toBe(1);
	});
});
