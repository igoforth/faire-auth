import type { ZodSchema } from "zod";
import type { ExK } from "./helper";

type LiteralString = "" | (string & Record<never, never>);

export type FieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "json"
	| `${"string" | "number"}[]`
	| Array<LiteralString>;

/**
 * Type representing primitive values that can be stored in fields.
 */
type Primitive =
	| string
	| number
	| boolean
	| Date
	| null
	| undefined
	| string[]
	| number[];

/**
 * Configuration options for a field attribute.
 */
export type FieldAttributeConfig<T extends FieldType = FieldType> = {
	/**
	 * If the field should be required on a new record.
	 * @default true
	 */
	required?: boolean;
	/**
	 * If the value should be returned on a response body.
	 * @default true
	 */
	returned?: boolean;
	/**
	 * If a value should be provided when creating a new record.
	 * @default true
	 */
	input?: boolean;
	/**
	 * Default value for the field
	 *
	 * Note: This will not create a default value on the database level. It will only
	 * be used when creating a new record.
	 */
	defaultValue?: Primitive | (() => Primitive);
	/**
	 * Update value for the field
	 *
	 * Note: This will create an onUpdate trigger on the database level for supported adapters.
	 * It will be called when updating a record.
	 */
	onUpdate?: () => Primitive;
	/**
	 * transform the value before storing it.
	 */
	transform?: {
		input?: (value: Primitive) => Primitive | Promise<Primitive>;
		output?: (value: Primitive) => Primitive | Promise<Primitive>;
	};
	/**
	 * Reference to another model.
	 */
	references?: {
		/**
		 * The model to reference.
		 */
		model: string;
		/**
		 * The field on the referenced model.
		 */
		field: string;
		/**
		 * The action to perform when the reference is deleted.
		 * @default "cascade"
		 */
		onDelete?:
			| "no action"
			| "restrict"
			| "cascade"
			| "set null"
			| "set default";
	};
	unique?: boolean;
	/**
	 * If the field should be a bigint on the database instead of integer.
	 */
	bigint?: boolean;
	/**
	 * A zod schema to validate the value.
	 */
	validator?: { input?: ZodSchema; output?: ZodSchema };
	/**
	 * The name of the field on the database.
	 */
	fieldName?: string | undefined;
	/**
	 * If the field should be sortable.
	 *
	 * applicable only for `text` type.
	 * It's useful to mark fields varchar instead of text.
	 */
	sortable?: boolean;
};

/**
 * Represents a field attribute combining type and configuration.
 */
export type FieldAttribute<T extends FieldType = FieldType> = {
	type: T;
} & FieldAttributeConfig<T>;

/**
 * Creates a field attribute with the specified type and configuration.
 */
export const createFieldAttribute = <
	T extends FieldType,
	C extends ExK<FieldAttributeConfig<T>, "type">,
>(
	type: T,
	config?: C,
) => {
	return { type, ...config } satisfies FieldAttribute<T>;
};

/**
 * Infers the TypeScript type from a FieldType.
 */
export type InferValueType<T extends FieldType> = T extends "string"
	? string
	: T extends "number"
		? number
		: T extends "boolean"
			? boolean
			: T extends "date"
				? Date
				: T extends `${infer T}[]`
					? T extends "string"
						? string[]
						: number[]
					: T extends Array<any>
						? T[number]
						: never;

/**
 * Infers the output type for a record of fields.
 */
export type InferFieldsOutput<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends false
				? Field[key]["defaultValue"] extends boolean | string | number | Date
					? key
					: never
				: key]: InferFieldOutput<Field[key]>;
		} & {
			[key in Key as Field[key]["returned"] extends false
				? never
				: key]?: InferFieldOutput<Field[key]> | null;
		}
	: {};

/**
 * Infers the input type for a record of fields.
 */
export type InferFieldsInput<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends false
				? never
				: Field[key]["defaultValue"] extends string | number | boolean | Date
					? never
					: Field[key]["input"] extends false
						? never
						: key]: InferFieldInput<Field[key]>;
		} & {
			[key in Key as Field[key]["input"] extends false ? never : key]?:
				| InferFieldInput<Field[key]>
				| undefined
				| null;
		}
	: {};

/**
 * For client will add "?" on optional fields
 */
export type InferFieldsInputClient<Field> = Field extends Record<
	infer Key,
	FieldAttribute
>
	? {
			[key in Key as Field[key]["required"] extends false
				? never
				: Field[key]["defaultValue"] extends string | number | boolean | Date
					? never
					: Field[key]["input"] extends false
						? never
						: key]: InferFieldInput<Field[key]>;
		} & {
			[key in Key as Field[key]["input"] extends false
				? never
				: Field[key]["required"] extends false
					? key
					: Field[key]["defaultValue"] extends string | number | boolean | Date
						? key
						: never]?: InferFieldInput<Field[key]> | undefined | null;
		}
	: {};

type InferFieldOutput<T extends FieldAttribute> = T["returned"] extends false
	? never
	: T["required"] extends false
		? InferValueType<T["type"]> | undefined | null
		: InferValueType<T["type"]>;

/**
 * Converts a Record<string, FieldAttribute> to an object type
 * with keys and value types inferred from FieldAttribute["type"].
 */
export type FieldAttributeToObject<
	Fields extends Record<string, FieldAttribute>,
> = AddOptionalFields<
	{ [K in keyof Fields]: InferValueType<Fields[K]["type"]> },
	Fields
>;

type AddOptionalFields<
	T extends Record<string, any>,
	Fields extends Record<keyof T, FieldAttribute>,
> = {
	// Required fields: required === true
	[K in keyof T as Fields[K] extends { required: true } ? K : never]: T[K];
} & {
	// Optional fields: required !== true
	[K in keyof T as Fields[K] extends { required: true } ? never : K]?: T[K];
};

/**
 * Infer the additional fields from the plugin options.
 * For example, you can infer the additional fields of the org plugin's organization schema like this:
 * ```ts
 * type AdditionalFields = InferAdditionalFieldsFromPluginOptions<"organization", OrganizationOptions>
 * ```
 */
export type InferAdditionalFieldsFromPluginOptions<
	SchemaName extends string,
	Options extends {
		schema?: {
			[key in SchemaName]?: {
				additionalFields?: Record<string, FieldAttribute>;
			};
		};
	},
	isClientSide extends boolean = true,
> = Options["schema"] extends {
	[key in SchemaName]?: {
		additionalFields: infer Field extends Record<string, FieldAttribute>;
	};
}
	? isClientSide extends true
		? FieldAttributeToObject<RemoveFieldsWithInputFalse<Field>>
		: FieldAttributeToObject<Field>
	: {};

/**
 * Like InferAdditionalFieldsFromPluginOptions, but returns the raw
 * FieldAttribute config record instead of the resolved value types.
 * Use this when passing to toZodSchema which expects field definitions.
 */
export type InferAdditionalFieldsConfig<
	SchemaName extends string,
	Options extends {
		schema?: {
			[key in SchemaName]?: {
				additionalFields?: Record<string, FieldAttribute>;
			};
		};
	},
	isClientSide extends boolean = true,
> = Options["schema"] extends {
	[key in SchemaName]?: {
		additionalFields: infer Field extends Record<string, FieldAttribute>;
	};
}
	? isClientSide extends true
		? RemoveFieldsWithInputFalse<Field>
		: Field
	: {};

type RemoveFieldsWithInputFalse<T extends Record<string, FieldAttribute>> = {
	[K in keyof T as T[K]["input"] extends false ? never : K]: T[K];
};

type InferFieldInput<T extends FieldAttribute> = InferValueType<T["type"]>;

/**
 * Field attribute type for plugins, omitting transform, defaultValue, and hashValue.
 */
export type PluginFieldAttribute = ExK<
	FieldAttribute,
	"transform" | "defaultValue" | "hashValue"
>;

/**
 * Infers fields from plugins based on the options and key.
 */
export type InferFieldsFromPlugins<
	Options extends { plugins?: any[] | undefined },
	Key extends string,
	Format extends "output" | "input" = "output",
> = Options["plugins"] extends (infer T)[]
	? T extends { schema: { [key in Key]: { fields: infer Field } } }
		? Format extends "output"
			? InferFieldsOutput<Field>
			: InferFieldsInput<Field>
		: {}
	: {};

/**
 * Infers fields from options based on the session or user additionalFields.
 */
export type InferFieldsFromOptions<
	Options extends { session?: any; user?: any },
	Key extends "session" | "user",
	Format extends "output" | "input" = "output",
> = Options[Key] extends { additionalFields: infer Field }
	? Format extends "output"
		? InferFieldsOutput<Field>
		: InferFieldsInput<Field>
	: {};

/**
 * Adds extra fields to a type based on brand, direction, and options.
 */
export type AddExtraFields<
	T,
	Brand extends string,
	Dir extends "input" | "output",
	O extends { session?: any; user?: any; plugins?: any[] | undefined },
> = T extends object
	? T &
			(Brand extends "session" | "user"
				? InferFieldsFromOptions<O, Brand, Dir>
				: {}) &
			InferFieldsFromPlugins<O, Brand, Dir>
	: T;
