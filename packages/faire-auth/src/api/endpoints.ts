import { Definitions, Routes } from "@faire-auth/core/static";
import type { DefaultHook, FromFn } from "@faire-auth/core/types";
import type { UnionToTuple } from "type-fest";
import type { z } from "zod";
import type { AuthContext } from "../init";
import type { FaireAuthOptions } from "../types/options";
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
const resolveHooks = (options: FaireAuthOptions) => {
	const routeHooks = {
		...options.routeHooks,
	};

	// last plugin gets to overwrite
	options.plugins?.forEach((p) => {
		if (p.routeHooks) Object.assign(routeHooks, p.routeHooks);
	});

	return routeHooks;
};

const resolveRoutes = (options: FaireAuthOptions) => {
	const routeMap = { ...staticRouteMap };

	// last plugin gets to overwrite
	options.plugins?.forEach((p) => {
		if (p.routes) Object.assign(routeMap, p.routes);
	});

	return routeMap;
};

export const getEndpoints = (options: FaireAuthOptions) => {
	const routeHooks = resolveHooks(options);
	const routeMap = resolveRoutes(options);

	// return endpoints object
	return Object.fromEntries(
		Object.entries(routeMap).map(([k, v]) => [
			k,
			[k, v(options), routeHooks[k]],
		]),
	) as {
		[K in keyof typeof routeMap]: [
			K,
			ReturnType<(typeof routeMap)[K]>,
			FromFn<DefaultHook> | undefined,
		];
	};
};

export const sortEndpoints = <
	V extends Record<
		string,
		[
			string,
			{
				config: (...args: any[]) => any;
				handler: (...args: any[]) => any;
			},
			any,
		]
	>,
	T extends Routes[] = ServerConfigs["operationId"][],
>(
	routeMap: V,
	builtSchemas: Record<Definitions, z.ZodType>,
	context: AuthContext,
	api: Record<string, (...args: any[]) => any>,
): {
	priv: UnionToTuple<
		T[number] extends infer X
			? X extends keyof V
				? [
						ReturnType<V[X][1]["config"]>,
						ReturnType<V[X][1]["handler"]>,
						FromFn<DefaultHook> | undefined,
					]
				: never
			: never
	>;
	pub: UnionToTuple<
		Exclude<Routes, T[number]> extends infer X
			? X extends keyof V
				? [
						ReturnType<V[X][1]["config"]>,
						ReturnType<V[X][1]["handler"]>,
						FromFn<DefaultHook> | undefined,
					]
				: never
			: never
	>;
} => {
	const groups: {
		priv: [any, any, any][];
		pub: [any, any, any][];
	} = { priv: [], pub: [] };

	// Single pass - no intermediate array
	for (const v of Object.values(routeMap)) {
		const config = v[1].config(builtSchemas);
		groups[config.SERVER_ONLY === true ? "priv" : "pub"].push([
			config,
			v[1].handler(context, api),
			v[2],
		]);
	}

	return groups as any;
};

// export const createAPI = <
// 	S extends readonly (
// 		| readonly [
// 				operationId: string,
// 				{ execute: (...args: any[]) => any },
// 				FromFn<DefaultHook> | undefined,
// 		  ]
// 		| any
// 	)[],
// >(
// 	endpoints: S,
// ): {
// 	[K in S[number] as K extends readonly [infer U, any, any]
// 		? U extends PropertyKey
// 			? U
// 			: never
// 		: never]: K extends readonly [any, { execute: infer F }, any]
// 		? F extends (...args: infer A) => infer R
// 			? (...args: A) => R
// 			: never
// 		: never;
// } =>
// 	endpoints.reduce((acc, [k, v]) => {
// 		acc[k] = v.execute as any;
// 		return acc;
// 	}, {}) as any;

// TODO: Maybe some day the compiler will be strong enough we won't
// need this explicit type annotation
// type RoutesMap = {
// 	[K in Configs as K["operationId"]]: [
// 		K["operationId"],
// 		AuthProperties<K, {}>,
// 		FromFn<DefaultHook> | undefined,
// 	];
// };
// type RoutesMap = {
// 	[L in {
// 		[K in keyof typeof staticRouteMap]: (typeof staticRouteMap)[K] extends AuthEndpoint<
// 			infer C
// 		>
// 			? C
// 			: never;
// 	}[keyof typeof staticRouteMap] as L["operationId"]]: [
// 		L["operationId"],
// 		AuthProperties<L, {}>,
// 		FromFn<DefaultHook> | undefined,
// 	];
// };

// export const createAPI = (
// 	endpoints: RoutesMap,
// ): {
// 	[K in keyof RoutesMap]: RoutesMap[K] extends readonly [
// 		any,
// 		{ execute: infer F },
// 		any,
// 	]
// 		? F extends (...args: infer A) => infer R
// 			? (...args: A) => R
// 			: never
// 		: never;
// } =>
// 	new Proxy({} as any, {
// 		get(_, prop) {
// 			const triple = endpoints[prop as keyof RoutesMap];
// 			return triple?.[1]?.execute;
// 		},
// 	});
export const createAPI = <
	const T extends Record<string, readonly [any, { execute: any }, any]>,
>(
	endpoints: T,
): {
	[K in keyof T]: T[K] extends readonly [any, { execute: infer F }, any]
		? F
		: never;
} =>
	new Proxy({} as any, {
		get(_, prop) {
			const triple = endpoints[prop as keyof T];
			return triple?.[1]?.execute;
		},
	});
