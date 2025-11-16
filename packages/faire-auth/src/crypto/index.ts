import { False } from "@faire-auth/core/static";
import type { Context } from "hono";
import type { ContextVars } from "../types/hono";

export * from "@faire-auth/core/crypto";

export const validatePassword = async <T extends object>(
	ctx: Context<ContextVars<T>>,
	data: { password: string; userId: string },
) => {
	const context = ctx.get("context");
	const accounts = await context.internalAdapter.findAccounts(data.userId);
	const credentialAccount = accounts.find(
		(account) => account.providerId === "credential",
	);
	const currentPassword = credentialAccount?.password;
	if (!credentialAccount || !currentPassword) return false;

	const compare = await context.password.verify({
		hash: currentPassword,
		password: data.password,
	});
	return compare;
};

export const checkPassword = async <T extends object>(
	userId: string,
	ctx: Context<ContextVars<T>, any, { out: { json: { password?: string } } }>,
) => {
	const context = ctx.get("context");
	const { password } = ctx.req.valid("json");
	const accounts = await context.internalAdapter.findAccounts(userId);
	const credentialAccount = accounts.find(
		(account) => account.providerId === "credential",
	);
	const currentPassword = credentialAccount?.password;
	if (!credentialAccount || !currentPassword || !password)
		return ctx.render(
			{ success: False, message: "No password credential found" },
			400,
		);

	const compare = await context.password.verify({
		hash: currentPassword,
		password: password,
	});
	if (!compare)
		return ctx.render({ success: False, message: "Invalid password" }, 400);
	return true;
};
