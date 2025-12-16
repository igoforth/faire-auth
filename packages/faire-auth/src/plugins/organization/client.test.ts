import { defineOptions } from "../../auth";
import { createAuthClient } from "../../client";
import { inferOrgAdditionalFields, organizationClient } from "./client";
import { organization } from "./organization";
import { describe, expectTypeOf } from "vitest";
import type { InferApp } from "../../api/types";
import type { Simplify } from "type-fest";

describe("organization", (test) => {
	const opts = defineOptions({
		plugins: [
			organization({
				schema: {
					organization: {
						additionalFields: {
							newField: {
								type: "string",
							},
						},
					},
				},
			}),
		],
	});
	type App = InferApp<typeof opts>;

	test("should infer additional fields", async ({ expect }) => {
		const client = createAuthClient<App>()({
			plugins: [
				organizationClient({
					schema: inferOrgAdditionalFields<{ options: typeof opts }>(),
				}),
			],
		});

		type CreateJson = {
			json: Simplify<
				Parameters<
					(typeof client)["organization"]["create"]["$post"]
				>[0]["json"]
			>;
		};

		const valid = {
			json: {
				name: "Test",
				slug: "test",
				newField: "123", //this should be allowed
			},
		};

		const invalid = {
			json: {
				name: "Test",
				slug: "test",
				unavailableField: "123", //this should be not allowed
			},
		};

		expectTypeOf<typeof valid>().toExtend<CreateJson>();
		expectTypeOf<CreateJson>().not.toExtend<typeof invalid>();
	});

	test("should infer field when schema is provided", ({ expect }) => {
		const client = createAuthClient<App>()({
			plugins: [
				organizationClient({
					schema: inferOrgAdditionalFields({
						organization: {
							additionalFields: {
								newField: {
									type: "string",
								},
							},
						},
					}),
				}),
			],
		});

		type CreateJson = {
			json: Simplify<
				Parameters<
					(typeof client)["organization"]["create"]["$post"]
				>[0]["json"]
			>;
		};

		const valid = {
			json: {
				name: "Test",
				slug: "test",
				newField: "123", //this should be allowed
			},
		};

		const invalid = {
			json: {
				name: "Test",
				slug: "test",
				unavailableField: "123", //this should be not allowed
			},
		};

		expectTypeOf<typeof valid>().toExtend<CreateJson>();
		expectTypeOf<CreateJson>().not.toExtend<typeof invalid>();
	});
});
