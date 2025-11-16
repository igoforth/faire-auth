import { faireAuth } from "faire-auth";
import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "faire-auth/db";

const database = new DatabaseSync(":memory:");

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

Deno.serve(
	{
		port: 0,
		onListen: ({ port }) => {
			console.log(`Listening on http://localhost:${port}`);
		},
	},
	auth.handler,
);
