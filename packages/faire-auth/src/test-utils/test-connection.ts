export type MongoDBConnection = {
	type: "mongodb";
	host: string;
	port: number;
	database?: string;
	username?: string;
	password?: string;
	authSource?: string;
	replicaSet?: string;
	ssl?: boolean;
	connectionString?: string;
};

export type PostgreSQLConnection = {
	type: "postgresql";
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	ssl?: boolean;
	schema?: string;
	connectionString?: string;
	// ORM-specific metadata
	orm?: "drizzle" | "kysely" | "prisma" | "none";
};

export type MySQLConnection = {
	type: "mysql";
	host: string;
	port: number;
	database: string;
	username: string;
	password: string;
	ssl?: boolean;
	connectionString?: string;
	// ORM-specific metadata
	orm?: "drizzle" | "kysely" | "prisma" | "none";
};

export type MSSQLConnection = {
	type: "mssql";
	host: string;
	port: number;
	database?: string;
	username: string;
	password: string;
	encrypt?: boolean;
	trustServerCertificate?: boolean;
	connectionString?: string;
};

/**
 * Ubiquitous database connection type
 * Use type discrimination on the 'type' field to narrow the connection
 */
export type DatabaseConnection =
	| MongoDBConnection
	| PostgreSQLConnection
	| MySQLConnection
	| MSSQLConnection;

// Example usage with type guards
export function getConnectionString(conn: DatabaseConnection): string {
	if (conn.connectionString) {
		return conn.connectionString;
	}

	switch (conn.type) {
		case "mongodb":
			const mongoAuth =
				conn.username && conn.password
					? `${conn.username}:${conn.password}@`
					: "";
			return `mongodb://${mongoAuth}${conn.host}:${conn.port}/${conn.database || ""}`;

		case "postgresql":
			return `postgresql://${conn.username}:${conn.password}@${conn.host}:${conn.port}/${conn.database}`;

		case "mysql":
			return `mysql://${conn.username}:${conn.password}@${conn.host}:${conn.port}/${conn.database}`;

		case "mssql":
			return `mssql://${conn.username}:${conn.password}@${conn.host}:${conn.port}${conn.database ? `/${conn.database}` : ""}`;
	}
}
