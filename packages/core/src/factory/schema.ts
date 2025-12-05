import type { ZodOpenAPIMetadata } from "@asteasolutions/zod-to-openapi";
import {
	extendZodWithOpenApi,
	OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";
import * as z from "zod";
import { isPromise, True } from "../static/constants";
import { Definitions } from "../static/definitions";
import type { FaireAuthOptions } from "../types/options";
import type { LiteralStringUnion } from "../types/helper";
import { env } from "../env";

extendZodWithOpenApi(z);

/**
 * Configuration for Zod OpenAPI metadata.
 */
export type SchemaConfig = ZodOpenAPIMetadata;

/**
 * Global OpenAPI registry instance for registering schemas and paths.
 */
export const registry = new OpenAPIRegistry();

/**
 * Global Zod registry instance for registering schemas with IDs.
 */
export const zodRegistry: z.core.$ZodRegistry<SchemaConfig & { id: string }> =
	z.registry<SchemaConfig & { id: string }>();

const originalAdd = zodRegistry.add;
zodRegistry.add = (schema, meta) => {
	if (!meta.id) return originalAdd.call(zodRegistry, schema, meta);
	const existingSchema = zodRegistry._idmap.get(meta.id);
	if (existingSchema) {
		console.warn(
			`Existing schema ${meta.id} found in zod registry. Did a hot reload occur? Deleting`,
		);
		zodRegistry.remove(existingSchema);
		zodRegistry._idmap.delete(meta.id);
	}
	return originalAdd.call(zodRegistry, schema, meta);
};

/**
 * Schema for user name, optional string between 2 and 100 characters.
 */
export const nameSchema = z
	.string()
	.min(2)
	.max(100)
	.optional()
	.openapi({ description: "The name of the user" });

/**
 * Schema for password, a string.
 */
export const passwordSchema = z.string();

/**
 * Schema for email, normalized to lowercase.
 */
export const emailSchema = z.email().overwrite((v) => v.toLowerCase());

export const stringOrNumberIdSchema = z
	.string()
	.or(z.number())
	.transform((v) => v.toString());

/**
 * Schema for date or ISO string, transformed to Date object.
 */
export const dateOrIsoStringSchema = z
	.date()
	.or(z.iso.datetime())
	.transform((v) => new Date(v));

/**
 * Schema for scopes as string or array, transformed to array.
 */
export const scopesStringOrArraySchema = z
	.string()
	.min(1)
	.or(z.array(z.string().min(1)))
	.transform((v) => (Array.isArray(v) ? v : v.split(",")));

// TODO: copy of getBaseURLFromEnv() from packages/faire-auth/src/utils/url.ts
const getBaseURLFromEnv = () =>
	env["FAIRE_AUTH_URL"] ??
	env["NEXT_PUBLIC_FAIRE_AUTH_URL"] ??
	env["PUBLIC_FAIRE_AUTH_URL"] ??
	env["NUXT_PUBLIC_FAIRE_AUTH_URL"] ??
	env["NUXT_PUBLIC_AUTH_URL"] ??
	(env["BASE_URL"] !== "/" ? env["BASE_URL"] : undefined);

/**
 * Schema for callback URL, validating and transforming to relative path.
 * Mostly used in request/response schemas and maybe userSchema
 */
export const callbackURLSchema = <T extends boolean = false>(
	optional?: T,
): T extends true
	? z.ZodOptional<
			z.ZodPipe<
				z.ZodPipe<
					z.ZodTransform<string | undefined, string | undefined>,
					z.ZodOptional<z.ZodURL>
				>,
				z.ZodTransform<string | undefined, string | undefined>
			>
		>
	: z.ZodPipe<
			z.ZodPipe<z.ZodTransform<string, string>, z.ZodURL>,
			z.ZodTransform<string, string>
		> => {
	const x = z.string().transform((value, ctx) => {
		const defaultBaseURL = getBaseURLFromEnv();
		if (!defaultBaseURL)
			throw new Error(
				"callbackURLSchema() could not detect baseURL from environment",
			);
		// TODO: domain detection to see whether the origin is needed or not?
		// I don't like cross-origin but if we're going to go for feature-parity
		// it would be best to let the originCheck middleware do its work
		try {
			const url = new URL(decodeURIComponent(value), defaultBaseURL);
			// because relative path doesn't need initial '/'
			// but URL() adds one
			// bonus to not allow traversal
			if (value.endsWith(url.pathname) && !value.includes(url.origin))
				return url.href.slice(url.origin.length);
			return url.href;
		} catch (e) {
			ctx.addIssue({
				code: "custom",
				message: "Is not valid relative or full URL",
			});
			return z.NEVER;
		}
	});

	if (optional === true) return x.optional() as any;
	return x as any;
};

// .openapi({
//           description: 'URL to redirect to', // . Does not allow cross-origin
//         })

/**
 * Codec for success responses, encoding/decoding data with success flag.
 *
 * @todo in future can open this to options customization
 */
export const successCodec = z.codec(
	z.object({ success: z.literal(true), data: z.any() }),
	z.any(),
	{ decode: (res) => res.data, encode: (data) => ({ success: True, data }) },
);

/**
 * Schema for Zod errors.
 */
export const zodErrorSchema = registry.register(
	"zodError",
	z
		.object({
			success: z
				.literal(false)
				.openapi({ description: "Indicates failed operation" }),
			errors: z.array(z.any()),
			items: z
				.union([z.record(z.string(), z.any()), z.array(z.any())])
				.optional(),
			properties: z.record(z.string(), z.any()).optional(),
		})
		.register(zodRegistry, { id: "zodError" }),
);

export const createTokenUserSchema = <T extends z.ZodType>(user: T) =>
	z.discriminatedUnion("success", [
		z.object({
			success: z.literal(true),
			token: z
				.string()
				.nullable()
				.default(null)
				.openapi({ description: "Session token" }),
			user,
		}),
		z.object({
			success: z.literal(false),
			token: z.null().default(null),
			user: z.null().default(null),
		}),
	]);

export const redirectUrlSchema = z.discriminatedUnion("redirect", [
	z.object({ redirect: z.literal(false), url: z.null().default(null) }),
	z.object({ redirect: z.literal(true), url: z.url() }),
]);

interface InnerDescription {
	_inner?: string;
	[x: string]: string | InnerDescription;
}
/**
 * Description structure for DTO transformations.
 */
export interface DTODescription<T extends string> extends InnerDescription {
	_self: T;
}
/**
 * Entry for a schema in the registry, including dependencies and build function.
 */
export interface SchemaEntry<T extends z.ZodType = z.ZodType> {
	/** Dependencies that must be built before this schema */
	dependencies: Definitions[];
	/** Default/base schema before any transforms */
	default: T;
	/** Function to build the final schema with transforms applied */
	build: (
		schemas: Record<
			Definitions,
			z.ZodType | z.ZodPipe<z.ZodType, z.ZodTransform>
		>,
		options: FaireAuthOptions,
	) => T | z.ZodPipe<T, z.ZodTransform<object, z.core.output<T>>>;
}

/**
 * Registry mapping definition keys to schema entries.
 */
export type SchemaRegistry = Record<
	LiteralStringUnion<Definitions>,
	SchemaEntry
>;

type SchemaDefinition<T extends z.ZodType, B extends string> = {
	// schema: Omit<z.core.$ZodBranded<T, B>, 'transform'> & {
	//   transform: <NewOut>(
	//     transform: (
	//       arg: z.core.output<T>,
	//       ctx: z.core.$RefinementCtx<z.core.output<T>>,
	//     ) => NewOut | Promise<NewOut>,
	//   ) => z.core.$ZodBranded<
	//     z.ZodPipe<T, z.ZodTransform<Awaited<NewOut>, z.core.output<T>>>,
	//     B
	//   >
	// }
	schema: z.core.$ZodBranded<T, B>;
	build: (
		options: FaireAuthOptions,
		redefinition?: { schema: z.ZodType; shape?: DTODescription<string> },
	) => T;
};

/**
 * Factory function type for creating schema definitions with branding and DTO.
 */
export type SchemaFactory = <T extends z.ZodType, B extends string>(
	newSchema: T,
	brand: SchemaConfig & { id: B },
	dto?: DTODescription<B>,
) => SchemaDefinition<T, B>;

/**
 * Registers a schema with branding, metadata, and optional DTO description.
 */
export const registerSchema = <T extends z.ZodType, B extends string>(
	newSchema: T,
	brand: SchemaConfig & { id: B },
	dto?: DTODescription<B>,
): z.core.$ZodBranded<T, B> => {
	const schema = (newSchema as z.ZodType)
		.register(zodRegistry, brand)
		.brand(brand.id) as z.core.$ZodBranded<T, B>;
	const shape = dto ?? brand.id;
	schema._zod.bag["dto"] = shape;
	const oldTransform = schema.transform.bind(schema);
	// make bag sticky when adding transforms
	Object.defineProperty(schema, "transform", {
		value: (...args: Parameters<z.ZodType["transform"]>) => {
			const n = oldTransform(...args);
			n._zod.bag = schema._zod.bag;
			return n;
		},
		writable: false,
		configurable: true,
	});
	return schema;
};

/**
 * Applies DTO transformations to a schema based on the brand and options.
 */
export const applyDTOTransform = <T extends z.ZodType>(
	newSchema: T,
	newBrand: LiteralStringUnion<Definitions>,
	options: { dto?: Record<string, any> },
	redefinition?: { schema: z.ZodType; shape?: DTODescription<string> },
): T | z.ZodPipe<T, z.ZodTransform<object, z.core.output<T>>> => {
	let schema = newSchema;
	let shape = schema._zod.bag["dto"] as
		| string
		| DTODescription<string>
		| undefined;
	// TODO: Not really effective since default (usually created with registerSchema)
	// bag gets original brand or shape as value
	// this means resolveConfig() will never find any redefined brand/shape
	let brand = redefinition?.shape?._self ?? newBrand;
	if (shape == null) throw new Error(`shape for ${brand} is null`);
	options.dto ??= {};
	if (redefinition) {
		schema = redefinition.schema as any;
		if (redefinition.shape) shape = redefinition.shape;
	}

	const set = (def: string, fn: (...args: any[]) => any) =>
		(options.dto![def] = fn);

	const get = (def: string | undefined) =>
		def
			? (options.dto![def] as ((...args: any[]) => any) | undefined)
			: undefined;

	const walk = async (node: any, descr: any): Promise<any> => {
		if (node == null) return node;

		/* array branch */
		if (Array.isArray(node)) {
			const fn = get(descr._inner);
			return fn
				? await Promise.all(
						node.map(async (n) => {
							const res = fn(n);
							return isPromise(res) ? await res : res;
						}),
					)
				: node;
		}

		/* primitive branch */
		if (typeof node !== "object") return node;

		/* object branch */
		await Promise.all(
			Object.entries(descr).map(async ([k, v]) => {
				if (k === "_self" || k === "_inner") return;

				const res =
					typeof v === "string"
						? (get(v)?.(node[k]) ?? node[k]) // string rule
						: walk(node[k], v); // nested rule

				node[k] = isPromise(res) ? await res : res;
			}),
		);

		return node;
	};

	const fromDto = (dto: DTODescription<string>) =>
		get(dto._self) ?? ((obj: any) => walk(obj, dto));

	const dtoFunction = get(brand);
	if (dtoFunction) schema = schema.transform(dtoFunction) as any;
	// transform schemas with nested properties even if the top-level
	// isn't supplied in options
	else if (typeof shape === "string") {
		const dtoFunction = get(shape);
		if (dtoFunction) schema = schema.transform(dtoFunction) as any;
	} else {
		const dtoFunction = fromDto(shape);
		set(shape._self, dtoFunction);
		schema = schema.transform(dtoFunction) as any;
	}

	schema._zod.bag["dto"] = brand;
	// TODO: check that openapi spec generates correctly with this commented
	// result: it doesn't, meaning we call extendZodWithOpenAPI at top
	return registry.register(brand, schema);
};

/**
 * Creates a schema definition with registration and build function.
 *
 * @todo schemas registered with transform (e.g. toSuccess) don't
 * get emitted correctly in openapi spec
 */
export const createSchema: SchemaFactory = (newSchema, brand, dto) => {
	const schema = registerSchema(newSchema, brand, dto);
	return {
		schema,
		build: applyDTOTransform.bind(null, schema, brand.id) as any,
	};
};
