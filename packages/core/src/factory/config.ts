import type {
	ResponseConfig,
	ZodRequestBody,
} from "@asteasolutions/zod-to-openapi";
import type {
	ZodMediaType,
	ZodMediaTypeObject,
} from "@asteasolutions/zod-to-openapi/dist/openapi-registry";
import type { ReferenceObject } from "@asteasolutions/zod-to-openapi/dist/types";
import type { MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";
import { _statusText } from "../error/codes";
import { Definitions } from "../static/definitions";
import { SCHEMAS } from "../static/schema";
import type { AuthRouteConfig } from "../types/hono";
import { zodError } from "../utils/schema";
import type { LiteralStringUnion } from "../types/helper";

// TODO: save. typescript may be too weak for this for now
// type LiteralToZod<D extends z.util.Literal | z.util.Literal[]> =
// 	D extends (infer S extends z.util.Literal)[]
// 		? z.ZodUnion<UnionToTuple<S extends any ? z.ZodLiteral<S> : never>>
// 		: D extends z.util.Literal
// 			? z.ZodLiteral<D>
// 			: never;

// type LiteralErrorSchema<D extends z.util.Literal | z.util.Literal[]> =
// 	z.core.$ZodBranded<
// 		z.ZodObject<
// 			{
// 				success: z.ZodLiteral<false>;
// 				code: z.ZodOptional<z.ZodString>;
// 				message: LiteralToZod<D>;
// 			},
// 			z.core.$strip
// 		>,
// 		"error"
// 	>;

class ResponseBuilder<
	R extends Record<
		number,
		{
			description: string;
			content?: Partial<Record<ZodMediaType, { schema: any }>>;
		}
	> = {},
> {
	private map: R = {} as R;

	constructor(
		schema200?: z.ZodType,
		desc: string = _statusText[200],
		contentType: ZodMediaType = "application/json",
	) {
		if (schema200)
			this.map[200] = {
				description: desc,
				content: { [contentType]: { schema: schema200 } },
			};
	}

	rdr(desc: string = _statusText[302]): ResponseBuilder<
		R & {
			[302]: {
				description: string;
			};
		}
	> {
		this.map[302] = {
			description: desc,
		};
		return this as any;
	}

	err<C extends ContentfulStatusCode, S = (typeof SCHEMAS)["error"]["default"]>(
		this: ResponseBuilder<R>,
		code: C,
		desc: string = _statusText[code],
		schema: S = SCHEMAS["error"]["default"] as S,
	): ResponseBuilder<
		R & {
			[K in C]: {
				description: string;
				content: {
					"application/json": { schema: S };
				};
			};
		}
	> {
		this.map[code] = {
			description: desc,
			content: {
				"application/json": { schema },
			},
		};
		return this as any;
	}

	zod<S>(_s?: S): ResponseBuilder<
		R & {
			[422]: {
				description: string;
				content: {
					"application/json": {
						schema: ReturnType<typeof zodError<z.input<S>>>;
					};
				};
			};
		}
	> {
		this.map[422] = {
			description: "Zod Error",
			content: { "application/json": { schema: zodError<S>() } },
		};
		return this as any;
	}

	bld(): R {
		return this.map;
	}
}

/**
 * Creates a response builder for defining API response schemas.
 */
export const res = <
	S extends z.ZodType,
	M extends ZodMediaType = "application/json",
>(
	schema200?: S,
	desc?: string,
	contentType: M = "application/json" as M,
) =>
	new ResponseBuilder<
		undefined extends S
			? {}
			: {
					[200]: {
						description: string;
						content: { [K in M]: { schema: S } };
					};
				}
	>(schema200, desc, contentType);

type ZodObjectWithEffect = z.ZodObject | z.ZodPipe;
class RequestBuilder<
	B extends ZodRequestBody | undefined = undefined,
	P extends ZodObjectWithEffect | undefined = undefined,
	Q extends ZodObjectWithEffect | undefined = undefined,
	C extends ZodObjectWithEffect | undefined = undefined,
	H extends ZodObjectWithEffect | z.ZodType[] | undefined = undefined,
> {
	private map: Exclude<AuthRouteConfig["request"], undefined> = {};

	bdy<B1 extends z.ZodType>(
		schema: B1,
		desc?: string,
	): RequestBuilder<
		{
			description?: string;
			content: { "application/json": { schema: B1 } };
			required: true;
		},
		P,
		Q,
		C,
		H
	> {
		this.map.body = {
			...(desc && { description: desc }),
			content: { "application/json": { schema } },
		};
		return this as any;
	}

	prm<P1 extends ZodObjectWithEffect>(
		schema: P1,
	): RequestBuilder<B, P1, Q, C, H> {
		this.map.params = schema;
		return this as any;
	}

	qry<Q1 extends ZodObjectWithEffect>(
		schema: Q1,
	): RequestBuilder<B, P, Q1, C, H> {
		this.map.query = schema;
		return this as any;
	}

	cke<C1 extends ZodObjectWithEffect>(
		schema: C1,
	): RequestBuilder<B, P, Q, C1, H> {
		this.map.cookies = schema;
		return this as any;
	}

	hdr<H1 extends ZodObjectWithEffect | z.ZodType[]>(
		schema: H1,
	): RequestBuilder<B, P, Q, C, H1> {
		this.map.headers = schema;
		return this as any;
	}

	bld(): (undefined extends B
		? {}
		: {
				body: B;
			}) &
		(undefined extends P
			? {}
			: {
					params: P;
				}) &
		(undefined extends Q
			? {}
			: {
					query: Q;
				}) &
		(undefined extends C
			? {}
			: {
					cookies: C;
				}) &
		(undefined extends H
			? {}
			: {
					headers: H;
				}) {
		return this.map as any;
	}
}

/**
 * Creates a request builder for defining API request schemas.
 */
export const req = () => new RequestBuilder();

// const configLRU = lruCache<string, AuthRouteConfig>({ maxSize: 50 })
/**
 * Resolves the route configuration by merging middleware from options and plugins, and transforming response schemas.
 */
export const resolveConfig = <C extends AuthRouteConfig>(
	config: C,
	options: {
		middleware?: Record<string, MiddlewareHandler | undefined>;
		plugins?:
			| {
					middleware?: Record<string, MiddlewareHandler | undefined>;
			  }[]
			| undefined;
	},
	builtSchemas: Record<LiteralStringUnion<Definitions>, z.ZodType>,
): C => ({
	...config,
	middleware: (() => {
		const middleware = config.middleware
			? Array.isArray(config.middleware)
				? config.middleware
				: [config.middleware]
			: [];
		if (
			options.middleware != null &&
			config.operationId in options.middleware &&
			options.middleware[config.operationId] != null
		)
			middleware.push(options.middleware[config.operationId]!);
		options.plugins?.forEach((plugin) => {
			if (
				plugin.middleware != null &&
				config.operationId in plugin.middleware &&
				plugin.middleware[config.operationId] != null
			)
				middleware.push(plugin.middleware[config.operationId]!);
		});
		return middleware;
	})(),
	responses: Object.entries(config.responses).reduce<
		Record<string, ReferenceObject | ResponseConfig>
	>((acc, [status, response]) => {
		acc[status] =
			"content" in response
				? {
						...response,
						content: Object.entries(response.content ?? {}).reduce<
							Partial<Record<ZodMediaType, ZodMediaTypeObject>>
						>((acc, [mediaType, media]) => {
							acc[mediaType] =
								media != null
									? {
											...media,
											...("schema" in media && {
												schema:
													"_zod" in media.schema
														? (() => {
																const brand =
																	typeof media.schema._zod.bag["dto"] ===
																	"string"
																		? media.schema._zod.bag["dto"]
																		: typeof media.schema._zod.bag["dto"] ===
																				"object"
																			? (media.schema._zod.bag["dto"] as any)?.[
																					"_self"
																				]
																			: undefined;
																if (brand && builtSchemas[brand])
																	return builtSchemas[brand];
																return media.schema;
															})()
														: media.schema,
											}),
										}
									: media;
							return acc;
						}, {}),
					}
				: response;
		return acc;
	}, {}),
});
