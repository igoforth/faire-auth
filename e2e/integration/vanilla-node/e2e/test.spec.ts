import { test, expect } from "@playwright/test";
import { runClient, setup } from "./utils";

const { ref, start, clean } = setup();
test.describe("vanilla-node", () => {
	test.beforeEach(async () => start());
	test.afterEach(async () => clean());

	test("signIn with existing email and password should work", async ({
		page,
	}) => {
		await page.goto(
			`http://localhost:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await expect(
			runClient(page, ({ client }) => typeof client !== "undefined"),
		).resolves.toBe(true);
		const sessionResult = await runClient(page, async ({ client }) =>
			client.getSession.$get({ query: {} }),
		);
		expect(sessionResult.data).toBeNull();
		await runClient(page, ({ client }) =>
			client.signIn.email.$post({
				json: {
					email: "test@test.com",
					password: "password123",
				},
			}),
		);

		// Check that the session is now set
		const cookies = await page.context().cookies();
		expect(
			cookies.find((c) => c.name === "faire-auth.session_token"),
		).toBeDefined();
	});
});
