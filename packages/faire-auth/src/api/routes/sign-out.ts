import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import { deleteSessionCookie, getSignedCookie } from "../../utils/cookies";
import { createEndpoint } from "../factory/endpoint";

export const signOutRoute = createRoute({
	operationId: Routes.SIGN_OUT,
	method: "post",
	path: "/sign-out",
	description: "Sign out the current user",
	responses: res(SCHEMAS[Definitions.SUCCESS].default).err(400).bld(),
});

export const signOut = createEndpoint(
	signOutRoute,
	(_options) => async (ctx) => {
		const context = ctx.get("context");
		const sessionCookieToken = await getSignedCookie(
			ctx,
			context.secret,
			context.authCookies.sessionToken.name,
		);
		if (sessionCookieToken == null || sessionCookieToken === false) {
			deleteSessionCookie(ctx);
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION },
				400,
			);
		}

		await context.internalAdapter.deleteSession(sessionCookieToken);
		deleteSessionCookie(ctx);
		return ctx.render({ success: True }, 200);
	},
);
