import type {
	OpenApiGeneratorV3,
	ZodContentObject,
	ZodMediaTypeObject,
	ZodRequestBody,
} from "@asteasolutions/zod-to-openapi";
import type {
	Context,
	Env,
	Hono,
	HonoRequest,
	Input,
	MiddlewareHandler,
	ToSchema,
} from "hono";
import type { MergePath, TypedResponse } from "hono/types";
import type { CustomHeader, RequestHeader } from "hono/utils/headers";
import type {
	ClientErrorStatusCode,
	InfoStatusCode,
	RedirectStatusCode,
	ServerErrorStatusCode,
	StatusCode,
	SuccessStatusCode,
} from "hono/utils/http-status";
import type { z } from "zod";
// import type { CBORObject, CBORValue } from "./cbor";
import type { ResponseHeader } from "hono/utils/headers";
import type { BaseMime } from "hono/utils/mime";
import type {
	JSONArray,
	JSONObject,
	JSONParsed,
	JSONPrimitive,
} from "hono/utils/types";
import type { AuthRouteConfig, execHelper, MinRouteConfig } from "./hono";

export type Awaitable<T> = Promise<T> | T;

type UnknownZodType = z.ZodType;

type UnwrapPromise<P> = P extends Promise<infer R> ? R : P;

export type AsArray<T> = T extends undefined ? [] : T extends any[] ? T : [T];

export type Primitive =
	| string
	| number
	| symbol
	| bigint
	| boolean
	| null
	| undefined;
export type LiteralString = "" | (string & Record<never, never>);
export type LiteralNumber = 0 | (number & Record<never, never>);

export type ExK<T, U> = {
	[P in keyof T as P extends U ? never : P]: T[P];
} & {};

export type ExV<T, U> = {
	// Exclude distributes over union
	[P in keyof T]: Exclude<T[P], U>;
} & {};

export type OmitId<T extends { id?: unknown }> = ExK<T, "id">;

export type Prettify<T> = ExK<T, never>;
export type PreserveJSDoc<T> = { [K in keyof T]: T[K] } & {};
export type PrettifyDeep<T> = {
	[K in keyof T]: T[K] extends (...args: any[]) => any
		? T[K]
		: T[K] extends object
			? T[K] extends any[]
				? T[K]
				: T[K] extends Date
					? T[K]
					: PrettifyDeep<T[K]>
			: T[K];
} & {};
export type LiteralUnion<LiteralType, BaseType extends Primitive> =
	| LiteralType
	| (BaseType & Record<never, never>);
export type LiteralStringUnion<T> = LiteralUnion<T, string>;

export type UnionToIntersection<U> = (
	U extends any
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

export type RequiredKeysOf<BaseType extends object> = Exclude<
	{
		[Key in keyof BaseType]: BaseType extends Record<Key, BaseType[Key]>
			? Key
			: never;
	}[keyof BaseType],
	undefined
>;

export type HasRequiredKeys<BaseType extends object> =
	RequiredKeysOf<BaseType> extends never ? false : true;
export type WithoutEmpty<T> = T extends T ? ({} extends T ? never : T) : never;

export type StripEmptyObjects<T> = T extends { [K in keyof T]: never }
	? never
	: T extends object
		? { [K in keyof T as T[K] extends never ? never : K]: T[K] }
		: T;
export type DeepPartial<T> = T extends Function
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartial<T[K]> }
		: T;
export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type SafePick<T, K extends PropertyKey> = { [P in K & keyof T]: T[P] };

export interface Fn<Params = unknown, Returns = unknown> {
	params: Params;
	returns: Returns;
}

export type ToFn<F> = F extends (...args: infer A) => infer R
	? Fn<A, R>
	: never;

export type FromFn<F extends Fn> = (
	...args: AsArray<F["params"]>
) => F["returns"];

type Call<F extends Fn, P> = (F & {
	params: P;
})["returns"];

type UnwrapTuple<Tuple extends readonly unknown[]> = {
	[K in keyof Tuple]: K extends `${number}`
		? Tuple[K]
		: UnwrapPromise<Tuple[K]>;
};

type IsJson<T> = T extends string
	? T extends `application/${infer Start}json${infer _End}`
		? Start extends "" | `${string}+` | `vnd.${string}+`
			? "json"
			: never
		: never
	: never;
type IsCbor<T> = T extends string
	? T extends `application/${infer Start}cbor${infer _End}`
		? Start extends "" | `${string}+` | `vnd.${string}+`
			? "cbor"
			: never
		: never
	: never;
type IsForm<T> = T extends string
	? T extends
			| `application/x-www-form-urlencoded${infer _Rest}`
			| `multipart/form-data${infer _Rest}`
		? "form"
		: never
	: never;
type RequestTypes = {
	body?: ZodRequestBody;
	params?: z.ZodType;
	query?: z.ZodType;
	cookies?: z.ZodType;
	headers?: z.ZodType | z.ZodType[];
};
type RequestPart<
	R extends AuthRouteConfig,
	Part extends string,
> = Part extends keyof R["request"] ? R["request"][Part] : {};
type FormValue = string | Blob;
type ParsedFormValue = string | File;
export type ValidationTargets<
	T extends FormValue = ParsedFormValue,
	P extends string = string,
> = {
	cbor: any;
	json: any;
	form: Record<string, T | T[]>;
	query: Record<string, string | string[]>;
	param: Record<P, P extends `${infer _}?` ? string | undefined : string>;
	header: Record<RequestHeader | CustomHeader, string>;
	cookie: Record<string, string>;
};

type PickSchema<C> = C extends ZodContentObject
	? C[keyof C] extends Record<"schema", z.ZodType>
		? C[keyof C]["schema"]
		: never
	: never;

type ContentKeyFor<
	Target extends keyof ValidationTargets,
	C,
> = Target extends "json"
	? IsJson<keyof C>
	: Target extends "cbor"
		? IsCbor<keyof C>
		: Target extends "form"
			? IsForm<keyof C>
			: never;

type InputTypeBody<
	R extends AuthRouteConfig,
	Target extends keyof ValidationTargets,
> = R["request"] extends RequestTypes
	? R["request"]["body"] extends ZodRequestBody
		? R["request"]["body"]["content"] extends infer C
			? ContentKeyFor<Target, C> extends never
				? {}
				: PickSchema<C> extends UnknownZodType
					? {
							in: { [K in Target]: z.input<PickSchema<C>> };
							out: { [K in Target]: z.output<PickSchema<C>> };
						}
					: {}
			: {}
		: {}
	: {};

type InputTypeBase<
	R extends AuthRouteConfig,
	Part extends string,
	Type extends keyof ValidationTargets,
> = R["request"] extends RequestTypes
	? RequestPart<R, Part> extends UnknownZodType
		? {
				in: {
					[K in Type]: undefined extends ValidationTargets[K]
						? {
								[K2 in keyof z.input<RequestPart<R, Part>>]?: z.input<
									RequestPart<R, Part>
								>[K2];
							}
						: {
								[K2 in keyof z.input<RequestPart<R, Part>>]: z.input<
									RequestPart<R, Part>
								>[K2];
							};
				};
				out: { [K in Type]: z.output<RequestPart<R, Part>> };
			}
		: {}
	: {};

export type InputTypeJson<R extends AuthRouteConfig> = InputTypeBody<R, "json">;
export type InputTypeCbor<R extends AuthRouteConfig> = InputTypeBody<R, "cbor">;
export type InputTypeForm<R extends AuthRouteConfig> = InputTypeBody<R, "form">;
export type InputTypeParam<R extends AuthRouteConfig> = InputTypeBase<
	R,
	"params",
	"param"
>;
export type InputTypeQuery<R extends AuthRouteConfig> = InputTypeBase<
	R,
	"query",
	"query"
>;
export type InputTypeHeader<R extends AuthRouteConfig> = InputTypeBase<
	R,
	"headers",
	"header"
>;
export type InputTypeCookie<R extends AuthRouteConfig> = InputTypeBase<
	R,
	"cookies",
	"cookie"
>;
// type InputTypeCbor<R extends AuthRouteConfig> = InputTypeBase<R, 'cbor'>;
// type InputTypeJson<R extends AuthRouteConfig> = R["request"] extends RequestTypes
// 	? R["request"]["body"] extends ZodRequestBody
// 		? R["request"]["body"]["content"] extends ZodContentObject
// 			? IsJson<keyof R["request"]["body"]["content"]> extends never
// 				? {}
// 				: R["request"]["body"]["content"][keyof R["request"]["body"]["content"]] extends Record<
// 							"schema",
// 							z.ZodType<any>
// 						>
// 					? {
// 							in: {
// 								json: z.input<
// 									R["request"]["body"]["content"][keyof R["request"]["body"]["content"]]["schema"]
// 								>;
// 							};
// 							out: {
// 								json: z.output<
// 									R["request"]["body"]["content"][keyof R["request"]["body"]["content"]]["schema"]
// 								>;
// 							};
// 						}
// 					: {}
// 			: {}
// 		: {}
// 	: {};
// type InputTypeCbor<R extends AuthRouteConfig> = R["request"] extends RequestTypes
// 	? R["request"]["body"] extends ZodRequestBody
// 		? R["request"]["body"]["content"] extends ZodContentObject
// 			? IsCbor<keyof R["request"]["body"]["content"]> extends never
// 				? {}
// 				: R["request"]["body"]["content"][keyof R["request"]["body"]["content"]] extends Record<
// 							"schema",
// 							z.ZodType<any>
// 						>
// 					? {
// 							in: {
// 								cbor: z.input<
// 									R["request"]["body"]["content"][keyof R["request"]["body"]["content"]]["schema"]
// 								>;
// 							};
// 							out: {
// 								cbor: z.output<
// 									R["request"]["body"]["content"][keyof R["request"]["body"]["content"]]["schema"]
// 								>;
// 							};
// 						}
// 					: {}
// 			: {}
// 		: {}
// 	: {};
// type InputTypeForm<R extends RouteConfig> = R["request"] extends RequestTypes
// 	? R["request"]["body"] extends ZodRequestBody
// 		? R["request"]["body"]["content"] extends ZodContentObject
// 			? IsForm<keyof R["request"]["body"]["content"]> extends never
// 				? {}
// 				: R["request"]["body"]["content"][keyof R["request"]["body"]["content"]] extends Record<
// 							"schema",
// 							z.ZodType<any>
// 						>
// 					? {
// 							in: {
// 								form: z.input<
// 									R["request"]["body"]["content"][keyof R["request"]["body"]["content"]]["schema"]
// 								>;
// 							};
// 							out: {
// 								form: z.output<
// 									R["request"]["body"]["content"][keyof R["request"]["body"]["content"]]["schema"]
// 								>;
// 							};
// 						}
// 					: {}
// 			: {}
// 		: {}
// 	: {};
// type InputTypeParam<R extends RouteConfig> = InputTypeBody<
// 	R,
// 	"params",
// 	"param"
// >;
// type InputTypeQuery<R extends RouteConfig> = InputTypeBody<R, "query", "query">;
// type InputTypeHeader<R extends RouteConfig> = InputTypeBody<
// 	R,
// 	"headers",
// 	"header"
// >;
// type InputTypeCookie<R extends RouteConfig> = InputTypeBody<
// 	R,
// 	"cookies",
// 	"cookie"
// >;

export type InferInput<R extends AuthRouteConfig> = InputTypeCbor<R> &
	InputTypeCookie<R> &
	InputTypeForm<R> &
	InputTypeHeader<R> &
	InputTypeJson<R> &
	InputTypeParam<R> &
	InputTypeQuery<R>;

type ValidJSONObject = {
	[key: string]: JSONPrimitive | JSONArray | JSONObject | object;
};

// export type TypedResponse<
// 	T = unknown,
// 	U extends StatusCode = StatusCode,
// 	F extends ResponseFormat = T extends string
// 		? "text"
// 		: T extends CBORObject
// 			? T extends ValidJSONObject
// 				? "json"
// 				: "cbor"
// 			: T extends JSONValue
// 				? "json"
// 				: ResponseFormat,
// > = { _data: T; _status: U; _format: F };

export type ExtractContent<T, Inp extends boolean = false> = T extends Record<
	string,
	infer A
>
	? A extends Record<"schema", infer S>
		? S extends UnknownZodType
			? true extends Inp
				? z.input<S>
				: z.output<S>
			: never
		: never
	: never;

export type ReturnJsonOrTextOrResponse<
	ContentType,
	Content,
	Status extends keyof StatusCodeRangeDefinitions | StatusCode,
> = ContentType extends string
	? ContentType extends `application/${infer Start}json${infer _End}`
		? Start extends "" | `${string}+` | `vnd.${string}+`
			? TypedResponse<JSONParsed<Content>, ExtractStatusCode<Status>, "json">
			: never
		: ContentType extends "application/xml"
			? TypedResponse<Content, ExtractStatusCode<Status>, "text">
			: ContentType extends `text/plain${infer _Rest}`
				? TypedResponse<Content, ExtractStatusCode<Status>, "text">
				: ContentType extends `text/html${infer _Rest}`
					? TypedResponse<Content, ExtractStatusCode<Status>, "text">
					: Response
	: never;

// TODO: improved, with critical first line checking for early exit
// to bare RouteConfig otherwise infinite tsc loop
export type RouteConfigToTypedResponse<
	R extends AuthRouteConfig,
	Inp extends boolean = false,
> =
	| {
			[Status in DefinedStatusCodes<R>]: R["responses"][Status] extends {
				content: infer Content;
			}
				? undefined extends Content
					? never
					: ReturnJsonOrTextOrResponse<
							keyof R["responses"][Status]["content"],
							ExtractContent<R["responses"][Status]["content"], Inp>,
							Status
						>
				: TypedResponse<{}, ExtractStatusCode<Status>, string>;
	  }[DefinedStatusCodes<R>]
	| ("default" extends keyof R["responses"]
			? R["responses"]["default"] extends { content: infer Content }
				? undefined extends Content
					? never
					: ReturnJsonOrTextOrResponse<
							keyof Content,
							ExtractContent<Content, Inp>,
							Exclude<StatusCode, ExtractStatusCode<DefinedStatusCodes<R>>>
						>
				: TypedResponse<
						{},
						Exclude<StatusCode, ExtractStatusCode<DefinedStatusCodes<R>>>,
						string
					>
			: never)
	| ("middleware" extends keyof R
			? R["middleware"] extends infer M
				? M extends (infer X)[]
					? X extends unknown
						? X extends (...args: any[]) => Promise<infer Ret>
							? Ret extends infer Y
								? void extends Y
									? never
									: Y extends Response & infer U
										? U
										: Y
								: void extends Ret
									? never
									: Ret extends Response & infer U
										? U
										: Ret
							: never
						: never
					: M extends (...args: any[]) => Promise<infer Ret>
						? Ret extends infer X
							? void extends X
								? never
								: X extends Response & infer U
									? U
									: X
							: void extends Ret
								? never
								: Ret extends Response & infer U
									? U
									: Ret
						: never
				: never
			: never);

/**
 * Helper to infer generics from {@link MiddlewareHandler}
 */
type OfHandlerType<T> = T extends (
	...args: [ctx: Context<infer E, infer P, infer I>, ...infer _Rest]
) => Promise<infer R>
	? { env: E; path: P; input: I; output: R }
	: never;

// TODO: this was originally to protect the return type in case
// of nested but I think our algorithm is good enough now
// export type DTOTransformer<
//   T,
//   O = T extends infer U ?
//     U extends any[] ? unknown[]
//     : U extends object ? object
//     : never
//   : never,
// > =
//   O extends never ? never
//   : //   T extends any[] ? { (input: T): O | Promise<O> }
//   : //   T extends object ? { (input: T): O | Promise<O> }
//   : never

export type DTOTransformer<T, O = any> = (input: T) => O | Promise<O>;

export type DefaultHook = Fn<
	[
		result:
			| { success: true; target: string; data: any }
			| { success: false; error: z.ZodError<unknown> },
		ctx: Context,
	],
	any
>;

type StringKeys<T> = keyof T extends string ? keyof T : never;

export type HonoHook<T, E extends Env, P extends string, R> = Fn<
	[
		result:
			| {
					[K in StringKeys<T>]: {
						success: true;
						target: LiteralStringUnion<K>;
						data: T[K];
					};
			  }[StringKeys<T>]
			| { success: false; error: z.ZodError<unknown> },
		ctx: Context<E, P>,
	],
	R
>;

// export type ConvertPathType<C extends { path: string }> =
// 	C["path"] extends `${infer Start}/{${infer Param}}${infer Rest}`
// 		? `${Start}/:${Param}${ConvertPathType<{ path: Rest }>}`
// 		: C["path"];

export type ConvertPathType<T extends string> =
	T extends `${infer Start}/{${infer Param}}${infer Rest}`
		? `${Start}/:${Param}${ConvertPathType<Rest>}`
		: T;

// loop with raw AuthRouteConfig to RouteConfigToTypedResponse ?

export type RouteHook<
	R extends MinRouteConfig,
	E extends Env = RouteConfigToEnv<R>,
	I extends Input = InferInput<R>,
	P extends string = ConvertPathType<R["path"]>,
> = HonoHook<
	I["out"],
	E,
	P,
	R extends {
		responses: {
			[statusCode: number]: {
				content: {
					[mediaType: string]: ZodMediaTypeObject;
				};
			};
		};
	}
		? Awaitable<RouteConfigToTypedResponse<R>> | undefined
		: Awaitable<RouteConfigToTypedResponse<R>> | Awaitable<Response> | undefined
>;

/**
 * Reduce a tuple of middleware handlers into a single
 * handler representing the composition of all
 * handlers.
 */
export type MiddlewareToHandlerType<
	M extends MiddlewareHandler<any, any, any>[],
> = M extends [infer First, infer Second, ...infer Rest]
	? First extends MiddlewareHandler<any, any, any>
		? Second extends MiddlewareHandler<any, any, any>
			? Rest extends MiddlewareHandler<any, any, any>[] // Ensure Rest is an array of MiddlewareHandler
				? MiddlewareToHandlerType<
						[
							MiddlewareHandler<
								OfHandlerType<First>["env"] & OfHandlerType<Second>["env"], // Combine envs
								OfHandlerType<First>["path"], // Keep path from First
								OfHandlerType<First>["input"] // Keep input from First
							>,
							...Rest,
						]
					>
				: never
			: never
		: never
	: M extends [infer Last]
		? Last // Return the last remaining handler in the array
		: MiddlewareHandler<Env>;

export type RouteConfigToMiddleware<C> = "middleware" extends keyof C
	? C["middleware"] extends infer M
		? M extends MiddlewareHandler | MiddlewareHandler[]
			? MiddlewareToHandlerType<AsArray<M>>
			: never
		: never
	: never;

export type RouteMiddlewareParams<C extends AuthRouteConfig> = OfHandlerType<
	RouteConfigToMiddleware<C>
>;

export type RouteConfigToEnv<R extends AuthRouteConfig> =
	RouteMiddlewareParams<R> extends never
		? Env
		: RouteMiddlewareParams<R>["env"];

export type RouteConfigToRequest<R extends AuthRouteConfig> = HonoRequest<
	R["path"],
	CustomIO<R, "out">
>;

// HonoHook<
// 	I["out"],
// 	E,
// 	P,
// 	MaybePromise<RouteConfigToTypedResponse<R> | Response | void> // undefined
// >;

export type StatusCodeRangeDefinitions = {
	"1XX": InfoStatusCode;
	"2XX": SuccessStatusCode;
	"3XX": RedirectStatusCode;
	"4XX": ClientErrorStatusCode;
	"5XX": ServerErrorStatusCode;
};
export type ExtractStatusCode<T extends RouteConfigStatusCode> =
	T extends keyof StatusCodeRangeDefinitions
		? StatusCodeRangeDefinitions[T]
		: T;

type RouteConfigStatusCode = keyof StatusCodeRangeDefinitions | StatusCode;
export type DefinedStatusCodes<R extends AuthRouteConfig> =
	keyof R["responses"] extends infer C
		? C extends RouteConfigStatusCode
			? C
			: never
		: never;

export type ResponseHeadersInit =
	| [string, string][]
	| Headers
	| Record<"Content-Type", BaseMime>
	| Record<ResponseHeader, string>
	| Record<string, string>;
interface ResponseInit<T extends StatusCode = StatusCode> {
	headers?: ResponseHeadersInit;
	status?: T;
	statusText?: string;
}
export type HeaderRecord =
	| Record<"Content-Type", BaseMime>
	| Record<ResponseHeader, string | string[]>
	| Record<string, string | string[]>;
export type ResponseOrInit<T extends StatusCode = StatusCode> =
	| Response
	| ResponseInit<T>;

export type OpenAPIHonoOptions<E extends Env> = {
	defaultHook?: FromFn<HonoHook<any, E, any, any>>;
};

export type OpenAPIObjectConfig = Parameters<
	InstanceType<typeof OpenApiGeneratorV3>["generateDocument"]
>[0];

export type OpenAPIObjectConfigure<
	E extends Env = Env,
	P extends string = string,
> = OpenAPIObjectConfig | ((context: Context<E, P>) => OpenAPIObjectConfig);

export type OpenAPIGeneratorOptions = ConstructorParameters<
	typeof OpenApiGeneratorV3
>[1];

export type OpenAPIGeneratorConfigure<E extends Env, P extends string> =
	| OpenAPIGeneratorOptions
	| ((context: Context<E, P>) => OpenAPIGeneratorOptions);

type HonoOptions = Exclude<ConstructorParameters<typeof Hono>[0], undefined>;
export type HonoInit<E extends Env = Env> = HonoOptions & OpenAPIHonoOptions<E>;

// [AsResponse] extends [true] ? Response : [ReturnHeaders] extends [true] ? {
//             headers: Headers;
//             response: R;
//         } : R

// RouteConfigToTypedResponse<C> extends infer X
// 									? X extends { _data: infer D }
// 										? {} extends D
// 											? Response
// 											: D
// 										: X
// 									: never

export type CustomIO<
	TConfig extends AuthRouteConfig,
	Dir extends "in" | "out",
> = InferInput<TConfig> extends { [K in Dir]: infer IO }
	? IO extends object
		? IO
		: undefined
	: undefined;

type AddExtra<C extends AuthRouteConfig, BasePath extends string = ""> = {
	[K in MergePath<BasePath, ConvertPathType<C["path"]>>]: {
		[K2 in C["method"] as `$${Lowercase<K2>}`]: Pick<
			C,
			"operationId" | "isAction" | "SERVER_ONLY" | "client"
		> & { _api: ReturnType<typeof execHelper<C, Env>> };
	};
};

export type ConfigToSchema<
	C extends AuthRouteConfig,
	BasePath extends string = "",
> = Prettify<
	ToSchema<
		C["method"],
		MergePath<BasePath, ConvertPathType<C["path"]>>,
		InferInput<C>,
		RouteConfigToTypedResponse<C>
	> &
		AddExtra<C, BasePath>
>;

export type BuildSchema<
	C,
	BasePath extends string = "",
> = C extends AuthRouteConfig ? ConfigToSchema<C, BasePath> : never;

// type Test1<O extends object, Find, Replace> =
//   'key' extends keyof O ?
//     O['key'] extends Find | undefined ?
//       Omit<O, 'key'> & { key: Replace }
//     : O
//   : O
// type Test2<O extends object, Find, Replace> = {
//   [K in keyof O]: K extends 'key' ?
//     O[K] extends Find | undefined ?
//       Replace
//     : O[K]
//   : O[K]
// }
