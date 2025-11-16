import { execSync, type ExecException } from "child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { inject } from "vitest";
import { getConnectionString } from "../../../test-utils/test-connection";
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

const pgDB = new Pool({
	connectionString: getConnectionString(inject("postgresDrizzle")),
});

const cleanupDatabase = async (shouldDestroy = false) => {
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
	if (shouldDestroy) {
		await pgDB.end();
	}
};

const { execute } = await testAdapter({
	adapter: async (options) => {
		const { schema } = await generateDrizzleSchema(pgDB, options, "pg");
		return drizzleAdapter(drizzle(pgDB), {
			debugLogs: { isRunningAdapterTests: true },
			schema,
			provider: "pg",
			transaction: true,
		});
	},
	async runMigrations(faireAuthOptions) {
		await cleanupDatabase();
		const { fileName } = await generateDrizzleSchema(
			pgDB,
			faireAuthOptions,
			"pg",
		);

		const command = [
			"pnpm",
			"drizzle-kit",
			"push",
			"--dialect=postgresql",
			`--schema=${fileName}.ts`,
			`--url=${getConnectionString(inject("postgresDrizzle"))}`,
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

			msg.push(["Failed to push drizzle schema (pg)"]);

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
	prefixTests: "pg",
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "pg" }),
	],
	async onFinish() {
		await cleanupDatabase(true);
		resetGenerationCount();
	},
});

execute();
