import { chromium, expect, test } from "@playwright/test";
import { runClient, setup } from "./utils";

const { ref, start, clean } = setup();
test.describe("cross domain", async (test) => {
	test.beforeEach(async () => start());
	test.afterEach(async () => clean());

	test("should work across domains", async ({ expect }) => {
		const browser = await chromium.launch({
			args: [`--host-resolver-rules=MAP * localhost`],
		});

		const page = await browser.newPage();

		await page.goto(
			`http://test.com:${ref.clientPort}/?port=${ref.serverPort}`,
		);
		await page.locator("text=Ready").waitFor();

		await expect(
			runClient(page, ({ client }) => typeof client !== "undefined"),
		).resolves.toBe(true);
		await expect(
			runClient(page, async ({ client }) =>
				client.getSession.$get({ query: {} }),
			),
		).resolves.toEqual({ data: null, error: null });
		await runClient(page, ({ client }) =>
			client.signIn.email.$post({
				json: {
					email: "test@test.com",
					password: "password123",
				},
			}),
		);

		// Check that the session is not set because of we didn't set the cookie domain correctly
		const cookies = await page.context().cookies();
		expect(
			cookies.find((c) => c.name === "faire-auth.session_token"),
		).not.toBeDefined();
	});
});
