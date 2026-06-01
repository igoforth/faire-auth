import type { TypedResponse } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { InvalidJSONValue, JSONValue } from "hono/utils/types";
import type {
	HeaderRecord,
	ResponseHeadersInit,
	ResponseOrInit,
} from "./helper";

/**
 * The render/respond return type.
 *
 * V5: body is erased to `any` instead of the previous `JSONParsed<T>`.
 * Rationale: keeping a structurally-typed body (`T`, `JSONParsed<T>`,
 * `unknown`) forces TypeScript to run `structuredTypeRelatedTo` between
 * every `ctx.render(body, status)` call site and the route's declared
 * response schema, AND that cost is then re-paid during declaration-emit
 * when consumers re-export a merged plugin-aware `Api`/`App` type under
 * `declaration: true`. On modest plugin sets this OOMs `tsc` at 4GB
 * (trace-confirmed). `any` is bidirectionally compatible with
 * `TypedResponse<routeBody, U, "json">` so the structural shape that
 * `RouteHook<C>` (via `RouteConfigToTypedResponse<R>`) expects remains
 * satisfied — hooks returning `ctx.render(...)` still compile — without
 * paying the schema-relation cost. The `_T` parameter is preserved
 * positionally to keep call-site signature shape stable (existing callers
 * passing `JSONRespondReturn<T, U>` still typecheck).
 */
export type JSONRespondReturn<
	_T extends JSONValue | {} | InvalidJSONValue,
	U extends ContentfulStatusCode,
> = Response & TypedResponse<any, U, "json">;
export interface JSONRespond {
	(
		object: unknown,
		status?: ContentfulStatusCode,
		headers?: HeaderRecord,
	): JSONRespondReturn<{}, ContentfulStatusCode>;
	(
		object: unknown,
		init?: ResponseOrInit<ContentfulStatusCode>,
	): JSONRespondReturn<{}, ContentfulStatusCode>;
}
export interface JSONRenderRespond {
	(
		object: unknown,
		status?: ContentfulStatusCode,
		headers?: ResponseHeadersInit,
	):
		| Promise<JSONRespondReturn<{}, ContentfulStatusCode>>
		| JSONRespondReturn<{}, ContentfulStatusCode>;
}
