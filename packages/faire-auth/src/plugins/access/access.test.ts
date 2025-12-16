import { describe } from "vitest";
import { True, False } from "@faire-auth/core/static";
import { createAccessControl } from "./access";

describe("access", (test) => {
	const ac = createAccessControl({
		project: ["create", "update", "delete", "delete-many"],
		ui: ["view", "edit", "comment", "hide"],
	});

	const role1 = ac.newRole({
		project: ["create", "update", "delete"],
		ui: ["view", "edit", "comment"],
	});

	test("should validate permissions", async ({ expect }) => {
		const response = role1.authorize({
			project: ["create"],
		});
		expect(response.success).toBe(True);

		const failedResponse = role1.authorize({
			project: ["delete-many"],
		});
		expect(failedResponse.success).toBe(False);
	});

	test("should validate multiple resource permissions", async ({ expect }) => {
		const response = role1.authorize({
			project: ["create"],
			ui: ["view"],
		});
		expect(response.success).toBe(True);

		const failedResponse = role1.authorize({
			project: ["delete-many"],
			ui: ["view"],
		});
		expect(failedResponse.success).toBe(False);
	});

	test("should validate multiple resource multiple permissions", async ({
		expect,
	}) => {
		const response = role1.authorize({
			project: ["create", "delete"],
			ui: ["view", "edit"],
		});
		expect(response.success).toBe(True);
		const failedResponse = role1.authorize({
			project: ["create", "delete-many"],
			ui: ["view", "edit"],
		});
		expect(failedResponse.success).toBe(False);
	});

	test("should validate using or connector", ({ expect }) => {
		const response = role1.authorize(
			{
				project: ["create", "delete-many"],
				ui: ["view", "edit"],
			},
			"OR",
		);
		expect(response.success).toBe(True);
	});

	test("should validate using or connector for a specific resource", ({
		expect,
	}) => {
		const response = role1.authorize({
			project: {
				connector: "OR",
				actions: ["create", "delete-many"],
			},
			ui: ["view", "edit"],
		});
		expect(response.success).toBe(True);

		const failedResponse = role1.authorize({
			project: {
				connector: "OR",
				actions: ["create", "delete-many"],
			},
			ui: ["view", "edit", "hide"],
		});
		expect(failedResponse.success).toBe(False);
	});
});
