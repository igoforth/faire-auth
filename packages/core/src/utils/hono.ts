import type { Context, HonoRequest } from "hono";
import type {
	CustomIO,
	DefaultHook,
	FromFn,
	ValidationTargets,
} from "../types/helper";
import type { AuthRouteConfig } from "../types/hono";
import { initRenderer } from "../factory/renderer";

export const hookFor = (
	key: string,
	options: {
		routeHooks?: Record<string, FromFn<DefaultHook> | undefined>;
		plugins?:
			| {
					routeHooks?: Record<string, FromFn<DefaultHook> | undefined>;
			  }[]
			| undefined;
	},
): FromFn<DefaultHook> | undefined =>
	options.routeHooks?.[key] ??
	options.plugins?.find((plugin) => plugin.routeHooks?.[key])?.routeHooks?.[
		key
	];

/**
 * Very loose “best-effort” guard for Hono’s Context.
 * Returns true only if the value is an object that exposes
 * the minimal, recognizable surface of a Context instance.
 */
export const isContextLike = (value: unknown): value is Context =>
	typeof value === "object" &&
	value !== null &&
	// core fields we can test without side-effects
	"env" in value &&
	"finalized" in value &&
	"req" in value &&
	"header" in value &&
	"status" in value &&
	"json" in value &&
	"text" in value;

/**
 * Very loose “best-effort” guard for Hono’s HonoRequest.
 * Returns true only if the value is an object that exposes
 * the minimal, recognizable surface of a HonoRequest instance.
 */
export const isHonoRequestLike = (value: unknown): value is HonoRequest =>
	value != null &&
	typeof value === "object" &&
	"raw" in value &&
	value.raw instanceof Request &&
	"header" in value &&
	typeof value.header === "function" &&
	"query" in value &&
	typeof value.query === "function" &&
	"param" in value &&
	typeof value.param === "function" &&
	"json" in value &&
	typeof value.json === "function" &&
	"path" in value &&
	typeof value.path === "string";

export const isExecOpts = (value: unknown): boolean =>
	typeof value === "object" &&
	value != null &&
	("asResponse" in value || "returnHeaders" in value || "headers" in value);

/**
 * Overlay an arbitrary set of validation targets.
 * Returns the same request object (patched) and a `restore` function.
 */
export const withOverlays = <C extends AuthRouteConfig>(
	ctx: Context,
	newInput: CustomIO<C, "in">,
	config: AuthRouteConfig,
): Context => {
	// keep the originals
	const origValid: any = ctx.req.valid.bind(ctx.req);
	const origGet = ctx.get.bind(ctx);

	// build the proxy
	const proxiedCtx = new Proxy(ctx, {
		get(target, prop, receiver) {
			if (prop === "render") return initRenderer(proxiedCtx);

			if (prop === "get")
				return function (this: Context, key: string) {
					return key === "config" ? config : origGet(key);
				};

			// intercept access to ctx.req
			if (prop === "req")
				return new Proxy(ctx.req, {
					get(reqTarget, reqProp) {
						if (reqProp === "valid")
							return function (
								this: HonoRequest,
								key: keyof ValidationTargets,
							) {
								return key in (newInput as any)
									? (newInput as any)[key]
									: origValid(key);
							};

						return (reqTarget as any)[reqProp];
					},
				});

			return Reflect.get(target, prop, receiver);
		},
	});

	return proxiedCtx;
};

export const updateRequestJson = <T>(req: HonoRequest, value: T) => {
	Object.defineProperty(req, "json", {
		value: async () => value,
		writable: false,
		configurable: true,
	});
};
