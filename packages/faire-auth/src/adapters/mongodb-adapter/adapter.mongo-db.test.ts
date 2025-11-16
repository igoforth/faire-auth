import { MongoClient, ObjectId } from "mongodb";
import { testAdapter } from "../test-adapter";
import {
	authFlowTestSuite,
	normalTestSuite,
	performanceTestSuite,
	transactionsTestSuite,
} from "../tests";
import { mongodbAdapter } from "./mongodb-adapter";
import { getConnectionString } from "../../test-utils/test-connection";
import { inject } from "vitest";

const dbClient = async (connectionString: string) => {
	const client = new MongoClient(connectionString);
	await client.connect();
	const db = client.db();
	return { db, client };
};

const { db, client } = await dbClient(getConnectionString(inject("mongodb")));

const { execute } = await testAdapter({
	adapter: (options) => {
		return mongodbAdapter(db, { transaction: false });
	},
	runMigrations: async (faireAuthOptions) => {},
	tests: [
		normalTestSuite(),
		authFlowTestSuite(),
		transactionsTestSuite(),
		// numberIdTestSuite(), // Mongo doesn't support number ids
		performanceTestSuite(),
	],
	customIdGenerator: () => new ObjectId().toString(),
});

execute();
