import { describe } from "vitest";
import { prismaAdapter } from "faire-auth/adapters/prisma";
import { generatePrismaSchema } from "../src/generators/prisma";
import { organization, twoFactor, username } from "faire-auth/plugins";
import { generateDrizzleSchema } from "../src/generators/drizzle";
import { drizzleAdapter } from "faire-auth/adapters/drizzle";
import { generateMigrations } from "../src/generators/kysely";
import Database from "better-sqlite3";
import type { FaireAuthOptions, FaireAuthPlugin } from "faire-auth";
import { generateAuthConfig } from "../src/generators/auth-config";
import type { SupportedPlugin } from "../src/commands/init";

describe("generate", async (test) => {
	test("should generate prisma schema", async ({ expect }) => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "postgresql",
				},
			)({} as FaireAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "postgresql",
					},
				),
				plugins: [twoFactor(), username()] as FaireAuthPlugin[],
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema.prisma",
		);
	});

	test("should generate prisma schema with number id", async ({ expect }) => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "postgresql",
				},
			)({} as FaireAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "postgresql",
					},
				),
				plugins: [twoFactor(), username()] as FaireAuthPlugin[],
				advanced: {
					database: {
						useNumberId: true,
					},
				},
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-numberid.prisma",
		);
	});

	test("should generate prisma schema for mongodb", async ({ expect }) => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "mongodb",
				},
			)({} as FaireAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "mongodb",
					},
				),
				plugins: [twoFactor(), username()] as FaireAuthPlugin[],
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-mongodb.prisma",
		);
	});

	test("should generate prisma schema for mysql", async ({ expect }) => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "mysql",
				},
			)({} as FaireAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "mongodb",
					},
				),
				plugins: [twoFactor(), username()] as FaireAuthPlugin[],
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-mysql.prisma",
		);
	});

	test("should generate prisma schema for mysql with custom model names", async ({
		expect,
	}) => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: prismaAdapter(
				{},
				{
					provider: "mysql",
				},
			)({} as FaireAuthOptions),
			options: {
				database: prismaAdapter(
					{},
					{
						provider: "mongodb",
					},
				),
				plugins: [
					twoFactor(),
					username(),
					organization({
						schema: {
							organization: {
								modelName: "workspace",
							},
							invitation: {
								modelName: "workspaceInvitation",
							},
						},
					}),
				] as FaireAuthPlugin[],
			},
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/schema-mysql-custom.prisma",
		);
	});

	test("should generate drizzle schema", async ({ expect }) => {
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
				plugins: [twoFactor(), username()] as FaireAuthPlugin[],
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
			"./__snapshots__/auth-schema.txt",
		);
	});

	test("should generate drizzle schema with number id", async ({ expect }) => {
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
				plugins: [twoFactor(), username()] as FaireAuthPlugin[],
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
			"./__snapshots__/auth-schema-number-id.txt",
		);
	});

	test("should generate kysely schema", async ({ expect }) => {
		const schema = await generateMigrations({
			file: "test.sql",
			options: {
				database: new Database(":memory:"),
			},
			adapter: {} as any,
		});
		await expect(schema.code).toMatchFileSnapshot(
			"./__snapshots__/migrations.sql",
		);
	});

	test("should add plugin to empty plugins array without leading comma", async ({
		expect,
	}) => {
		const initialConfig = `export const auth = faireAuth({
			plugins: []
		});`;

		const mockFormat = (code: string) => Promise.resolve(code);
		const mockSpinner = { stop: () => {} };
		const plugins: SupportedPlugin[] = [
			{
				id: "next-cookies",
				name: "nextCookies",
				path: "faire-auth/next-js",
				clientName: undefined,
				clientPath: undefined,
			},
		];

		const result = await generateAuthConfig({
			format: mockFormat,
			current_user_config: initialConfig,
			spinner: mockSpinner as any,
			plugins,
			database: null,
		});

		expect(result.generatedCode).toContain(`plugins: [nextCookies()]`);
		expect(result.generatedCode).not.toContain(`plugins: [, nextCookies()]`);
	});
});

describe("JSON field support in CLI generators", (test) => {
	test("should generate Drizzle schema with JSON fields for PostgreSQL", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: {
					provider: "pg",
					schema: {},
				},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as FaireAuthOptions,
		});
		await expect(schema.code).toContain("preferences: jsonb(");
	});

	test("should generate Drizzle schema with JSON fields for MySQL", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: {
					provider: "mysql",
					schema: {},
				},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as FaireAuthOptions,
		});
		await expect(schema.code).toContain("preferences: json(");
	});

	test("should generate Drizzle schema with JSON fields for SQLite", async ({
		expect,
	}) => {
		const schema = await generateDrizzleSchema({
			file: "test.drizzle",
			adapter: {
				id: "drizzle",
				options: {
					provider: "sqlite",
					schema: {},
				},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as FaireAuthOptions,
		});
		await expect(schema.code).toContain("preferences: text(");
	});

	test("should generate Prisma schema with JSON fields", async ({ expect }) => {
		const schema = await generatePrismaSchema({
			file: "test.prisma",
			adapter: {
				id: "prisma",
				options: {},
			} as any,
			options: {
				database: {} as any,
				user: {
					additionalFields: {
						preferences: {
							type: "json",
						},
					},
				},
			} as FaireAuthOptions,
		});
		await expect(schema.code).toContain("preferences   Json?");
	});
});
