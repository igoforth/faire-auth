import type {
	AuthRouteConfig,
	JSONRenderRespond,
	// LiteralStringUnion,
} from "@faire-auth/core/types";
import type { AuthContext } from "faire-auth";

declare module "hono" {
	export interface ContextRenderer extends JSONRenderRespond {}
	export interface ContextVariableMap {
		/**
		 * Gets set early before hitting route handler
		 */
		// path: LiteralStringUnion<Configs["path"]>;
		/**
		 * Gets set at route handler for intraroute consistency
		 */
		config?: AuthRouteConfig;
		/**
		 * Gets set by initContext middleware
		 */
		context: AuthContext;
		/**
		 * Gets set in endpoint Route Apps
		 */
		isServer?: true;
		/**
		 * Gets set by initContext middleware
		 */
		// api: DefaultAPI;
	}
}
