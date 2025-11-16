import type { TypedResponse } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { SimplifyDeepArray } from "hono/utils/types";
import type { ResponseOrInit, HeaderRecord, ExK } from "./helper";

export type InvalidCBORValue = ((...args: unknown[]) => unknown) | symbol;
type InvalidToNull<T> = T extends InvalidCBORValue ? null : T;
type IsInvalid<T> = T extends InvalidCBORValue ? true : false;

export type CBORPrimitive =
	| ArrayBuffer
	| bigint
	| boolean
	| Buffer
	| DataView
	| Date
	| Error
	| Map<number | string, CBORValue>
	| null
	| number
	| RegExp
	| Set<CBORValue>
	| string
	| Uint8Array
	| undefined;

export type CBORArray = CBORValue[] | readonly CBORValue[];

export type CBORObject = { [Key in string]: CBORValue };

export type CBORValue = CBORArray | CBORObject | CBORPrimitive;

export type CBORParsed<T> = T extends { toCBOR(): infer C }
	? (() => C) extends () => CBORPrimitive
		? C
		: (() => C) extends () => { toCBOR(): unknown }
			? {}
			: CBORParsed<C>
	: T extends CBORPrimitive
		? T
		: T extends InvalidCBORValue
			? never
			: T extends ReadonlyArray<unknown>
				? { [K in keyof T]: CBORParsed<InvalidToNull<T[K]>> }
				: // : T extends Map<unknown, unknown> | Set<unknown> ? {}
					T extends object
					? {
							[K in keyof ExK<T, symbol> as IsInvalid<T[K]> extends true
								? never
								: K]: boolean extends IsInvalid<T[K]>
								? CBORParsed<T[K]> | undefined
								: CBORParsed<T[K]>;
						}
					: never;

/**
 * @template T - The type of the CBOR value or simplified unknown type.
 * @template U - The type of the status code.
 *
 * @returns {Response & TypedResponse<SimplifyDeepArray<T> extends JSONValue ? (JSONValue extends SimplifyDeepArray<T> ? never : JSONParsed<T>) : never, U, 'json'>} - The response after rendering the JSON object, typed with the provided object and status code types.
 */
export type CBORRespondReturn<
	T extends CBORValue | InvalidCBORValue | SimplifyDeepArray<unknown>,
	U extends ContentfulStatusCode,
> = Response &
	TypedResponse<
		SimplifyDeepArray<T> extends CBORValue
			? CBORValue extends SimplifyDeepArray<T>
				? never
				: CBORParsed<T>
			: never,
		U,
		"cbor"
	>;

export type CBORArgs = [
	object: CBORValue | InvalidCBORValue | SimplifyDeepArray<unknown>,
	statusOrInit?: ContentfulStatusCode | ResponseOrInit<ContentfulStatusCode>,
	headers?: HeaderRecord,
];
export interface CBORRespond {
	<
		T extends CBORValue | InvalidCBORValue | SimplifyDeepArray<unknown>,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		object: T,
		status?: U,
		headers?: HeaderRecord,
	): CBORRespondReturn<T, U>;
	<
		T extends CBORValue | InvalidCBORValue | SimplifyDeepArray<unknown>,
		U extends ContentfulStatusCode = ContentfulStatusCode,
	>(
		object: T,
		init?: ResponseOrInit<U>,
	): CBORRespondReturn<T, U>;
}
