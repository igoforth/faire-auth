import type { Writable } from "type-fest";
import type { AuthRouteConfig, DecorativeKeys } from "../types/hono";
import type { ExK } from "../types";

type RoutingPath<P extends string> =
	P extends `${infer Head}/{${infer Param}}${infer Tail}`
		? `${Head}/:${Param}${RoutingPath<Tail>}`
		: P;

const routeCache = new WeakMap<
	AuthRouteConfig,
	ReturnType<typeof createRoute>
>();

/**
 * Creates a route configuration object with a method to get the routing path.
 */
export function createRoute<const R extends AuthRouteConfig>(
	routeConfig: R,
): Writable<
	ExK<
		R & {
			getRoutingPath(): RoutingPath<R["path"]>;
		},
		DecorativeKeys
	>
> {
	if (routeCache.has(routeConfig)) return routeCache.get(routeConfig)!;
	const frozen = Object.freeze({
		...routeConfig,
		getRoutingPath: (): RoutingPath<R["path"]> =>
			routeConfig.path.replaceAll(/\/{(.+?)}/g, "/:$1") as RoutingPath<
				R["path"]
			>,
	});
	routeCache.set(routeConfig, frozen);
	return frozen as any;
}
