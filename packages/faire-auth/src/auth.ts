import { ENV } from "@faire-auth/core/env";
import { BASE_ERROR_CODES } from "@faire-auth/core/error";
import type { AnyHono, ExK, Expand, Prettify } from "@faire-auth/core/types";
import type { ExecutionContext } from "hono";
import { router } from "./api";
import type { InferAPI, InferApp } from "./api/types";
import { getCloudflareContext } from "./context/cloudflare";
import type { AuthContext } from "./init";
import { init } from "./init";
import type { InferPluginTypes, InferSession, InferUser } from "./types/models";
import type { FaireAuthOptions } from "./types/options";
import type {
	FaireAuthPlugin,
	InferPluginDTO,
	InferPluginErrorCodes,
	InferPluginHooks,
	InferPluginMiddleware,
	InferPluginRateLimit,
} from "./types/plugin";

export type WithJsDoc<T, D> = Expand<D & T>;

// Helper function to create options with proper inference
export function defineOptions<
	const T extends FaireAuthPlugin[],
	U extends {
		routeHooks?: InferPluginHooks<T>;
		middleware?: InferPluginMiddleware<T>;
		dto?: InferPluginDTO<T>;
		rateLimit?: InferPluginRateLimit<T>;
	} & ExK<FaireAuthOptions, "plugins">,
>(config: { plugins: T } & U): { plugins: T } & U;
export function defineOptions<U extends ExK<FaireAuthOptions, "plugins">>(
	config: U,
): U;
export function defineOptions(config: any) {
	return config;
}

export const faireAuth = <Options extends FaireAuthOptions>(
	options: Options &
		// fixme(alex): do we need Record<never, never> here?
		Record<never, never>,
) => {
	const [authContext, authOptions] = init(options as Options);
	const { api, app } = router(authContext, authOptions as Options);

	return {
		handler: (request, Env?: any, executionCtx?: ExecutionContext) => {
			const cfCtx = getCloudflareContext();
			return app.fetch(
				request,
				Env ?? cfCtx?.env ?? ENV,
				executionCtx ?? cfCtx?.ctx,
			);
		},
		app,
		api,
		options: authOptions as {
			[x: string]: unknown;
			secret: string;
			baseURL: string;
			basePath: string;
		} & Options,
		$context: authContext,
		$Infer: {
			App: <O extends FaireAuthOptions>(_o: O) => app as unknown as InferApp<O>,
			Api: <A extends AnyHono>(_a: A) => api as unknown as InferAPI<A>,
		} as {
			Session: {
				session: Prettify<InferSession<Options>>;
				user: Prettify<InferUser<Options>>;
			};
			App: <O extends FaireAuthOptions>(_o: O) => InferApp<O>;
			Api: <A extends AnyHono>(_a: A) => InferAPI<A>;
		} & InferPluginTypes<Options>,
		$ERROR_CODES: {
			...authOptions.plugins?.reduce((acc, plugin) => {
				if (plugin.$ERROR_CODES) return { ...acc, ...plugin.$ERROR_CODES };
				return acc;
			}, {}),
			...BASE_ERROR_CODES,
		} as InferPluginErrorCodes<Options> & typeof BASE_ERROR_CODES,
	} satisfies Auth<Options>;
};

export interface Auth<Options extends FaireAuthOptions = FaireAuthOptions> {
	handler: (
		request: Request,
		Env?: any,
		executionCtx?: ExecutionContext,
	) => Promise<Response> | Response;
	app: ReturnType<typeof router>["app"];
	api: ReturnType<typeof router>["api"];
	options: {
		[x: string]: unknown;
		secret: string;
		baseURL: string;
		basePath: string;
	} & Options;
	$context: AuthContext<Options>;
	$Infer: {
		Session: unknown;
		App: unknown;
		Api: unknown;
	};
	$ERROR_CODES: typeof BASE_ERROR_CODES;
}
