import { createRoute, res } from "@faire-auth/core/factory";
import { Definitions, Routes, SCHEMAS, True } from "@faire-auth/core/static";
import { createEndpoint } from "../factory/endpoint";

export const okRoute = createRoute({
	operationId: Routes.OK,
	hide: true,
	isAction: false,
	method: "get",
	path: "/ok",
	description: "Check if the API is working",
	responses: res(SCHEMAS[Definitions.SUCCESS].default, "API is working").bld(),
});

export const ok = createEndpoint(
	okRoute,
	(_options) => async (ctx) => ctx.render({ success: True }, 200),
);
