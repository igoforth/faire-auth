import type {
	BetterFetch,
	BetterFetchPlugin,
	CreateFetchOption,
	Methods,
	Schema,
	SchemaConfig,
	StandardSchemaV1,
} from "@better-fetch/fetch";
import type { StrictSession, StrictUser } from "@faire-auth/core/db";
import type {
	InferFieldsInputClient,
	InferFieldsOutput,
	LiteralString,
	LiteralStringUnion,
	Prettify,
	StripEmptyObjects,
	UnionToIntersection,
} from "@faire-auth/core/types";
import type { Schema as HonoSchema } from "hono";
import type { ClientRequest, ClientResponse } from "hono/client";
import type {
	ClientErrorStatusCode,
	ServerErrorStatusCode,
	SuccessStatusCode,
} from "hono/utils/http-status";
import type { HasRequiredKeys } from "hono/utils/types";
import type { Atom, WritableAtom } from "nanostores";
import type { FaireAuthOptions } from "../types/options";
import type { FaireAuthPlugin } from "../types/plugin";
import type { FetchEsque, FetchOptions } from "./hono";

export interface AtomListener {
	matcher: (path: string) => boolean;
	signal: LiteralStringUnion<"$sessionSignal">;
}

export interface Store {
	notify: (signal: string) => void;
	listen: (signal: string, listener: () => void) => void;
	atoms: Record<string, WritableAtom<any>>;
}

export interface FaireAuthClientPlugin {
	id: LiteralString;
	/**
	 * only used for type inference. don't pass the
	 * actual plugin
	 */
	$InferServerPlugin?: FaireAuthPlugin;
	/**
	 * Custom actions
	 */
	getActions?: (
		$fetch: BetterFetch,
		$store: Store,
		/**
		 * faire-auth client options
		 */
		options: ClientOptions | undefined,
	) => Record<string, any>;
	/**
	 * State atoms that'll be resolved by each framework
	 * auth store.
	 */
	getAtoms?: ($fetch: BetterFetch) => Record<string, Atom<any>>;
	/**
	 * specify path methods for server plugin inferred
	 * endpoints to force a specific method.
	 */
	pathMethods?: Record<string, "POST" | "GET">;
	/**
	 * Better fetch plugins
	 */
	fetchPlugins?: BetterFetchPlugin[];
	/**
	 * a list of recaller based on a matcher function.
	 * The signal name needs to match a signal in this
	 * plugin or any plugin the user might have added.
	 */
	atomListeners?: AtomListener[];
}

export interface RevalidateOptions {
	/**
	 * A time interval (in seconds) after which the session will be re-fetched.
	 * If set to `0` (default), the session is not polled.
	 *
	 * This helps prevent session expiry during idle periods by periodically
	 * refreshing the session.
	 *
	 * @default 0
	 */
	refetchInterval?: number | undefined;
	/**
	 * Automatically refetch the session when the user switches back to the window/tab.
	 * This option activates this behavior if set to `true` (default).
	 *
	 * Prevents expired sessions when users switch tabs and come back later.
	 *
	 * @default true
	 */
	refetchOnWindowFocus?: boolean | undefined;
	/**
	 * Set to `false` to stop polling when the device has no internet access
	 * (determined by `navigator.onLine`).
	 *
	 * @default false
	 * @see https://developer.mozilla.org/en-US/docs/Web/API/NavigatorOnLine/onLine
	 */
	refetchWhenOffline?: boolean | undefined;
}

export interface ClientOptions<S extends Schema = Schema> {
	fetchOptions?: Omit<CreateFetchOption, "schema" | "customFetchImpl"> & {
		schema?: S;
		// also allowing synchronous returns
		customFetchImpl?: FetchEsque;
	};
	plugins?: FaireAuthClientPlugin[];
	baseURL?: string;
	basePath?: string;
	disableDefaultFetchPlugins?: boolean;
	$InferAuth?: FaireAuthOptions;
	sessionOptions?: RevalidateOptions | undefined;
}

// export type Auth = {
// 	handler: (request: Request) => Promise<Response>;
// 	api: FilterActions<ReturnType<typeof router>["endpoints"]>;
// 	options: FaireAuthOptions;
// 	$ERROR_CODES: typeof BASE_ERROR_CODES;
// 	$context: Promise<AuthContext>;
// };

// TODO: this might not work anymore because the client API infers
// from FaireAuthOptions to have features like dto middleware etc
// work
// export type InferClientAPI<O extends ClientOptions> = InferRoutes<
// 	O["plugins"] extends Array<any>
// 		? Auth["api"] &
// 				(O["plugins"] extends Array<infer Pl>
// 					? UnionToIntersection<
// 							Pl extends { $InferServerPlugin: infer Plug }
// 								? Plug extends { routes: infer Endpoints }
// 									? Endpoints
// 									: {}
// 								: {}
// 						>
// 					: {})
// 		: Auth["api"],
// 	O
// >;

export type InferActions<O extends ClientOptions> = O["plugins"] extends Array<
	infer Plugin
>
	? UnionToIntersection<
			Plugin extends FaireAuthClientPlugin
				? Plugin["getActions"] extends (...args: any) => infer Actions
					? Actions
					: {}
				: {}
		>
	: {};
// &
// 	//infer routes from auth config
// 	InferRoutes<
// 		O["$InferAuth"] extends { plugins: infer Plugins }
// 			? Plugins extends Array<infer Plugin>
// 				? Plugin extends { endpoints: infer Endpoints }
// 					? Endpoints
// 					: {}
// 				: {}
// 			: {},
// 		O
// 	>;

export type InferErrorCodes<O extends ClientOptions> =
	O["plugins"] extends (infer Plugin)[]
		? UnionToIntersection<
				Plugin extends FaireAuthClientPlugin
					? Plugin["$InferServerPlugin"] extends FaireAuthPlugin
						? Plugin["$InferServerPlugin"]["$ERROR_CODES"]
						: {}
					: {}
			>
		: {};
/**
 * signals are just used to recall a computed value.
 * as a convention they start with "$"
 */
export type IsSignal<T> = T extends `$${infer _}` ? true : false;

export type InferPluginsFromClient<O extends ClientOptions> =
	O["plugins"] extends FaireAuthClientPlugin[]
		? O["plugins"][number]["$InferServerPlugin"][]
		: undefined;

export type InferSessionFromClient<O extends ClientOptions> = StripEmptyObjects<
	StrictSession & UnionToIntersection<InferAdditionalFromClient<O, "session">>
>;
export type InferUserFromClient<O extends ClientOptions> = StripEmptyObjects<
	StrictUser & UnionToIntersection<InferAdditionalFromClient<O, "user">>
>;

export type InferAdditionalFromClient<
	Options extends ClientOptions,
	Key extends string,
	Format extends "input" | "output" = "output",
> = Options["plugins"] extends Array<infer T>
	? T extends FaireAuthClientPlugin
		? T["$InferServerPlugin"] extends {
				schema: { [key in Key]: { fields: infer Field } };
			}
			? Format extends "input"
				? InferFieldsInputClient<Field>
				: InferFieldsOutput<Field>
			: {}
		: {}
	: {};

export type SessionQueryParams = {
	disableCookieCache?: boolean;
	disableRefresh?: boolean;
};

export type InferAdditionalAsClient<
	Options extends FaireAuthOptions,
	Key extends string,
	Format extends "input" | "output" = "output",
> = Options["plugins"] extends (infer T)[]
	? T extends FaireAuthPlugin
		? T extends { schema: Record<Key, { fields: infer Field }> }
			? Format extends "input"
				? InferFieldsInputClient<Field>
				: InferFieldsOutput<Field>
			: {}
		: {}
	: {};

type TransformToSchema<T> = {
	[K in keyof T]: T[K] extends Record<string, any>
		? {
				[M in keyof T[K] as M extends `$${infer Method extends Methods}`
					? `@${Method}/${K & string}`
					: never]: T[K][M] extends {
					input: {
						json?: infer Json;
						cbor?: infer Cbor;
						query?: infer Query;
						param?: infer Param;
					};
					output: infer Output;
					outputFormat?: string;
					status?: number;
				}
					? Prettify<
							{
								method?: M extends `$${infer Method extends Methods}`
									? Method
									: never;
							} & (Json extends Record<string, any>
								? { input: StandardSchemaV1<Json> }
								: {}) &
								(Cbor extends Record<string, any>
									? { input: StandardSchemaV1<Cbor> }
									: {}) &
								(Output extends Record<string, any>
									? { output: StandardSchemaV1<Output> }
									: {}) &
								(Query extends Record<string, any>
									? { query: StandardSchemaV1<Query> }
									: {}) &
								(Param extends Record<string, any>
									? { params: StandardSchemaV1<Param> }
									: {})
						>
					: never;
			}
		: never;
}[keyof T] extends infer U
	? U extends Record<string, any>
		? U
		: never
	: never;

// Helper type to flatten the union of all route objects into a single object
type FlattenRoutes<T> = T extends Record<string, any>
	? T extends any
		? T
		: never
	: never;

// Final type that creates the Schema structure
export type CreateSchemaType<T> = {
	schema: FlattenRoutes<TransformToSchema<T>>;
	config: SchemaConfig;
};

type S<T> = { data: T; error: null };
type E<Err, Stat extends ClientErrorStatusCode | ServerErrorStatusCode> = {
	data: null;
	error: Prettify<
		(Err extends Record<string, any> ? Err : { message?: string }) & {
			status: Stat;
			statusText: string;
		}
	>;
};

type BuildTuple<
	N extends number,
	Acc extends unknown[] = [],
> = Acc["length"] extends N ? Acc : BuildTuple<N, [...Acc, unknown]>;

export type Inc<A extends number> = [unknown, ...BuildTuple<A>]["length"] &
	number;

export type CamelCase<S extends string> =
	S extends `${infer P1}-${infer P2}${infer P3}`
		? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
		: Lowercase<S>;

type ExcludeServerPaths<T, P extends string> = T extends Record<
	string,
	infer EP
>
	? EP extends any
		? EP extends { SERVER_ONLY: true }
			? never
			: EP extends { isAction: false }
				? never
				: P
		: never
	: never;

type Segments<
	P extends string,
	O extends string[] = [],
	Depth extends number = 0,
> = P extends ""
	? O
	: Depth extends 3
		? O
		: P extends `${infer First}/${infer Second}`
			? Segments<Second, [...O, First], Inc<Depth>>
			: [...O, P];

type BuildChain<
	Segs extends string[],
	BasePath extends string,
	Sch extends HonoSchema,
	Original extends string,
	Throw extends boolean,
	Idx extends number = 0,
> = Idx extends Segs["length"]
	? ClientRequest<Sch[Original]> extends infer I
		? {
				[K in keyof I]: I[K] extends (
					...args: [infer In extends object, infer _Opt, ...infer Rest]
				) => Promise<infer Res>
					? <
							O extends FetchOptions<
								In extends { header: infer H } ? H : unknown,
								In extends { json: infer J } ? J : any, // | In["cbor"]
								In extends { query: infer Q } ? Q : any,
								In extends { param: infer P } ? P : any,
								Res extends any
									? Res extends ClientResponse<infer CRes, infer Stat, infer _F>
										? Stat extends SuccessStatusCode
											? CRes
											: never
										: never
									: never
							>,
						>(
							...args: HasRequiredKeys<In> extends true
								? [args: In, options?: O, ...Rest]
								: [options?: O, ...Rest]
						) => Promise<
							Res extends any
								? Res extends ClientResponse<infer CRes, infer Stat, infer _F>
									? Stat extends SuccessStatusCode
										? Throw extends true
											? CRes
											: S<CRes>
										: Stat extends ClientErrorStatusCode | ServerErrorStatusCode
											? Throw extends true
												? never
												: E<CRes, Stat>
											: never
									: Res
								: never
						>
					: I[K];
			}
		: never
	: {
			[K in Segs[Idx] as ExcludeServerPaths<
				Sch[Original],
				CamelCase<K>
			>]: BuildChain<Segs, BasePath, Sch, Original, Throw, Inc<Idx>>;
		};

type Relative<
	Path extends string,
	BasePath extends string,
> = BasePath extends ""
	? Path
	: Path extends `${BasePath}/${infer Rest}`
		? Rest
		: Path extends BasePath
			? "" // exact match → root
			: Path;

type PathToChain<
	Path extends string,
	BasePath extends string,
	E extends HonoSchema,
	Original extends string = Path,
	Throw extends boolean = false,
> = BuildChain<
	Segments<Relative<Path, BasePath>>,
	BasePath,
	E,
	Original,
	Throw
>;

export type Client<
	S,
	BasePath extends string,
	COpts extends ClientOptions,
> = UnionToIntersection<
	S extends Record<infer K, any>
		? K extends string
			? PathToChain<
					K,
					BasePath,
					S,
					K,
					COpts["fetchOptions"] extends { throw: true } ? true : false
				>
			: never
		: never
>;
