import { HTTPException } from "hono/http-exception";
import type {
	ClientErrorStatusCode,
	ContentfulStatusCode,
	ContentlessStatusCode,
	DeprecatedStatusCode,
	InfoStatusCode,
	RedirectStatusCode,
	ServerErrorStatusCode,
	StatusCode,
	SuccessStatusCode,
	UnofficialStatusCode,
} from "hono/utils/http-status";
import { False, True } from "../static/constants";
import { _statusCode } from "./codes";

const findRawStatusText = (
	code: ContentfulStatusCode,
): keyof typeof _statusCode =>
	Object.entries(_statusCode).find(
		([, v]) => v === code,
	)?.[0] as keyof typeof _statusCode;

/**
 * Checks if a value is a valid HTTP status code number.
 */
function isNumberStatusCode(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= -1 &&
		value <= 999
	);
}

/**
 * Type guard for `InfoStatusCode`
 */
export function isInfoStatusCode(code: unknown): code is InfoStatusCode {
	return isNumberStatusCode(code) && [100, 101, 102, 103].includes(code);
}

/**
 * Type guard for `SuccessStatusCode`
 */
export function isSuccessStatusCode(code: unknown): code is SuccessStatusCode {
	return (
		isNumberStatusCode(code) &&
		[200, 201, 202, 203, 204, 205, 206, 207, 208, 226].includes(code)
	);
}

/**
 * Type guard for `DeprecatedStatusCode`
 */
export function isDeprecatedStatusCode(
	code: unknown,
): code is DeprecatedStatusCode {
	return isNumberStatusCode(code) && [305, 306].includes(code);
}

/**
 * Type guard for `RedirectStatusCode`
 */
export function isRedirectStatusCode(
	code: unknown,
): code is RedirectStatusCode {
	return (
		isNumberStatusCode(code) &&
		[300, 301, 302, 303, 304, 305, 306, 307, 308].includes(code)
	);
}

/**
 * Type guard for `ClientErrorStatusCode`
 */
export function isClientErrorStatusCode(
	code: unknown,
): code is ClientErrorStatusCode {
	return (
		isNumberStatusCode(code) &&
		[
			400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414,
			415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431, 451,
		].includes(code)
	);
}

/**
 * Type guard for `ServerErrorStatusCode`
 */
export function isServerErrorStatusCode(
	code: unknown,
): code is ServerErrorStatusCode {
	return (
		isNumberStatusCode(code) &&
		[500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511].includes(code)
	);
}

/**
 * Type guard for `UnofficialStatusCode`
 */
export function isUnofficialStatusCode(
	code: unknown,
): code is UnofficialStatusCode {
	return code === -1;
}

/**
 * Type guard for `StatusCode`
 */
export function isStatusCode(code: unknown): code is StatusCode {
	return (
		isInfoStatusCode(code) ||
		isSuccessStatusCode(code) ||
		isRedirectStatusCode(code) ||
		isClientErrorStatusCode(code) ||
		isServerErrorStatusCode(code) ||
		isUnofficialStatusCode(code)
	);
}

/**
 * Type guard for `ContentlessStatusCode`
 */
export function isContentlessStatusCode(
	code: unknown,
): code is ContentlessStatusCode {
	return isNumberStatusCode(code) && [101, 204, 205, 304].includes(code);
}

/**
 * Type guard for `ContentfulStatusCode`
 */
export function isContentfulStatusCode(
	code: unknown,
): code is ContentfulStatusCode {
	return isStatusCode(code) && !isContentlessStatusCode(code);
}

/**
 * Custom error class for API errors, extending HTTPException.
 */
export class APIError extends HTTPException {
	public readonly statusText: keyof typeof _statusCode;
	public readonly body:
		| ({ message?: string; code?: string } & Record<string, any>)
		| null;
	public readonly headers: HeadersInit;

	public constructor(
		...args:
			| [
					statusOrText?: keyof typeof _statusCode | ContentfulStatusCode,
					body?:
						| ({ message?: string; code?: string } & Record<string, any>)
						| null,
					headers?: HeadersInit,
			  ]
			| [res?: Response]
	) {
		const {
			status,
			statusText,
		}: { status: ContentfulStatusCode; statusText: keyof typeof _statusCode } =
			args[0] == null
				? { status: 500 as const, statusText: "INTERNAL_SERVER_ERROR" }
				: args[0] instanceof Response
					? {
							status: args[0].status as ContentfulStatusCode,
							statusText: args[0].statusText as keyof typeof _statusCode,
						}
					: typeof args[0] === "string"
						? {
								status: _statusCode[args[0]],
								statusText: args[0] as keyof typeof _statusCode,
							}
						: { status: args[0], statusText: findRawStatusText(args[0])! };
		const body =
			args[0] instanceof Response
				? null
				: {
						success: status > 200 && status < 400 ? True : False,
						...(args[1]?.message != null
							? {
									code: args[1].message
										.toUpperCase()
										.replaceAll(" ", "_")
										.replaceAll(/[^A-Z0-9_]/g, ""),
								}
							: {}),
						...args[1],
					};
		const headers = { "Content-Type": "application/json", ...args[2] };
		const res =
			args[0] instanceof Response
				? args[0]
				: new Response(JSON.stringify(body), { headers, status, statusText });
		super(status, { res, ...(body?.message && { message: body.message }) });
		this.name = "APIError";
		this.headers = headers;
		this.statusText = statusText;
		this.body = body;
		this.stack = "";
	}
}

/**
 * Base error class for Faire Auth errors.
 */
export class FaireAuthError extends Error {
	public constructor(message: string, cause?: string) {
		super(message);
		this.name = "FaireAuthError";
		this.message = message;
		this.cause = cause;
		this.stack = "";
	}
}

/**
 * Error class for missing dependencies.
 */
export class MissingDependencyError extends FaireAuthError {
	public constructor(pkgName: string) {
		super(
			`The package "${pkgName}" is required. Make sure it is installed.`,
			pkgName,
		);
	}
}

/**
 * Error class for features that are not yet implemented.
 */
export class NotImplementedError extends FaireAuthError {
	public constructor(feature?: string) {
		super(
			feature
				? `The feature "${feature}" is not yet implemented.`
				: "This feature is not yet implemented.",
		);
		this.name = "NotImplementedError";
	}
}

/**
 * Error class for tests that fail.
 */
export class TestError extends FaireAuthError {
	public constructor(message: string, context?: any, cause?: any) {
		super(
			`Test Error\nMessage: ${message}${context ? `\n${JSON.stringify(context, undefined, 2)}` : ""}`,
			cause,
		);
		this.name = "TestError";
	}
}

export * from "./codes";
