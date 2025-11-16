import { execSync, type ExecException } from "child_process";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { assert, inject } from "vitest";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { drizzleAdapter } from "../drizzle-adapter";
import { generateDrizzleSchema, resetGenerationCount } from "./generate-schema";
import { getConnectionString } from "../../../test-utils/test-connection";

const mysqlDB = createPool({
	uri: getConnectionString(inject("mysqlDrizzle")),
	timezone: "Z",
});

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(mysqlDB, options, "mysql");
		return drizzleAdapter(drizzle(mysqlDB), {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "mysql",
		});
	},
	async runMigrations(faireAuthOptions) {
		await mysqlDB.query("DROP DATABASE IF EXISTS faire_auth");
		await mysqlDB.query("CREATE DATABASE faire_auth");
		await mysqlDB.query("USE faire_auth");

		const { fileName } = await generateDrizzleSchema(
			mysqlDB,
			faireAuthOptions,
			"mysql",
		);

		const command = [
			"pnpm",
			"drizzle-kit",
			"push",
			"--dialect=mysql",
			`--schema=${fileName}.ts`,
			`--url=${getConnectionString(inject("mysqlDrizzle"))}`,
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

			msg.push(["Failed to push drizzle schema (mysql)"]);

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

		// ensure migrations were run successfully
		const [tables_result] = (await mysqlDB.query("SHOW TABLES")) as unknown as [
			{ Tables_in_faire_auth: string }[],
		];
		const tables = tables_result.map((table) => table.Tables_in_faire_auth);
		assert(tables.length > 0, "No tables found");
	},
	prefixTests: "mysql",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "mysql" }),
	],
	async onFinish() {
		await mysqlDB.end();
		resetGenerationCount();
	},
});

execute();
