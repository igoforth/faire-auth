import type { z } from "zod";
import type { SchemaRegistry } from "../factory/schema";
import {
	applyDTOTransform,
	successCodec,
	zodErrorSchema,
} from "../factory/schema";
import type { Definitions } from "../static/definitions";
import type { AuthRouteConfig } from "../types/hono";
import type { LiteralStringUnion } from "../types/helper";

interface SchemaWithDTO<
	K extends string,
	V extends z.core.$ZodBranded<z.ZodType, K>,
> {
	(): V;
	<O>(
		o: O,
	): O extends { dto: { [x in K]: (a: z.output<V>) => infer R } }
		? z.ZodSchema<R, z.input<V>>
		: V;
}

const withDTO =
	<K extends string, V extends z.core.$ZodBranded<z.ZodType, K>>(k: K, v: V) =>
	<O>(
		o: O,
	): O extends { dto: { [x in K]: (a: z.output<V>) => infer R } }
		? z.ZodSchema<R, z.input<V>>
		: V =>
		o != null &&
		typeof o === "object" &&
		"dto" in o &&
		o.dto != null &&
		typeof o.dto === "object" &&
		k in o.dto &&
		// @ts-expect-error k not in o.dto
		o.dto[k] != null &&
		typeof o.dto[k] === "function"
			? (v.transform(o.dto![k] as (...args: any[]) => any) as any)
			: (v as any);

// const i = withDTO('user', SCHEMAS[Definitions.USER].default)({})

export const toSuccess = <T>(dat: T) =>
	successCodec.encode(dat) as { success: true; data: T };
// const unwrap = <T>(dat: { success: true; data: T }) =>
//   successCodec.decode(dat) as T

export const zodError = <T>() =>
	zodErrorSchema as unknown as z.ZodType<
		{ success: false } & z.core.$ZodErrorTree<T>
	>;

/**
 * Extract the Zod schema that should be used to validate the body
 * for the given status code and content-type header.
 */
export const findSchema = <T = any>(
	config: AuthRouteConfig,
	status: string | number = "default",
	contentType: string | null = "application/json",
): z.ZodType<T> | undefined =>
	// @ts-expect-error Property 'content' does not exist on type 'ReferenceObject'. (ts 2339)
	config.responses?.[status]?.content?.[contentType]?.schema;

export type BuiltSchemas = Record<
	LiteralStringUnion<Definitions>,
	z.ZodType | z.ZodPipe<z.ZodType, z.ZodTransform>
>;

// Build schemas in dependency order with runtime options
export const buildSchemas = (
	schemas: SchemaRegistry,
	options: {
		dto?: Record<string, ((...args: any[]) => any) | undefined> | undefined;
		plugins?: { schemas?: Record<string, z.ZodType> }[] | undefined;
	} = {},
): BuiltSchemas => {
	const builtSchemas = {} as BuiltSchemas;

	// add main schemas
	Object.keys(schemas).forEach((definition) => {
		if (schemas[definition])
			builtSchemas[definition] = schemas[definition].build(
				builtSchemas,
				options as any,
			);
	});

	// add plugin schemas
	options.plugins?.forEach((p) => {
		if (p.schemas)
			Object.entries(p.schemas).forEach(([k, v]) => {
				// TODO: for now shape is key, meaning no nested support
				// for plugin schemas
				builtSchemas[k] = applyDTOTransform(v, k, options as any);
			});
	});

	return builtSchemas;
};
