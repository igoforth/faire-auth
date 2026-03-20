import {
	OpenAPIRegistry,
	OpenApiGeneratorV3,
	OpenApiGeneratorV31,
	getOpenApiMetadata,
	type ZodMediaTypeObject,
} from "@asteasolutions/zod-to-openapi";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { RegExpRouter } from "hono/router/reg-exp-router";
import type {
	Env,
	MergePath,
	MergeSchemaPath,
	MiddlewareHandler,
	Schema,
	ToSchema,
} from "hono/types";
import type { RemoveBlankRecord } from "hono/utils/types";
import { mergePath } from "hono/utils/url";
import type { OpenAPIObject } from "openapi3-ts/oas30";
import type { OpenAPIObject as OpenAPIV31bject } from "openapi3-ts/oas31";
import * as z from "zod";
import { False } from "../static/constants";
import type {
	ConvertPathType,
	DefaultHook,
	FromFn,
	InferInput,
	OpenAPIGeneratorConfigure,
	OpenAPIGeneratorOptions,
	OpenAPIHonoOptions,
	OpenAPIObjectConfig,
	OpenAPIObjectConfigure,
	RouteConfigToEnv,
	RouteConfigToTypedResponse,
	RouteHook,
} from "../types/helper";
import type { AuthRouteConfig, RouteHandler } from "../types/hono";
import type { FaireAuthOptions } from "../types/options";
import { registry } from "./schema";

function isObject(x: unknown): x is Record<string, unknown> {
	return typeof x === "object" && x !== null;
}

function isZod(x: unknown): x is z.ZodType {
	if (!x) return false;
	if (!isObject(x)) return false;
	return (
		typeof x.parse === "function" &&
		typeof x.safeParse === "function" &&
		typeof x.parseAsync === "function" &&
		typeof x.safeParseAsync === "function"
	);
}

function isJSONContentType(contentType: string) {
	return /^application\/([a-z-\.]+\+)?json/.test(contentType);
}

function isFormContentType(contentType: string) {
	return (
		contentType.startsWith("multipart/form-data") ||
		contentType.startsWith("application/x-www-form-urlencoded")
	);
}

function addBasePathToDocument<T extends Record<string, any>>(
	document: T,
	basePath: string,
): T & { paths: Record<string, any> } {
	const updatedPaths: Record<string, any> = {};

	Object.keys(document.paths).forEach((path) => {
		updatedPaths[mergePath(basePath.replaceAll(/:([^\/]+)/g, "{$1}"), path)] =
			document.paths[path];
	});

	return {
		...document,
		paths: updatedPaths,
	};
}

/**
 * A Hono-based class for building OpenAPI-compliant APIs with automatic schema registration and validation.
 */
export class OpenAPIHono<
	E extends Env = any,
	S extends Schema = {},
	BasePath extends string = "/api/auth",
> extends Hono<E, S, BasePath> {
	openAPIRegistry: OpenAPIRegistry;
	defaultHook?: OpenAPIHonoOptions<E>["defaultHook"];

	constructor(options?: FaireAuthOptions) {
		super({
			router: new RegExpRouter(),
		});
		// our global registry has registered all the schemas, we replace
		// the fresh one
		this.openAPIRegistry = registry;
		this.defaultHook =
			(options?.hono?.init?.defaultHook as FromFn<DefaultHook>) ??
			((result, ctx) => {
				if (!result.success)
					return (ctx.render as any)(
						{ success: False, ...z.treeifyError(result.error) },
						422,
					);
				return;
			});

		// add openapi doc route
		if (options?.hono?.openapi?.enabled === true) {
			const {
				path = "openapi.json",
				version = "3.1",
				config = {
					openapi:
						!options.hono.openapi.version ||
						options.hono.openapi.version === "3.1"
							? "3.1.1"
							: "3.0.4",
					info: {
						title: "Faire Auth",
						description: "API Reference for your Faire Auth Instance",
						version: "1.1.0",
					},
					servers: [{ url: `${options.baseURL}${options.basePath}` }],
					security: [{ apiKeyCookie: [], bearerAuth: [] }],
					tags: [
						{
							name: "Default",
							description:
								"Default endpoints that are included with Faire Auth by default. These endpoints are not part of any plugin.",
						},
					],
				},
			} = options.hono.openapi;
			if (version === "3")
				this.doc(path, config as OpenAPIObjectConfigure<any, any>);
			else this.doc31(path, config as OpenAPIObjectConfigure<any, any>);
		}
	}

	/**
	 *
	 * @param {RouteConfig} route - The route definition which you create with `createRoute()`.
	 * @param {Handler} handler - The handler. If you want to return a JSON object, you should specify the status code with `c.json()`.
	 * @param {Hook} hook - Optional. The hook method defines what it should do after validation.
	 * @example
	 * app.openapi(
	 *   route,
	 *   (c) => {
	 *     // ...
	 *     return c.json(
	 *       {
	 *         age: 20,
	 *         name: 'Young man',
	 *       },
	 *       200 // You should specify the status code even if it's 200.
	 *     )
	 *   },
	 *  (result, c) => {
	 *    if (!result.success) {
	 *      return c.json(
	 *        {
	 *          code: 400,
	 *          message: 'Custom Message',
	 *        },
	 *        400
	 *      )
	 *    }
	 *  }
	 *)
	 */
	openapi = <R extends AuthRouteConfig>(
		{ middleware: routeMiddleware, hide, ...route }: R,
		handler: RouteHandler<
			R,
			RouteConfigToEnv<R> & E,
			InferInput<R>,
			ConvertPathType<R["path"]>
		>,
		hook:
			| FromFn<
					RouteHook<
						R,
						RouteConfigToEnv<R> & E,
						InferInput<R>,
						ConvertPathType<R["path"]>
					>
			  >
			| undefined = this.defaultHook as any,
	): OpenAPIHono<
		E,
		S &
			ToSchema<
				R["method"],
				MergePath<BasePath, ConvertPathType<R["path"]>>,
				InferInput<R>,
				RouteConfigToTypedResponse<R>
			>,
		BasePath
	> => {
		if (!hide) this.openAPIRegistry.registerPath(route as any);

		const validators: MiddlewareHandler[] = [];

		if (route.request?.query) {
			const validator = zValidator(
				"query",
				route.request.query as any,
				hook as any,
			);
			validators.push(validator as any);
		}

		if (route.request?.params) {
			const validator = zValidator(
				"param",
				route.request.params as any,
				hook as any,
			);
			validators.push(validator as any);
		}

		if (route.request?.headers) {
			const validator = zValidator(
				"header",
				route.request.headers as any,
				hook as any,
			);
			validators.push(validator as any);
		}

		if (route.request?.cookies) {
			const validator = zValidator(
				"cookie",
				route.request.cookies as any,
				hook as any,
			);
			validators.push(validator as any);
		}

		const bodyContent = route.request?.body?.content;

		if (bodyContent) {
			for (const mediaType of Object.keys(bodyContent)) {
				if (!bodyContent[mediaType]) continue;

				const schema = (bodyContent[mediaType] as ZodMediaTypeObject)["schema"];
				if (!isZod(schema)) continue;

				if (isJSONContentType(mediaType)) {
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-expect-error we can ignore the type error since Zod Validator's types are not used
					const validator = zValidator("json", schema, hook);
					if (route.request?.body?.required) {
						validators.push(validator);
					} else {
						const mw: MiddlewareHandler = async (c, next) => {
							if (c.req.header("content-type")) {
								if (isJSONContentType(c.req.header("content-type")!)) {
									return await validator(c, next);
								}
							}
							c.req.addValidatedData("json", {});
							await next();
						};
						validators.push(mw);
					}
				}
				if (isFormContentType(mediaType)) {
					const validator = zValidator("form", schema, hook as any);
					if (route.request?.body?.required) {
						validators.push(validator);
					} else {
						const mw: MiddlewareHandler = async (c, next) => {
							if (c.req.header("content-type")) {
								if (isFormContentType(c.req.header("content-type")!)) {
									return await validator(c, next);
								}
							}
							c.req.addValidatedData("form", {});
							await next();
						};
						validators.push(mw);
					}
				}
			}
		}

		const middleware = routeMiddleware
			? Array.isArray(routeMiddleware)
				? routeMiddleware
				: [routeMiddleware]
			: [];

		this.on(
			[route.method],
			[route.path.replaceAll(/\/{(.+?)}/g, "/:$1")],
			...middleware,
			...validators,
			handler as any,
		);
		return this;
	};

	getOpenAPIDocument = (
		objectConfig: OpenAPIObjectConfig,
		generatorConfig?: OpenAPIGeneratorOptions,
	): OpenAPIObject => {
		const generator = new OpenApiGeneratorV3(
			this.openAPIRegistry.definitions,
			generatorConfig,
		);
		const document = generator.generateDocument(objectConfig);
		// @ts-expect-error the _basePath is a private property
		return this._basePath
			? // @ts-expect-error the _basePath is a private property
				addBasePathToDocument(document, this._basePath)
			: document;
	};

	getOpenAPI31Document = (
		objectConfig: OpenAPIObjectConfig,
		generatorConfig?: OpenAPIGeneratorOptions,
	): OpenAPIV31bject => {
		const generator = new OpenApiGeneratorV31(
			this.openAPIRegistry.definitions,
			generatorConfig,
		);
		const document = generator.generateDocument(objectConfig);
		// @ts-expect-error the _basePath is a private property
		return this._basePath
			? // @ts-expect-error the _basePath is a private property
				addBasePathToDocument(document, this._basePath)
			: document;
	};

	doc = <P extends string>(
		path: P,
		configureObject: OpenAPIObjectConfigure<E, P>,
		configureGenerator?: OpenAPIGeneratorConfigure<E, P>,
	): OpenAPIHono<E, S & ToSchema<"get", P, {}, {}>, BasePath> => {
		return this.get(path, (c) => {
			const objectConfig =
				typeof configureObject === "function"
					? configureObject(c)
					: configureObject;
			const generatorConfig =
				typeof configureGenerator === "function"
					? configureGenerator(c)
					: configureGenerator;
			try {
				const document = this.getOpenAPIDocument(objectConfig, generatorConfig);
				return c.json(document);
			} catch (e: any) {
				return c.json(e, 500);
			}
		}) as any;
	};

	doc31 = <P extends string>(
		path: P,
		configureObject: OpenAPIObjectConfigure<E, P>,
		configureGenerator?: OpenAPIGeneratorConfigure<E, P>,
	): OpenAPIHono<E, S & ToSchema<"get", P, {}, {}>, BasePath> => {
		return this.get(path, (c) => {
			const objectConfig =
				typeof configureObject === "function"
					? configureObject(c)
					: configureObject;
			const generatorConfig =
				typeof configureGenerator === "function"
					? configureGenerator(c)
					: configureGenerator;
			try {
				const document = this.getOpenAPI31Document(
					objectConfig,
					generatorConfig,
				);
				return c.json(document);
			} catch (e: any) {
				console.warn(e);
				return c.json(e, 500);
			}
		}) as any;
	};

	override route<
		SubPath extends string,
		SubEnv extends Env,
		SubSchema extends Schema,
		SubBasePath extends string,
	>(
		path: SubPath,
		app: Hono<SubEnv, SubSchema, SubBasePath>,
	): OpenAPIHono<
		E,
		MergeSchemaPath<SubSchema, MergePath<BasePath, SubPath>> & S,
		BasePath
	>;
	override route<SubPath extends string>(
		path: SubPath,
	): Hono<E, RemoveBlankRecord<S>, BasePath>;
	override route<
		SubPath extends string,
		SubEnv extends Env,
		SubSchema extends Schema,
		SubBasePath extends string,
	>(
		path: SubPath,
		app?: Hono<SubEnv, SubSchema, SubBasePath>,
	): OpenAPIHono<
		E,
		MergeSchemaPath<SubSchema, MergePath<BasePath, SubPath>> & S,
		BasePath
	> {
		const pathForOpenAPI = path.replaceAll(/:([^\/]+)/g, "{$1}");
		super.route(path, app as any);

		if (!(app instanceof OpenAPIHono)) {
			return this as any;
		}

		app.openAPIRegistry.definitions.forEach((def) => {
			switch (def.type) {
				case "component":
					return this.openAPIRegistry.registerComponent(
						def.componentType,
						def.name,
						def.component,
					);

				case "route": {
					this.openAPIRegistry.registerPath({
						...def.route,
						path: mergePath(
							pathForOpenAPI,
							// @ts-expect-error _basePath is private
							app._basePath.replaceAll(/:([^\/]+)/g, "{$1}"),
							def.route.path,
						),
					});
					return;
				}

				case "webhook": {
					this.openAPIRegistry.registerWebhook({
						...def.webhook,
						path: mergePath(
							pathForOpenAPI,
							// @ts-expect-error _basePath is private
							app._basePath.replaceAll(/:([^\/]+)/g, "{$1}"),
							def.webhook.path,
						),
					});
					return;
				}

				case "schema":
					return this.openAPIRegistry.register(
						getOpenApiMetadata(def.schema)._internal?.refId,
						def.schema,
					);

				case "parameter":
					return this.openAPIRegistry.registerParameter(
						getOpenApiMetadata(def.schema)._internal?.refId,
						def.schema,
					);

				default: {
					const errorIfNotExhaustive: never = def;
					throw new Error(`Unknown registry type: ${errorIfNotExhaustive}`);
				}
			}
		});

		return this as any;
	}

	override basePath<SubPath extends string>(
		path: SubPath,
	): OpenAPIHono<E, S, MergePath<BasePath, SubPath>> {
		return new OpenAPIHono({
			...(super.basePath(path) as any),
			defaultHook: this.defaultHook,
		});
	}
}
