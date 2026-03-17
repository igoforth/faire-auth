import type {
	RouteConfig as RouteConfigBase,
	ZodMediaTypeObject,
} from "@asteasolutions/zod-to-openapi";
import type {
	Context,
	Env,
	Handler,
	Hono,
	Input,
	MiddlewareHandler,
} from "hono";
import type {
	ConvertPathType,
	InferInput,
	Awaitable,
	RouteConfigToEnv,
	RouteConfigToTypedResponse,
	ExK,
	LiteralString,
	Fn,
	CustomIO,
} from "./helper";

export type AnyHono = Hono<any, any, any>;

export type BasePath<Options> = Options extends { basePath: infer BasePath }
	? BasePath extends undefined
		? "/api/auth"
		: BasePath
	: "/api/auth";

export interface AuthRouteConfig extends RouteConfigBase {
	operationId: LiteralString;
	path: LiteralString;
	method:
		| "get"
		| "post"
		| "put"
		| "delete"
		| "patch"
		| "head"
		| "options"
		| "trace";
	hide?: boolean;
	$Infer?: { body?: unknown; [x: number]: unknown };
	isAction?: false;
	SERVER_ONLY?: true;
	client?: false;
	middleware?: MiddlewareHandler | MiddlewareHandler[];
}
export type DecorativeKeys =
	| `x-${string}`
	| "tags"
	| "summary"
	| "description"
	| "externalDocs"
	| "parameters"
	| "requestBody"
	| "callbacks"
	| "deprecated"
	| "security"
	| "servers"
	| "$Infer";
export interface MinRouteConfig extends ExK<AuthRouteConfig, DecorativeKeys> {}

// just middleware handler but without next() so we can enforce before/after context
export type HookHandler<
	E extends Env = any,
	P extends string = string,
	I extends Input = {},
> = (ctx: Context<E, P, I>) => Promise<Response | void>;

// just hook handler but synchronous
export type InterceptHandler<E extends Env = any, P extends string = string> = (
	ctx: Context<E, P>,
) => Response | void;

export type RouteHandler<
	R extends AuthRouteConfig,
	E extends Env = RouteConfigToEnv<R>,
	I extends Input = InferInput<R>,
	P extends string = ConvertPathType<R["path"]>,
	// TODO: this means unintentional default can be created at runtime, like 'updatedAt'
	FeedIn extends boolean = false,
> = Handler<
	E,
	P,
	I,
	// If response type is defined, only TypedResponse is allowed.
	// When FeedIn is true (internal handlers), also allow Response since
	// the output is parsed by bundle.parser anyway.
	R extends {
		responses: {
			[statusCode: number]: {
				content: {
					[mediaType: string]: ZodMediaTypeObject;
				};
			};
		};
	}
		? FeedIn extends true
			? Awaitable<RouteConfigToTypedResponse<R, FeedIn> | Response>
			: Awaitable<RouteConfigToTypedResponse<R, FeedIn>>
		: Awaitable<RouteConfigToTypedResponse<R, FeedIn> | Response>
>;

export type ExecOpts<
	AsResponse extends boolean = false,
	ReturnHeaders extends boolean = false,
> = {
	headers?: HeadersInit;
	asResponse?: AsResponse;
	returnHeaders?: ReturnHeaders;
};

export type ExecRet<C extends AuthRouteConfig> =
	RouteConfigToTypedResponse<C> extends infer X
		? X extends { _data: infer D }
			? // hoping to capture returns like 302 which don't return body
				// of course would false positive literal {} responses, but we don't
				// do that
				{} extends D
				? Response
				: D
			: X
		: never;

export type Exec<C extends AuthRouteConfig, E extends Env> = Fn<
	CustomIO<C, "in"> extends undefined
		? [ctx?: Context<E> | ExecOpts<boolean, boolean>]
		: [
				input: NonNullable<CustomIO<C, "in">>,
				ctx?: Context<E> | ExecOpts<boolean, boolean>,
			],
	Promise<ExecRet<C>>
>;

export interface AuthExecute {
	<C extends MinRouteConfig, E extends Env>(): <
		AsResponse extends boolean = false,
		ReturnHeaders extends boolean = false,
	>(
		...args: CustomIO<C, "in"> extends undefined
			? [ctx?: Context<E> | ExecOpts<AsResponse, ReturnHeaders>]
			: [
					input: CustomIO<C, "in"> & {},
					ctx?: Context<E> | ExecOpts<AsResponse, ReturnHeaders>,
				]
	) => Promise<
		AsResponse extends true
			? Response
			: ReturnHeaders extends true
				? {
						headers: Headers;
						response: ExecRet<C>;
					}
				: ExecRet<C>
	>;
}

export declare const execHelper: AuthExecute;
