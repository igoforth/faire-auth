import type { z } from "zod";
import type { Awaitable } from "./helper";
import type { AddExtraFields } from "./field";
import type { MiddlewareHandler } from "hono";

type _Counter<
	N extends number,
	T extends unknown[] = [],
> = T["length"] extends N ? T : _Counter<N, [...T, 0]>;

type _Reached<
	Current extends unknown[],
	Limit extends unknown[],
> = Current["length"] extends Limit["length"] ? true : false;

type NoU<T> = T extends undefined ? never : T;

// depth-aware core
type StripBrand2CoreD<
	T,
	Brand extends string,
	Dir extends "input" | "output",
	O extends { session?: any; user?: any; plugins?: any[] | undefined },
	Depth extends unknown[],
	MaxDepth extends unknown[],
> = _Reached<Depth, MaxDepth> extends true
	? T // hard stop
	: "output" extends Dir
		? O extends { dto: { [K in Brand]: infer R } }
			? R extends (...args: any[]) => Awaitable<infer FnReturn>
				? StripBrand2BaseD<FnReturn, Dir, O, [...Depth, 0], MaxDepth>
				: StripBrand2BaseD<T, Dir, O, [...Depth, 0], MaxDepth>
			: StripBrand2BaseD<
					AddExtraFields<T, Brand, Dir, O>,
					Dir,
					O,
					[...Depth, 0],
					MaxDepth
				>
		: AddExtraFields<T, Brand, Dir, O>;

// depth-aware base
type StripBrand2BaseD<
	T,
	Dir extends "input" | "output" = "output",
	O extends { session?: any; user?: any; plugins?: any[] | undefined } = {},
	Depth extends unknown[] = [],
	MaxDepth extends unknown[] = _Counter<3>,
> = _Reached<Depth, MaxDepth> extends true
	? T
	: Date extends T
		? T
		: T extends { [z.$brand]: { [k in infer Brand]: true } }
			? Brand extends string
				? StripBrand2CoreD<
						{
							[BaseKey in keyof T as BaseKey extends keyof z.$brand
								? never
								: BaseKey]: T[BaseKey];
						},
						Brand,
						Dir,
						O,
						[...Depth, 0],
						MaxDepth
					>
				: StripBrand2BaseD<
						{
							[BaseKey in keyof T as BaseKey extends keyof z.$brand
								? never
								: BaseKey]: T[BaseKey];
						},
						Dir,
						O,
						[...Depth, 0],
						MaxDepth
					>
			: T extends (infer Base)[]
				? StripBrand2BaseD<Base, Dir, O, [...Depth, 0], MaxDepth>[]
				: T extends object
					? {
							[BaseKey in keyof T as BaseKey extends keyof z.$brand
								? never
								: BaseKey]: StripBrand2BaseD<
								T[BaseKey],
								Dir,
								O,
								[...Depth, 0],
								MaxDepth
							>;
						}
					: T;

// public depth-aware wrapper
type StripBrand2D<
	T extends z.core.$ZodType,
	Dir extends "input" | "output" = "output",
	O extends { session?: any; user?: any; plugins?: any[] | undefined } = {},
	MaxDepth extends number = 6,
> = z.ZodType<
	StripBrand2BaseD<z.output<T>, Dir, O, [], _Counter<MaxDepth>>,
	z.input<T>
>;

type _ProcessRequest<
	R,
	O extends { session?: any; user?: any; plugins?: any[] | undefined },
> = {
	[Part in keyof R]: Part extends "body"
		? {
				[Entry in keyof R[Part]]: Entry extends "content"
					? {
							[CT in keyof R[Part][Entry] as CT extends "application/json"
								? O extends { hono: { advanced: { cbor: true } } }
									? "application/cbor"
									: CT
								: CT]: CT extends "application/json"
								? {
										[ET in keyof R[Part][Entry][CT]]: ET extends "schema"
											? R[Part][Entry][CT][ET] extends z.ZodType
												? StripBrand2D<R[Part][Entry][CT][ET], "input", O>
												: NoU<R[Part][Entry][CT][ET]>
											: NoU<R[Part][Entry][CT][ET]>;
									}
								: NoU<R[Part][Entry][CT]>;
						}
					: NoU<R[Part][Entry]>;
			}
		: NoU<R[Part]>;
};

type _ProcessResponses<
	R,
	O extends { session?: any; user?: any; plugins?: any[] | undefined },
> = {
	[Status in keyof R]: {
		[Entry in keyof R[Status]]: Entry extends "content"
			? {
					[CT in keyof R[Status][Entry] as CT extends "application/json"
						? O extends { hono: { advanced: { cbor: true } } }
							? "application/cbor"
							: CT
						: CT]: {
						[ET in keyof R[Status][Entry][CT]]: ET extends "schema"
							? R[Status][Entry][CT][ET] extends z.ZodType
								? StripBrand2D<R[Status][Entry][CT][ET], "output", O>
								: NoU<R[Status][Entry][CT][ET]>
							: NoU<R[Status][Entry][CT][ET]>;
					};
				}
			: NoU<R[Status][Entry]>;
	} & { description: string };
};

type _ProcessMiddleware<
	R extends { middleware?: any; operationId: any },
	O,
> = O extends { middleware: { [K in R["operationId"]]: infer T } }
	? T extends MiddlewareHandler
		? [NoU<R["middleware"]>, T] extends [any[], any]
			? [...NoU<R["middleware"]>, T]
			: [NoU<R["middleware"]>, T]
		: NoU<R["middleware"]>
	: NoU<R["middleware"]>;

export type ProcessRouteConfig<
	R,
	O extends { session?: any; user?: any; plugins?: any[] | undefined } = {},
> = R extends {
	operationId: any;
	middleware?: any;
	request?: any;
	responses?: any;
}
	? {
			[K in keyof R]: K extends "middleware"
				? _ProcessMiddleware<R, O>
				: K extends "request"
					? _ProcessRequest<R["request"], O>
					: K extends "responses"
						? _ProcessResponses<R["responses"], O>
						: NoU<R[K]>;
		}
	: never;
