import { describe } from "vitest";
import { getTestInstance } from "../../test-utils";
import { True } from "@faire-auth/core/static";

describe("sign-out", async (test) => {
	const { signIn, client } = await getTestInstance();

	test("should sign out", async ({ expect }) => {
		const { headers } = await signIn();
		const res = await client.signOut.$post({ headers });
		expect(res.data?.success).toBe(True);
	});
});
