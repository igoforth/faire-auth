import type {
	MongoDBConnection,
	MSSQLConnection,
	MySQLConnection,
	PostgreSQLConnection,
} from "../src/test-utils/test-connection";

declare module "vitest" {
	export interface ProvidedContext {
		emitDrizzleKitLogs: boolean;
		emitDrizzleKitErrors: boolean;
		debugBenchmark: boolean;
		mongodb: MongoDBConnection;
		postgresDrizzle: PostgreSQLConnection;
		postgresKysely: PostgreSQLConnection;
		postgresPrisma: PostgreSQLConnection;
		mysqlDrizzle: MySQLConnection;
		mysqlKysely: MySQLConnection;
		mysqlPrisma: MySQLConnection;
		mssql: MSSQLConnection;
	}
}

export {};
