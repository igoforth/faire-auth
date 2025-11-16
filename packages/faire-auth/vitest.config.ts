import { availableParallelism } from "os";
import { defineConfig, defaultExclude } from "vitest/config";

export default defineConfig({
	cacheDir: "/tmp/.vite",
	test: {
		// typecheck: { enabled: true },
		env: {
			FAIRE_AUTH_URL: "http://localhost:3000",
		},
		deps: {
			optimizer: { web: { enabled: true } },
		},
		setupFiles: ["./test/setup/console.ts"],
		disableConsoleIntercept: true,
		// coverage: { enabled: true },
		logHeapUsage: true,
		benchmark: { include: [] },
		projects: [
			{
				extends: true,
				test: {
					name: "bench",
					environment: "edge-runtime",
					include: [],
					benchmark: { include: ["**\/*.{bench,benchmark}.?(c|m)[jt]s?(x)"] },
					provide: { debugBenchmark: false },
				},
			},
			{
				extends: true,
				test: {
					name: "adapters",
					environment: "edge-runtime",
					include: ["src/adapters/**/*.test.ts"],
					provide: {
						emitDrizzleKitLogs: false,
						emitDrizzleKitErrors: true,
						mongodb: {
							type: "mongodb",
							host: "127.0.0.1",
							port: 27017,
						},
						postgresDrizzle: {
							type: "postgresql",
							host: "127.0.0.1",
							port: 5433,
							database: "faire_auth",
							username: "user",
							password: "password",
							orm: "drizzle",
						},
						postgresKysely: {
							type: "postgresql",
							host: "127.0.0.1",
							port: 5434,
							database: "faire_auth",
							username: "user",
							password: "password",
							orm: "kysely",
						},
						postgresPrisma: {
							type: "postgresql",
							host: "127.0.0.1",
							port: 5435,
							database: "faire_auth",
							username: "user",
							password: "password",
							orm: "prisma",
						},
						mysqlDrizzle: {
							type: "mysql",
							host: "127.0.0.1",
							port: 3306,
							database: "faire_auth",
							username: "user",
							password: "password",
							orm: "drizzle",
						},
						mysqlKysely: {
							type: "mysql",
							host: "127.0.0.1",
							port: 3307,
							database: "faire_auth",
							username: "user",
							password: "password",
							orm: "kysely",
						},
						mysqlPrisma: {
							type: "mysql",
							host: "127.0.0.1",
							port: 3308,
							database: "faire_auth",
							username: "user",
							password: "password",
							orm: "prisma",
						},
						mssql: {
							type: "mssql",
							host: "127.0.0.1",
							port: 1433,
							username: "sa",
							password: "Password123!",
							encrypt: true,
							trustServerCertificate: true,
						},
					},
					globalSetup: ["./test/setup/docker.ts"],
					pool: "forks",
				},
			},
			{
				extends: true,
				test: {
					name: "client",
					environment: "happy-dom",
					include: ["src/client/**/*.test.ts"],
					setupFiles: ["./test/setup/node.ts"],
					pool: "threads",
				},
			},
			{
				extends: true,
				test: {
					name: "app",
					environment: "edge-runtime",
					exclude: [
						...defaultExclude,
						"src/client/**/*.test.ts",
						"src/adapters/**/*.test.ts",
					],
					pool: "threads",
					// pool: "forks",
				},
			},
		],
		// isolate: false, // faster but tests share same global scope
		poolOptions: {
			threads: {
				singleThread: false,
				minThreads: 1,
				maxThreads: availableParallelism(),
			},
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
	},
});
