import type { Session, User } from "@faire-auth/core/db";
import type { Context } from "hono";
import { createMiddleware } from "../../api/factory/middleware";
import { getSessionFromCtx, sessionMiddleware } from "../../api/routes/session";
import type { ContextVars } from "../../types/hono";
import type { Role } from "../access";
import { defaultRoles } from "./access/statement";
import type { OrganizationOptions } from "./types";

/**
 * the orgMiddleware type-asserts and adds org options, roles, and a getSession function.
 */
export const orgMiddleware = (orgOptions?: OrganizationOptions) =>
	createMiddleware<{
		orgOptions: OrganizationOptions;
		roles: typeof defaultRoles & { [key: string]: Role<{}> };
		getSession: (context: Context<ContextVars>) => Promise<{
			session: Session & {
				activeTeamId?: string;
				activeOrganizationId?: string;
			};
			user: User;
		} | null>;
	}>()(async (ctx, next) => {
		ctx.set("orgOptions", orgOptions ?? {});
		ctx.set("roles", { ...defaultRoles, ...orgOptions?.roles });
		ctx.set(
			"getSession",
			async (ctx: Context<ContextVars>) =>
				await getSessionFromCtx(ctx).then((s) => {
					if (s instanceof Response) return null;
					return s;
				}),
		);
		return await next();
	});

export const orgSessionMiddleware = sessionMiddleware<{
	session: {
		session: { activeTeamId?: string; activeOrganizationId?: string };
	};
}>();
