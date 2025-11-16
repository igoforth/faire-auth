import { faireAuth } from "faire-auth";
import Database from "bun:sqlite";
import { getMigrations } from "faire-auth/db";

const database = new Database(":memory:");

export const auth = faireAuth({
	baseURL: "http://localhost:4000",
	database,
	emailAndPassword: {
		enabled: true,
	},
	logger: {
		level: "debug",
	},
});

const { runMigrations } = await getMigrations(auth.options);

await runMigrations();

const server = Bun.serve({
	fetch: auth.handler,
	port: 0,
});

console.log(server.port);
