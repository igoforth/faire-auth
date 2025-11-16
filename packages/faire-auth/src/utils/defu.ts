type Input = Record<number | string | symbol, any>;
type IgnoredInput =
	| any[]
	| boolean
	| null
	| number
	| Record<never, any>
	| undefined;

type Merger = <T extends Input, K extends keyof T>(
	object: T,
	key: keyof T,
	value: T[K],
	namespace: string,
) => any;

type nullish = null | undefined | void;

type MergeObjects<
	Destination extends Input,
	Defaults extends Input,
> = Destination extends Defaults
	? Destination
	: {
			-readonly [Key in keyof Defaults &
				keyof Destination]: Destination[Key] extends nullish
				? Defaults[Key] extends nullish
					? nullish
					: Defaults[Key]
				: Defaults[Key] extends nullish
					? Destination[Key]
					: Merge<Destination[Key], Defaults[Key]>;
		} & Omit<Defaults, keyof Defaults & keyof Destination> &
			Omit<Destination, keyof Defaults & keyof Destination>;

type Defu<S extends Input, D extends (IgnoredInput | Input)[]> = D extends [
	infer F,
	...infer Rest,
]
	? F extends Input
		? Rest extends (IgnoredInput | Input)[]
			? Defu<MergeObjects<S, F>, Rest>
			: MergeObjects<S, F>
		: F extends IgnoredInput
			? Rest extends (IgnoredInput | Input)[]
				? Defu<S, Rest>
				: S
			: S
	: S;

type DefuFunction = <
	Source extends Input,
	Defaults extends (IgnoredInput | Input)[],
>(
	source: Source,
	...defaults: Defaults
) => Defu<Source, Defaults>;

interface DefuInstance {
	<Source extends Input, Defaults extends (IgnoredInput | Input)[]>(
		source: IgnoredInput | Source,
		...defaults: Defaults
	): Defu<Source, Defaults>;
	fn: DefuFunction;
	arrayFn: DefuFunction;
	extend(merger?: Merger): DefuFunction;
}

type MergeArrays<Destination, Source> =
	Destination extends (infer DestinationType)[]
		? Source extends (infer SourceType)[]
			? (DestinationType | SourceType)[]
			: DestinationType[] | Source
		: Destination | Source;

type Merge<
	Destination extends Input,
	Defaults extends Input,
> = Destination extends nullish // Remove explicitly null types
	? Defaults extends nullish
		? nullish
		: Defaults
	: Defaults extends nullish
		? Destination
		: // Handle arrays
			Destination extends any[]
			? Defaults extends any[]
				? MergeArrays<Destination, Defaults>
				: Defaults | Destination
			: // Don't attempt to merge Functions, RegExps, Promises
				Destination extends Function
				? Defaults | Destination
				: Destination extends RegExp
					? Defaults | Destination
					: Destination extends Promise<any>
						? Defaults | Destination
						: // Don't attempt to merge Functions, RegExps, Promises
							Defaults extends Function
							? Defaults | Destination
							: Defaults extends RegExp
								? Defaults | Destination
								: Defaults extends Promise<any>
									? Defaults | Destination
									: // Ensure we only merge Records
										Destination extends Input
										? Defaults extends Input
											? MergeObjects<Destination, Defaults>
											: Defaults | Destination
										: Defaults | Destination;

// Forked from sindresorhus/is-plain-obj (MIT)
// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
const isPlainObject = (value: unknown): boolean => {
	if (value === null || typeof value !== "object") return false;

	const prototype = Object.getPrototypeOf(value);

	if (
		prototype !== null &&
		prototype !== Object.prototype &&
		Object.getPrototypeOf(prototype) !== null
	)
		return false;

	if (Symbol.iterator in value) return false;
	if (Symbol.toStringTag in value)
		return Object.prototype.toString.call(value) === "[object Module]";

	return true;
};

// Base function to apply defaults
const _defu = <T>(
	baseObject: T,
	defaults: any,
	namespace = ".",
	merger?: Merger,
): T => {
	if (!isPlainObject(defaults)) return _defu(baseObject, {}, namespace, merger);

	// eslint-disable-next-line prefer-object-spread
	const object = Object.assign({}, defaults);

	for (const key in baseObject) {
		if (key === "__proto__" || key === "constructor") continue;

		const value = baseObject[key];
		if (value === null || value === undefined) continue;

		if (merger?.(object, key, value, namespace) != null) continue;

		if (Array.isArray(value) && Array.isArray(object[key]))
			object[key] = [...value, ...object[key]];
		else if (isPlainObject(value) && isPlainObject(object[key]))
			object[key] = _defu(
				value,
				object[key],
				(namespace ? `${namespace}.` : "") + key.toString(),
				merger,
			);
		else object[key] = value;
	}

	return object;
};

// Create defu wrapper with optional merger and multi arg support
const createDefu =
	(merger?: Merger): DefuFunction =>
	(...arguments_: any[]) =>
		arguments_.reduce<any>((p, c) => _defu(p, c, "", merger), {});

// Standard version
export const defu = createDefu() as DefuInstance;
export type { Defu };
