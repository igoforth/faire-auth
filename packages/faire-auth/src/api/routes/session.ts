import { base64Url, binary, createHMAC } from "@faire-auth/core/datatypes";
import {
	looseSessionSchema,
	looseUserSchema,
	type Session,
	type StrictSession,
	type StrictUser,
	type User,
} from "@faire-auth/core/db";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import { createRoute, req, res } from "@faire-auth/core/factory";
import {
	Definitions,
	False,
	Routes,
	SCHEMAS,
	True,
} from "@faire-auth/core/static";
import { getDate } from "@faire-auth/core/utils";
import type { Context, TypedResponse } from "hono";
import type { ContextVars } from "../../types/hono";
import {
	deleteCookie,
	deleteSessionCookie,
	getCookie,
	getSignedCookie,
	setCookieCache,
	setSessionCookie,
} from "../../utils/cookies";
import { safeJSONParse } from "../../utils/json";
import { createEndpoint } from "../factory/endpoint";
import { createMiddleware } from "../factory/middleware";
import { getSessionQuerySchema, revokeSessionSchema } from "../schema/session";

export const getSessionRoute = createRoute({
	operationId: Routes.GET_SESSION,
	method: "get",
	path: "/get-session",
	description: "Get the current session",
	request: req().qry(getSessionQuerySchema).bld(),
	responses: res(SCHEMAS[Definitions.SESSION_USER].default)
		.err(401, "Failed to get session or expired")
		.zod<typeof getSessionQuerySchema>()
		.err(500, "Unexpected Error")
		.bld(),
});

export const getSession = createEndpoint(
	getSessionRoute,
	(options) => async (ctx) => {
		const { disableCookieCache, disableRefresh } = ctx.req.valid("query");
		const context = ctx.get("context");

		try {
			const sessionCookieToken = await getSignedCookie(
				ctx,
				context.secret,
				context.authCookies.sessionToken.name,
			);

			// TODO: comparison with tests
			// if (!sessionCookieToken) return ctx.render(null, 200)
			if (sessionCookieToken == null)
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION },
					401,
				);

			if (sessionCookieToken === false)
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.SESSION_EXPIRED },
					401,
				);

			const sessionDataCookie = getCookie(
				ctx,
				context.authCookies.sessionData.name,
			);
			const sessionDataPayload =
				sessionDataCookie != null
					? safeJSONParse<{
							session: { session: Session; user: User };
							signature: string;
							expiresAt: number;
						}>(binary.decode(base64Url.decode(sessionDataCookie)))
					: null;

			if (sessionDataPayload) {
				const isValid = await createHMAC("SHA-256", "base64urlnopad").verify(
					context.secret,
					JSON.stringify({
						...sessionDataPayload.session,
						expiresAt: sessionDataPayload.expiresAt,
					}),
					sessionDataPayload.signature,
				);
				if (!isValid) {
					deleteCookie(
						ctx,
						context.authCookies.sessionData.name,
						context.authCookies.sessionData.options,
					);
					// TODO: comparison with tests
					// return ctx.render(null, 200)
					return ctx.render(
						{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION },
						401,
					);
				}
			}

			const dontRememberMe = await getSignedCookie(
				ctx,
				context.secret,
				context.authCookies.dontRememberToken.name,
			);
			/**
			 * If session data is present in the cookie, return it
			 */
			if (
				sessionDataPayload?.session &&
				options.session?.cookieCache?.enabled === true &&
				disableCookieCache !== true
			) {
				const { session } = sessionDataPayload;
				if (
					!(session.session.createdAt instanceof Date) ||
					!(session.session.updatedAt instanceof Date) ||
					!(session.session.expiresAt instanceof Date) ||
					!(session.user.createdAt instanceof Date) ||
					!(session.user.updatedAt instanceof Date)
				)
					console.warn("not date ln 122");
				const hasExpired =
					sessionDataPayload.expiresAt < Date.now() ||
					session.session.expiresAt < new Date();
				if (!hasExpired) {
					ctx.set("session", session);
					return ctx.render(session, 200);
				}

				deleteCookie(
					ctx,
					context.authCookies.sessionData.name,
					context.authCookies.sessionData.options,
				);
			}

			const session =
				await context.internalAdapter.findSession(sessionCookieToken);
			ctx.set("session", session);
			if (!session || session.session.expiresAt < new Date()) {
				deleteSessionCookie(ctx);
				if (session) {
					await context.internalAdapter.deleteSession(session.session.token); // if session expired clean up the session
					return ctx.render(
						{ success: False, message: BASE_ERROR_CODES.SESSION_EXPIRED },
						401,
					);
				}
				// TODO: comparison with tests
				// return ctx.render(null, 200)
				return ctx.render(
					{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION },
					401,
				);
			}
			/**
			 * We don't need to update the session if the user doesn't want to be remembered
			 * or if the session refresh is disabled
			 */
			if (
				(dontRememberMe != null && dontRememberMe !== false) ||
				disableRefresh === true
			)
				return ctx.render(session, 200);

			const { expiresIn, updateAge } = context.sessionConfig;
			/**
			 * Calculate last updated date to throttle write updates to database
			 * Formula: ({expiry date} - sessionMaxAge) + sessionUpdateAge
			 *
			 * e.g. ({expiry date} - 30 days) + 1 hour
			 *
			 * inspired by: https://github.com/nextauthjs/next-auth/blob/main/packages/core/src/lib/actions/session.ts
			 */
			const sessionIsDueToBeUpdatedDate =
				session.session.expiresAt.valueOf() -
				expiresIn * 1000 +
				updateAge * 1000;
			const shouldBeUpdated = sessionIsDueToBeUpdatedDate <= Date.now();

			if (shouldBeUpdated && !options.session?.disableSessionRefresh) {
				const updatedSession: null | Session =
					await context.internalAdapter.updateSession(session.session.token, {
						expiresAt: getDate(context.sessionConfig.expiresIn, "sec"),
						updatedAt: new Date(),
					});
				if (updatedSession == null) {
					/**
					 * Handle case where session update fails (e.g., concurrent deletion)
					 */
					deleteSessionCookie(ctx);
					// TODO: comparison with tests
					// return ctx.json(null, 401)
					return ctx.render(
						{
							success: False,
							message: BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
						},
						401,
					);
				}
				const maxAge = (updatedSession.expiresAt.valueOf() - Date.now()) / 1000;
				await setSessionCookie(
					ctx,
					options,
					{ session: updatedSession, user: session.user },
					false,
					{ maxAge },
				);

				if (
					!(updatedSession.createdAt instanceof Date) ||
					!(updatedSession.updatedAt instanceof Date) ||
					!(updatedSession.expiresAt instanceof Date) ||
					!(session.user.createdAt instanceof Date) ||
					!(session.user.updatedAt instanceof Date)
				)
					console.warn("not date ln 220");
				return ctx.render({ session: updatedSession, user: session.user }, 200);
			}
			if (options.session?.cookieCache?.enabled === true)
				await setCookieCache(ctx, options, session, dontRememberMe);
			if (
				!(session.session.createdAt instanceof Date) ||
				!(session.session.updatedAt instanceof Date) ||
				!(session.session.expiresAt instanceof Date) ||
				!(session.user.createdAt instanceof Date) ||
				!(session.user.updatedAt instanceof Date)
			)
				console.warn("not date ln 231");
			return ctx.render(
				// as unknown as {
				//            session: InferSession<typeof options>
				//            user: InferUser<typeof options>
				//          }
				session,
				200,
			);
		} catch (error) {
			context.logger.error("INTERNAL_SERVER_ERROR", error);
			return ctx.render(
				{ success: False, message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION },
				500,
			);
		}
	},
);

export const getSessionFromCtx = async <
	U extends User = StrictUser,
	S extends Session = StrictSession,
	V extends object = object,
>(
	ctx: Context<
		ContextVars<
			V & {
				session?: { session: S; user: U };
			}
		>
	>,
	config?: { disableCookieCache?: boolean; disableRefresh?: boolean },
): Promise<
	| { session: S; user: U }
	| (Response &
			TypedResponse<
				{
					success: false;
					code?: string | undefined;
					message?: string | undefined;
				},
				401
			>)
> => {
	const session = ctx.get("session");
	if (session) return session;
	const api = ctx.get("api");

	const newSession = await api
		.getSession({ query: { ...(config && config) } }, ctx)
		.then(async (s) =>
			s.success === true
				? {
						success: true as true,
						data: {
							// this repairs dates if payload was JSON.stringified
							session: looseSessionSchema.parse(s.data.session),
							user: looseUserSchema.parse(s.data.user),
						},
					}
				: s,
		);
	if (newSession.success === false)
		return ctx.render(
			(session as any) ?? {
				success: False,
				message: BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
			},
			401,
		);

	ctx.set("session", newSession.data);
	return newSession.data as any;
};

/**
 * The middleware forces the endpoint to require a valid session.
 */
export const sessionMiddleware = <V extends object>() =>
	createMiddleware<
		V & {
			session: { session: Session; user: User };
		}
	>()(async (ctx, next) => {
		const session = await getSessionFromCtx(ctx);
		if (session instanceof Response) return session;
		return await next();
	});

/**
 * This middleware forces the endpoint to require a valid session and ignores cookie cache.
 * This should be used for sensitive operations like password changes, account deletion, etc.
 * to ensure that revoked sessions cannot be used even if they're still cached in cookies.
 */
export const sensitiveSessionMiddleware = createMiddleware<{
	session: { session: Session; user: User };
}>()(async (ctx, next) => {
	const session = await getSessionFromCtx(ctx, { disableCookieCache: true });
	if (session instanceof Response) return session;
	return await next();
});

/**
 * This middleware allows you to call the endpoint on the client if session is valid.
 * However, if called on the server, no session is required.
 */
export const requestOnlySessionMiddleware = createMiddleware<{
	session?: { session: Session; user: User };
}>()(async (ctx, next) => {
	const session = await getSessionFromCtx(ctx);
	if (session instanceof Response && ctx.get("isServer") !== true)
		return session;
	return await next();
});

/**
 * This middleware forces the endpoint to require a valid session,
 * as well as making sure the session is fresh before proceeding.
 *
 * Session freshness check will be skipped if the session config's freshAge
 * is set to 0
 */
export const freshSessionMiddleware = createMiddleware<{
	session: { session: Session; user: User };
}>()(async (ctx, next) => {
	const session = await getSessionFromCtx(ctx);
	if (session instanceof Response) return session;
	const context = ctx.get("context");
	if (context.sessionConfig.freshAge === 0) return await next();

	const lastUpdated = (
		session.session.updatedAt ?? session.session.createdAt
	).valueOf();
	const isFresh =
		Date.now() - lastUpdated < context.sessionConfig.freshAge * 1000;
	if (!isFresh)
		return ctx.render(
			{ success: False, message: "Session is not fresh" } as {
				success: false;
				code?: string | undefined;
				message?: string | undefined;
			},
			403,
		);
	return await next();
});

export const listSessionsRoute = createRoute({
	operationId: Routes.LIST_SESSIONS,
	method: "get",
	path: "/list-sessions",
	description: "List all active sessions for the user",
	middleware: [sessionMiddleware()],
	responses: res(SCHEMAS[Definitions.SESSIONS_LIST].default).err(500).bld(),
});

export const listSessions = createEndpoint(
	listSessionsRoute,
	(_options) => async (ctx) => {
		try {
			const sessions = await ctx
				.get("context")
				.internalAdapter.listSessions(ctx.get("session").user.id);
			const activeSessions = sessions.filter((s) => s.expiresAt > new Date());
			// return options.hono?.advanced?.cbor === true ?
			//     ctx.render(activeSessions, 200)
			//   : ctx.render(activeSessions, 200)
			return ctx.render(activeSessions, 200); // as unknown as InferSession<typeof _options>
		} catch (e: unknown) {
			ctx
				.get("context")
				.logger.error(e instanceof Error ? e.message : String(e), e);
			return ctx.render(
				{ success: False, message: "Internal server error" },
				500,
			);
		}
	},
);

export const revokeSessionRoute = createRoute({
	operationId: Routes.REVOKE_SESSION,
	method: "post",
	path: "/revoke-session",
	description: "Revoke a single session",
	middleware: [sensitiveSessionMiddleware],
	request: req().bdy(revokeSessionSchema).bld(),
	responses: res(SCHEMAS[Definitions.SUCCESS].default)
		.zod<typeof revokeSessionSchema>()
		.err(400)
		.err(401)
		.err(500)
		.bld(),
});

export const revokeSession = createEndpoint(
	revokeSessionRoute,
	(_options) => async (ctx) => {
		const context = ctx.get("context");
		const session = ctx.get("session");
		const { token } = ctx.req.valid("json");
		const foundSession = await context.internalAdapter.findSession(token);
		if (!foundSession)
			return ctx.render({ success: False, message: "Session not found" }, 400);
		if (foundSession.session.userId !== session.user.id)
			return ctx.render({ success: False }, 401);
		try {
			await context.internalAdapter.deleteSession(token);
		} catch (error) {
			context.logger.error(
				error != null && typeof error === "object" && "name" in error
					? String(error.name)
					: "Unknown Error",
				error,
			);
			return ctx.render(
				{ success: False, message: "Internal server error" },
				500,
			);
		}
		return ctx.render({ success: True }, 200);
	},
);

export const revokeSessionsRoute = createRoute({
	operationId: Routes.REVOKE_SESSIONS,
	method: "post",
	path: "/revoke-sessions",
	description: "Revoke all sessions for the user",
	middleware: [sensitiveSessionMiddleware],
	responses: res(SCHEMAS[Definitions.SUCCESS].default).err(500).bld(),
});

export const revokeSessions = createEndpoint(
	revokeSessionsRoute,
	(_options) => async (ctx) => {
		const context = ctx.get("context");
		const session = ctx.get("session");
		try {
			await context.internalAdapter.deleteSessions(session.user.id);
		} catch (error) {
			context.logger.error(
				error != null && typeof error === "object" && "name" in error
					? String(error.name)
					: "Unknown Error",
				error,
			);
			return ctx.render(
				{ success: False, message: "Internal server error" },
				500,
			);
		}
		return ctx.render({ success: True }, 200);
	},
);

export const revokeOtherSessionsRoute = createRoute({
	operationId: Routes.REVOKE_OTHER_SESSIONS,
	method: "post",
	path: "/revoke-other-sessions",
	description: "Revoke all other sessions for the user except the current one",
	middleware: [sensitiveSessionMiddleware],
	responses: res(SCHEMAS[Definitions.SUCCESS].default).bld(),
});

export const revokeOtherSessions = createEndpoint(
	revokeOtherSessionsRoute,
	(_options) => async (ctx) => {
		const context = ctx.get("context");
		const session = ctx.get("session");
		const sessions = await context.internalAdapter.listSessions(
			session.user.id,
		);
		const activeSessions = sessions.filter(
			(session) => session.expiresAt > new Date(),
		);
		const otherSessions = activeSessions.filter(
			(sess) => sess.token !== session.session.token,
		);
		await Promise.all(
			otherSessions.map(async (session) =>
				context.internalAdapter.deleteSession(session.token),
			),
		);
		return ctx.render({ success: True }, 200);
	},
);
