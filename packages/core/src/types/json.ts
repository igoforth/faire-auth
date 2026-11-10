import type { TypedResponse } from "hono/types";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { InvalidJSONValue, JSONParsed, JSONValue } from "hono/utils/types";
import type {
	HeaderRecord,
	ResponseHeadersInit,
	ResponseOrInit,
} from "./helper";

export type JSONRespondReturn<
	T extends JSONValue | {} | InvalidJSONValue,
	U extends ContentfulStatusCode,
> = Response & TypedResponse<JSONParsed<T>, U, "json">;
export interface JSONRespond {
	<
		T extends JSONValue | {} | InvalidJSONValue,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		object: T,
		status?: U,
		headers?: HeaderRecord,
	): JSONRespondReturn<T, U>;
	<
		T extends JSONValue | {} | InvalidJSONValue,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		object: T,
		init?: ResponseOrInit<U>,
	): JSONRespondReturn<T, U>;
}
export interface JSONRenderRespond {
	<
		T extends JSONValue | {} | InvalidJSONValue,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		object: T,
		status?: U,
		headers?: ResponseHeadersInit,
	): Promise<JSONRespondReturn<T, U>> | JSONRespondReturn<T, U>;
}
