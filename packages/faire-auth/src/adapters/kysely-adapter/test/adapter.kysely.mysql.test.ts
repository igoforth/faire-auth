import { Kysely, MysqlDialect } from "kysely";
import { createPool } from "mysql2/promise";
import { assert, inject } from "vitest";
import { getMigrations } from "../../../db";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { kyselyAdapter } from "../kysely-adapter";
import { getConnectionString } from "../../../test-utils/test-connection";

const mysqlDB = createPool({
	uri: getConnectionString(inject("mysqlKysely")),
	timezone: "Z",
});

let kyselyDB = new Kysely({
	dialect: new MysqlDialect(mysqlDB),
});

const { execute } = await testAdapter({
	adapter: () =>
		kyselyAdapter(kyselyDB, {
			type: "mysql",
			debugLogs: { isRunningAdapterTests: true },
		}),
	async runMigrations(faireAuthOptions) {
		await mysqlDB.query("DROP DATABASE IF EXISTS faire_auth");
		await mysqlDB.query("CREATE DATABASE faire_auth");
		await mysqlDB.query("USE faire_auth");
		const opts = Object.assign(faireAuthOptions, { database: mysqlDB });
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();

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
	},
});
execute();
