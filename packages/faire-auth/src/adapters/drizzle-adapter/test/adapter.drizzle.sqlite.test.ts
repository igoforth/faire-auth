import Database from "better-sqlite3";
import { execSync, type ExecException } from "child_process";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs/promises";
import path from "path";
import { inject } from "vitest";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { drizzleAdapter } from "../drizzle-adapter";
import {
	clearSchemaCache,
	generateDrizzleSchema,
	resetGenerationCount,
} from "./generate-schema";

const dbFilePath = path.join(import.meta.dirname, "test.db");
let sqliteDB = new Database(dbFilePath);

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(sqliteDB, options, "sqlite");
		return drizzleAdapter(drizzle(sqliteDB), {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "sqlite",
		});
	},
	async runMigrations(faireAuthOptions) {
		sqliteDB.close();
		try {
			await fs.unlink(dbFilePath);
		} catch {
			console.log("db file not found");
		}
		sqliteDB = new Database(dbFilePath);

		const { fileName } = await generateDrizzleSchema(
			sqliteDB,
			faireAuthOptions,
			"sqlite",
		);

		const command = [
			"pnpm",
			"drizzle-kit",
			"push",
			"--dialect=sqlite",
			`--schema=${fileName}.ts`,
			`--url=${dbFilePath}`,
		];
		const msg: [message?: any, ...optionalParams: any[]][] = [];

		msg.push(["Command:", command]);
		msg.push(["Options:", faireAuthOptions]);

		try {
			const result = execSync(command.join(" "), {
				cwd: import.meta.dirname,
				stdio: "pipe",
				encoding: "utf8",
			});

			if (result) msg.push([`Output:\n${result.trim()}\n`]);

			if (inject("emitDrizzleKitLogs")) msg.forEach((m) => console.debug(...m));
		} catch (error) {
			const execError = error as ExecException;

			msg.push(["Failed to push drizzle schema (sqlite)"]);

			if (execError.stdout)
				msg.push([
					`stdout:\n${execError.stdout.toString().trim()}${execError.stderr ? "" : "\n"}`,
				]);

			if (execError.stderr)
				msg.push([`stderr:\n${execError.stderr.toString().trim()}\n`]);

			if (inject("emitDrizzleKitErrors"))
				msg.forEach((m) => console.error(...m));
			throw error;
		}
	},
	prefixTests: "sqlite",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "sqlite" }),
	],
	async onFinish() {
		clearSchemaCache();
		resetGenerationCount();
	},
});

execute();
