import type { Context } from "hono";
import type { AuthContext, ContextVars } from "../../types";
import { createMiddleware } from "../factory";
import { jwtVerify, type JWTPayload, type JWTVerifyResult } from "jose";
import { JWTExpired } from "jose/errors";
import { False } from "@faire-auth/core/static";
import { capitalizeFirstLetter } from "@faire-auth/core/utils";
import type { z } from "zod";

const onError = async <V extends object>(
	ctx: Context<ContextVars<V>>,
	error: "token_expired" | "invalid_token" | "missing_token",
) => {
	let code: 400 | 401;
	if (error === "missing_token") code = 400;
	else code = 401;
	const url = ctx.req.query("callbackURL");
	if (url) {
		if (url.includes("?")) return ctx.redirect(`${url}&error=${error}`, 302);
		return ctx.redirect(`${url}?error=${error}`, 302);
	}
	return ctx.render(
		{
			success: False,
			code: error.toUpperCase(),
			message: capitalizeFirstLetter(error.replaceAll("_", " ")) as string,
		},
		code,
	);
};

const verifyToken = async <V extends JWTPayload>(
	token: string,
	context: AuthContext,
) => {
	let jwt: JWTVerifyResult<V>;
	try {
		jwt = await jwtVerify(token, new TextEncoder().encode(context.secret), {
			algorithms: ["HS256"],
		});
	} catch (e) {
		if (e instanceof JWTExpired) return "token_expired";
		return "invalid_token";
	}
	return jwt;
};

/**
 * Validates token against context secret.
 * @template V - The context variables type.
 * @param getValue - Function to get the token from the context.
 * @returns The middleware function.
 */
export const tokenCheck = <T extends JWTPayload>(
	getValue: <V extends object>(
		ctx: Context<ContextVars<V>>,
	) => string | undefined | Promise<string | undefined>,
	schema: z.ZodType<T>,
) =>
	createMiddleware<{
		token: T;
	}>()(async (ctx, next) => {
		const token = await getValue(ctx);
		if (!token) return onError(ctx, "missing_token");

		const context = ctx.get("context");

		const res = await verifyToken<T>(token, context);
		if (typeof res === "string") return onError(ctx, res);

		const dat = await schema.safeParseAsync(res.payload);
		if (dat.success === false) return onError(ctx, "invalid_token");

		ctx.set("token", dat.data);

		return await next();
	});
