import type { BASE_ERROR_CODES } from "@faire-auth/core/error";
import type { OpenAPIHono } from "@faire-auth/core/factory";
import type {
	AnyHono,
	AuthRouteConfig,
	BasePath,
	BuildSchema,
	DocPathFromOptions,
	FromFn,
	LiteralStringUnion,
	Prettify,
	ProcessRouteConfig,
	UnionToIntersection,
} from "@faire-auth/core/types";
import type { BetterFetch, BetterFetchError } from "@better-fetch/fetch";
import type { Hono } from "hono";
import type { ExtractSchema } from "hono/types";
import type { Atom, WritableAtom } from "nanostores";
import type {
	Client,
	ClientOptions,
	InferActions,
	InferErrorCodes,
} from "../client/types";
import type { InferResolvedHooks } from "../client/vanilla";
import type { ContextVars, Execute } from "../types/hono";
import type { FaireAuthOptions } from "../types/options";
import type { AuthEndpoint } from "./factory/endpoint";
import type {
	changeEmailRoute,
	changePasswordRoute,
	deleteUserCallbackRoute,
	deleteUserRoute,
	errorRoute,
	getAccessTokenRoute,
	getAccountInfoRoute,
	getOAuthCallbackRoute,
	getSessionRoute,
	linkAccountRoute,
	listAccountsRoute,
	listSessionsRoute,
	okRoute,
	postOAuthCallbackRoute,
	refreshAccessTokenRoute,
	requestPasswordResetCallbackRoute,
	requestPasswordResetRoute,
	resetPasswordRoute,
	revokeOtherSessionsRoute,
	revokeSessionRoute,
	revokeSessionsRoute,
	sendVerificationEmailRoute,
	setPasswordRoute,
	signInEmailRoute,
	signInSocialRoute,
	signOutRoute,
	signUpEmailRoute,
	unlinkAccountRoute,
	updateUserRoute,
	verifyEmailRoute,
} from "./routes";

export type APIFromRoutes<C extends AuthRouteConfig> = {
	[K in C as K["operationId"]]: FromFn<Execute<K>> extends (
		...args: infer A
	) => infer R
		? (...args: A) => R
		: never;
};

export type AllPluginConfigs<O> = O extends { plugins: readonly (infer P)[] }
	? P extends { routes: infer R }
		? R extends Record<string, infer T>
			? T extends AuthEndpoint<infer C>
				? C
				: never
			: never
		: never
	: never;

export type Configs =
	| typeof changeEmailRoute
	| typeof changePasswordRoute
	| typeof deleteUserCallbackRoute
	| typeof deleteUserRoute
	| typeof errorRoute
	| typeof getAccessTokenRoute
	| typeof getAccountInfoRoute
	| typeof getOAuthCallbackRoute
	| typeof getSessionRoute
	| typeof linkAccountRoute
	| typeof listAccountsRoute
	| typeof listSessionsRoute
	| typeof okRoute
	| typeof postOAuthCallbackRoute
	| typeof refreshAccessTokenRoute
	| typeof requestPasswordResetCallbackRoute
	| typeof requestPasswordResetRoute
	| typeof resetPasswordRoute
	| typeof revokeOtherSessionsRoute
	| typeof revokeSessionRoute
	| typeof revokeSessionsRoute
	| typeof sendVerificationEmailRoute
	| typeof setPasswordRoute
	| typeof signInEmailRoute
	| typeof signInSocialRoute
	| typeof signOutRoute
	| typeof signUpEmailRoute
	| typeof unlinkAccountRoute
	| typeof updateUserRoute
	| typeof verifyEmailRoute;

export type Config<R extends string> = { operationId: R } & Configs;
export type ServerConfigs = Configs extends infer X
	? X extends { SERVER_ONLY: true }
		? X
		: never
	: never;

// From what I've gathered, there are a few relevant fields in metadata
// isAction, client, and SERVER_ONLY
// 'client = false' indicates the route should not be included in
// the client API bundle. It seems to be used for callback routes
// 'isAction = false' means the routes should not be callable via
// the client or server API bundle and openapi metadata should be hidden
// Examples of routes with isAction = false are 'ok' and 'error'. This seems
// to indicate they serve no other purpose than utility
// 'SERVER_ONLY = true' means contrary to 'isAction = false' and 'client = false',
// the route should not be published at all by the router and exclusively
// used by the server itself. It is still provided in the server API bundle,
// but it should not have openapi metadata
// ---
// For our migration, we can combine these 3 with 'hide = true' which will take
// responsibility from 'isAction = false' for determining openapi metadata
// 'hide = true' should be paired with SERVER_ONLY and isAction routes
// which is a native property of the hono openapi route config
// we can then place strict type and runtime checks on SERVER_ONLY in the
// router and client bundle
// finally, we can place type-level checks on 'client = false' for the
// client bundle

export type BuildConfigs<O extends FaireAuthOptions> =
	| AllPluginConfigs<O>
	| Configs extends infer X
	? ProcessRouteConfig<X, O>
	: never;

export type InferSchema<O extends FaireAuthOptions> = UnionToIntersection<
	BuildSchema<BuildConfigs<O>, BasePath<O>>
> &
	DocPathFromOptions<O>;

export type InferApp<O extends FaireAuthOptions> = OpenAPIHono<
	ContextVars,
	InferSchema<O>,
	BasePath<O>
>;

// { [KeyType in keyof T]: T[KeyType]; }
export type InferAPI<
	A extends AnyHono,
	HideCallbacks extends boolean = true,
> = ExtractSchema<A> extends Record<string, infer R>
	? {
			[Method in keyof R as R[Method] extends { operationId: infer K }
				? K extends string
					? true extends HideCallbacks
						? R[Method] extends { isAction: false }
							? never
							: K
						: K
					: never
				: never]: R[Method] extends { _api: infer Api } ? Api : never;
		} extends infer S
		? UnionToIntersection<S>
		: never
	: never;

type Session<C, Opts extends ClientOptions> = C extends {
	getSession: { $get: infer GetSession };
}
	? GetSession extends (...args: any) => any
		? Awaited<ReturnType<GetSession>> extends infer R
			? Opts["fetchOptions"] extends { throw: true }
				? R
				: R extends { status: 200; json: infer Json }
					? Json extends (...args: any) => any
						? Awaited<ReturnType<Json>>
						: never
					: never
			: never
		: never
	: never;

/**
 * InferClient turns a Hono-based FaireAuth client into the exact shape
 * that the runtime client returns, including every route, action, hook
 * and the strongly-typed `useSession` atom.
 */
export type InferClient<
	A extends AnyHono,
	Opts extends ClientOptions,
> = A extends Hono<any, infer S, infer B>
	? Client<S, B, Opts> extends infer ClientAPI
		? UnionToIntersection<InferResolvedHooks<Opts>> &
				ClientAPI &
				InferActions<Opts> & {
					useSession: Atom<{
						data: Session<ClientAPI, Opts> | null;
						error: BetterFetchError | null;
						isPending: boolean;
					}>;
					$fetch: BetterFetch;
					$store: {
						notify: (
							signal?: LiteralStringUnion<"$sessionSignal"> | undefined,
						) => void;
						listen: (
							signal: LiteralStringUnion<"$sessionSignal">,
							listener: (
								value: boolean,
								oldValue?: boolean | undefined,
							) => void,
						) => void;
						atoms: Record<string, WritableAtom<any>>;
					};
					$Infer: { Session: Session<ClientAPI, Opts> };
					$ERROR_CODES: Prettify<
						InferErrorCodes<Opts> & typeof BASE_ERROR_CODES
					>;
				}
		: never
	: never;

export type DefaultAPI = APIFromRoutes<Configs>;

export type DefaultApp = OpenAPIHono<
	ContextVars,
	UnionToIntersection<BuildSchema<Configs, "/api/auth">>,
	"/api/auth"
>;

export type DefaultClient = InferClient<DefaultApp, {}>;
