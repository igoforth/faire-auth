import { faireAuth } from "faire-auth";
import Database from "better-sqlite3";
import { getMigrations } from "faire-auth/db";

const database = new Database(":memory:");
const baseURL = process.env.BASE_URL || "http://localhost:3000";

export const auth = faireAuth({
	database,
	baseURL,
	emailAndPassword: {
		enabled: true,
	},
});

const { runMigrations } = await getMigrations(auth.options);

await runMigrations();
// Create an example user
await auth.api.signUpEmail({
	json: {
		name: "Test User",
		email: "test@test.com",
		password: "password123",
	},
});
