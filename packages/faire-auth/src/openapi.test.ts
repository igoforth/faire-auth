import { describe, test } from "vitest";
import { getTestInstance } from "./test-utils";
import { writeFile } from "fs/promises";

describe("OpenAPI Showcase", async (test) => {
	const { client } = await getTestInstance(
		{
			hono: { openapi: { enabled: true } },
		},
		{ clientOptions: { fetchOptions: { throw: true } } },
	);

	test("Call endpoint", async ({ expect }) => {
		const data = (await client.$fetch("/openapi.json")) as {
			components: { schemas: { success: boolean } };
			paths: { [x: string]: any };
		};
		await writeFile("openapi.json", JSON.stringify(data, undefined, 2));
	});
});
