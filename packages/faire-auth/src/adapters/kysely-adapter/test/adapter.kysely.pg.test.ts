import type { FaireAuthOptions } from "../../../types";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
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
import { inject } from "vitest";

const pgDB = new Pool({
	connectionString: getConnectionString(inject("postgresKysely")),
});

let kyselyDB = new Kysely({
	dialect: new PostgresDialect({ pool: pgDB }),
});

const cleanupDatabase = async () => {
	await pgDB.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`);
};

const { execute } = await testAdapter({
	adapter: () =>
		kyselyAdapter(kyselyDB, {
			type: "postgres",
			debugLogs: { isRunningAdapterTests: true },
		}),
	prefixTests: "pg",
	async runMigrations(faireAuthOptions) {
		await cleanupDatabase();
		const opts = Object.assign(faireAuthOptions, {
			database: pgDB,
		} satisfies FaireAuthOptions);
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite({ disableTests: { ALL: true } }),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect: "pg" }),
	],
	async onFinish() {
		await pgDB.end();
	},
});
execute();
