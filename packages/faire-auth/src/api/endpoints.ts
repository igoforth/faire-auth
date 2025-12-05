import { Definitions, Routes } from "@faire-auth/core/static";
import type { UnionToTuple } from "type-fest";
import type { z } from "zod";
import type { AuthContext } from "../init";
import type { FaireAuthOptions, Hooks } from "../types/options";
import {
	changeEmail,
	changePassword,
	deleteUser,
	deleteUserCallback,
	error,
	getAccessToken,
	getAccountInfo,
	getOAuthCallback,
	getSession,
	linkAccount,
	listAccounts,
	listSessions,
	ok,
	postOAuthCallback,
	refreshAccessToken,
	requestPasswordReset,
	requestPasswordResetCallback,
	resetPassword,
	revokeOtherSessions,
	revokeSession,
	revokeSessions,
	sendVerificationEmail,
	setPassword,
	signInEmail,
	signInSocial,
	signOut,
	signUpEmail,
	unlinkAccount,
	updateUser,
	verifyEmail,
} from "./routes";
import type { ServerConfigs } from "./types";
import type { AuthProperties } from "../types";
import type { AuthArgs } from "./factory/endpoint";

const staticRouteMap = {
	[Routes.SET_PASSWORD]: setPassword,
	[Routes.CHANGE_EMAIL]: changeEmail,
	[Routes.CHANGE_PASSWORD]: changePassword,
	[Routes.DELETE_USER]: deleteUser,
	[Routes.DELETE_USER_CALLBACK]: deleteUserCallback,
	[Routes.ERROR]: error,
	[Routes.GET_ACCESS_TOKEN]: getAccessToken,
	[Routes.GET_ACCOUNT_INFO]: getAccountInfo,
	[Routes.GET_SESSION]: getSession,
	[Routes.LINK_ACCOUNT]: linkAccount,
	[Routes.LIST_ACCOUNTS]: listAccounts,
	[Routes.LIST_SESSIONS]: listSessions,
	[Routes.OAUTH_CALLBACK_GET]: getOAuthCallback,
	[Routes.OAUTH_CALLBACK_POST]: postOAuthCallback,
	[Routes.OK]: ok,
	[Routes.REFRESH_ACCESS_TOKEN]: refreshAccessToken,
	[Routes.REQUEST_PASSWORD_RESET]: requestPasswordReset,
	[Routes.REQUEST_PASSWORD_RESET_CALLBACK]: requestPasswordResetCallback,
	[Routes.RESET_PASSWORD]: resetPassword,
	[Routes.REVOKE_OTHER_SESSIONS]: revokeOtherSessions,
	[Routes.REVOKE_SESSION]: revokeSession,
	[Routes.REVOKE_SESSIONS]: revokeSessions,
	[Routes.SEND_VERIFICATION_EMAIL]: sendVerificationEmail,
	[Routes.SIGN_IN_EMAIL]: signInEmail,
	[Routes.SIGN_IN_SOCIAL]: signInSocial,
	[Routes.SIGN_OUT]: signOut,
	[Routes.SIGN_UP_EMAIL]: signUpEmail,
	[Routes.UNLINK_ACCOUNT]: unlinkAccount,
	[Routes.UPDATE_USER]: updateUser,
	[Routes.VERIFY_EMAIL]: verifyEmail,
};

// : Record<string, FromFn<DefaultHook> | undefined>
const resolveHooks = (options: FaireAuthOptions): Hooks => {
	const routeHooks = {
		...options.routeHooks,
	};

	// last plugin gets to overwrite
	options.plugins?.forEach((p) => {
		if (p.routeHooks) Object.assign(routeHooks, p.routeHooks);
	});

	return routeHooks;
};

const resolveRoutes = (options: FaireAuthOptions): typeof staticRouteMap => {
	const routeMap = { ...staticRouteMap };

	// last plugin gets to overwrite
	options.plugins?.forEach((p) => {
		if (p.routes) Object.assign(routeMap, p.routes);
	});

	return routeMap;
};

export const createEndpoints = (options: FaireAuthOptions) => {
	const routeMap = resolveRoutes(options);
	const routeHooks = resolveHooks(options);

	const endpoints = Object.fromEntries(
		Object.entries(routeMap).map(([k, v]) => [k, v(options)]),
	) as {
		[K in keyof typeof routeMap]: ReturnType<(typeof routeMap)[K]>;
	};

	return { endpoints, hooks: routeHooks };
};

export const createArgs = <
	V extends Record<string, AuthProperties<any>>,
	T extends Routes[] = ServerConfigs["operationId"][],
>(
	endpoints: V,
	builtSchemas: Record<Definitions, z.ZodType>,
	context: AuthContext,
	routeHooks: Hooks,
): {
	priv: UnionToTuple<
		V extends Record<string, infer E>
			? E extends AuthProperties<infer Config>
				? Config extends { operationId: infer OpId }
					? OpId extends T[number]
						? AuthArgs<Config>
						: never
					: never
				: never
			: never
	>;
	pub: UnionToTuple<
		V extends Record<string, infer E>
			? E extends AuthProperties<infer Config>
				? Config extends { operationId: infer OpId }
					? OpId extends Exclude<Routes, T[number]>
						? AuthArgs<Config>
						: never
					: never
				: never
			: never
	>;
} => {
	const groups: {
		priv: [any, any, any][];
		pub: [any, any, any][];
	} = { priv: [], pub: [] };

	for (const [k, v] of Object.entries(endpoints)) {
		const args = v.toArgs(builtSchemas, context, endpoints, routeHooks[k]);
		groups[args[0].SERVER_ONLY === true ? "priv" : "pub"].push(args);
	}

	return groups as any;
};
