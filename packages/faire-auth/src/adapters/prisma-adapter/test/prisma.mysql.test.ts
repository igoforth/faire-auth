import type { FaireAuthOptions } from "../../../types";
import { createPool } from "mysql2/promise";
import { testAdapter } from "../../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	numberIdTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../../tests";
import { prismaAdapter } from "../prisma-adapter";
import { generateAuthConfigFile } from "./generate-auth-config";
import { generatePrismaSchema } from "./generate-prisma-schema";
import {
	destroyPrismaClient,
	getPrismaClient,
	incrementMigrationCount,
} from "./get-prisma-client";
import { pushPrismaSchema } from "./push-prisma-schema";
import { getConnectionString } from "../../../test-utils/test-connection";
import { inject } from "vitest";

const dialect = "mysql";
const { execute } = await testAdapter({
	adapter: async () => {
		const db = await getPrismaClient(dialect);
		return prismaAdapter(db, {
			provider: dialect,
			debugLogs: { isRunningAdapterTests: true },
		});
	},
	runMigrations: async (options: FaireAuthOptions) => {
		const mysqlDB = createPool({
			uri: getConnectionString(inject("mysqlPrisma")),
			timezone: "Z",
		});
		await mysqlDB.query("DROP DATABASE IF EXISTS faire_auth");
		await mysqlDB.query("CREATE DATABASE faire_auth");
		await mysqlDB.end();
		const db = await getPrismaClient(dialect);
		const migrationCount = incrementMigrationCount();
		await generateAuthConfigFile(options);
		await generatePrismaSchema(options, db, migrationCount, dialect);
		await pushPrismaSchema(dialect);
		destroyPrismaClient({ migrationCount: migrationCount - 1, dialect });
	},
	tests: [
		normalTestSuite(),
		transactionsTestSuite(),
		authFlowTestSuite(),
		numberIdTestSuite(),
		performanceTestSuite({ dialect }),
	],
	onFinish: async () => {},
	prefixTests: dialect,
});

execute();
