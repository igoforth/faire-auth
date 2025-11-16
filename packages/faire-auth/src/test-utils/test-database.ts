import Database from "better-sqlite3";
import {
	Kysely,
	MysqlDialect,
	PostgresDialect,
	type SqliteDatabase,
	sql,
} from "kysely";
import { MongoClient } from "mongodb";
import { createPool } from "mysql2/promise";
import { Pool } from "pg";
import { afterAll } from "vitest";
import { mongodbAdapter } from "../adapters/mongodb-adapter";

export type TestDatabaseType = "sqlite" | "postgres" | "mysql" | "mongodb";

const cleanupSet = new Set<Function>();

afterAll(async () => {
	for (const cleanup of cleanupSet) {
		await cleanup();
		cleanupSet.delete(cleanup);
	}
});

export type GetTestDatabaseResult<T extends TestDatabaseType> =
	T extends "sqlite"
		? SqliteDatabase
		: T extends "postgres"
			? { db: Kysely<any>; type: "postgres" }
			: T extends "mysql"
				? { db: Kysely<any>; type: "mysql" }
				: T extends "mongodb"
					? ReturnType<typeof mongodbAdapter>
					: never;

export const getTestDatabase = async <T extends TestDatabaseType>(
	testWith: T = "sqlite" as T,
): Promise<GetTestDatabaseResult<T>> => {
	switch (testWith) {
		case "sqlite": {
			const sqlite = new Database(":memory:") as SqliteDatabase;

			cleanupSet.add(() => {
				sqlite.close();
				return Promise.resolve();
			});

			return sqlite as GetTestDatabaseResult<T>;
		}

		case "postgres": {
			const postgres = new Kysely({
				dialect: new PostgresDialect({
					pool: new Pool({
						connectionString:
							"postgres://user:password@localhost:5434/faire_auth",
					}),
				}),
			});

			cleanupSet.add(async () => {
				await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(
					postgres,
				);
				await postgres.destroy();
			});

			return { db: postgres, type: "postgres" } as GetTestDatabaseResult<T>;
		}

		case "mysql": {
			const mysql = new Kysely({
				dialect: new MysqlDialect(
					createPool("mysql://user:password@localhost:3306/faire_auth"),
				),
			});

			cleanupSet.add(async () => {
				await sql`SET FOREIGN_KEY_CHECKS = 0;`.execute(mysql);
				const tables = await mysql.introspection.getTables();
				for (const table of tables) {
					// @ts-expect-error Argument of type 'string' is not assignable to parameter of type 'TableExpressionOrList<unknown, never>'
					await mysql.deleteFrom(table.name).execute();
				}
				await sql`SET FOREIGN_KEY_CHECKS = 1;`.execute(mysql);
			});

			return { db: mysql, type: "mysql" } as GetTestDatabaseResult<T>;
		}

		case "mongodb": {
			const client = new MongoClient("mongodb://127.0.0.1:27017");
			await client.connect();
			const db = client.db("faire-auth");

			cleanupSet.add(async () => {
				const collections = await db.listCollections().toArray();
				for (const c of collections) {
					await db.collection(c.name).deleteMany({});
				}
				await client.close();
			});

			return mongodbAdapter(db) as GetTestDatabaseResult<T>;
		}

		default:
			throw new Error(`Unsupported test database type: ${testWith}`);
	}
};
