import { Hono } from "hono";

import { faireAuth } from "faire-auth";
import { createDrizzle } from "./db";
import { drizzleAdapter } from "faire-auth/adapters/drizzle";

interface CloudflareBindings {
	DB: D1Database;
}

const createAuth = (env: CloudflareBindings) =>
	faireAuth({
		baseURL: "http://localhost:4000",
		database: drizzleAdapter(createDrizzle(env.DB), { provider: "sqlite" }),
		emailAndPassword: {
			enabled: true,
		},
		logger: {
			level: "debug",
		},
	});

type Auth = ReturnType<typeof createAuth>;

export default new Hono<{
	Bindings: CloudflareBindings;
	Variables: { auth: Auth };
}>()
	.use(async (c, next) => {
		const auth = createAuth(c.env);
		c.set("auth", auth);
		await next();
	})
	.on(["POST", "GET"], "/api/auth/*", (c) => c.get("auth").handler(c.req.raw))
	.get("/", async (c) => {
		const session = await c.get("auth").api.getSession(
			{ query: {} },
			{
				headers: c.req.raw.headers,
			},
		);
		if (session.success) return c.text("Hello " + session.data.user.name);
		return c.text("Not logged in");
	}) satisfies ExportedHandler<CloudflareBindings>;
