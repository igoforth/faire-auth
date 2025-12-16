import { describe } from "vitest";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { drizzleAdapter } from "faire-auth/adapters/drizzle";
import { twoFactor, username } from "faire-auth/plugins";
import { passkey } from "faire-auth/plugins/passkey";
import type { FaireAuthOptions } from "faire-auth";

describe("generate drizzle schema for all databases", async (test) => {
	test("should generate drizzle schema for MySQL", async ({ expect }) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
						schema: {},
					},
				),
				plugins: [twoFactor(), username()],
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-mysql.txt",
		);
	});

	test("should generate drizzle schema for SQLite", async ({ expect }) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "sqlite",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "sqlite",
						schema: {},
					},
				),
				plugins: [twoFactor(), username()],
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-sqlite.txt",
		);
	});

	test("should generate drizzle schema for MySQL with number id", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
						schema: {},
					},
				),
				plugins: [twoFactor(), username()],
				advanced: {
					database: {
						useNumberId: true,
					},
				},
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-mysql-number-id.txt",
		);
	});

	test("should generate drizzle schema for SQLite with number id", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "sqlite",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "sqlite",
						schema: {},
					},
				),
				plugins: [twoFactor(), username()],
				advanced: {
					database: {
						useNumberId: true,
					},
				},
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-sqlite-number-id.txt",
		);
	});
});

describe("generate drizzle schema for all databases with passkey plugin", async (test) => {
	test("should generate drizzle schema for MySQL with passkey plugin", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
						schema: {},
					},
				),
				plugins: [passkey()],
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-mysql-passkey.txt",
		);
	});

	test("should generate drizzle schema for SQLite with passkey plugin", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "sqlite",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "sqlite",
						schema: {},
					},
				),
				plugins: [passkey()],
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-sqlite-passkey.txt",
		);
	});

	test("should generate drizzle schema for PostgreSQL with passkey plugin", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "pg",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "pg",
						schema: {},
					},
				),
				plugins: [passkey()],
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-pg-passkey.txt",
		);
	});

	test("should generate drizzle schema for MySQL with passkey plugin and number id", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "mysql",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "mysql",
						schema: {},
					},
				),
				plugins: [passkey()],
				advanced: {
					database: {
						useNumberId: true,
					},
				},
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-mysql-passkey-number-id.txt",
		);
	});

	test("should generate drizzle schema for SQLite with passkey plugin and number id", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: drizzleAdapter(
				{},
				{
					provider: "sqlite",
					schema: {},
				},
			)({} as FaireAuthOptions),
			options: {
				database: drizzleAdapter(
					{},
					{
						provider: "sqlite",
						schema: {},
					},
				),
				plugins: [passkey()],
				advanced: {
					database: {
						useNumberId: true,
					},
				},
				user: {
					modelName: "custom_user",
				},
				account: {
					modelName: "custom_account",
				},
				session: {
					modelName: "custom_session",
				},
				verification: {
					modelName: "custom_verification",
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/auth-schema-sqlite-passkey-number-id.txt",
		);
	});
});
