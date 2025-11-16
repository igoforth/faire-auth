import type { ValidationTargets, Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { BodyData } from "hono/utils/body";
import { bufferToFormData } from "hono/utils/buffer";
import type { ExecRet, AuthRouteConfig } from "../types/hono";
import { decode, encode } from "./cbor";
import { findSchema } from "./schema";
import { isRedirectStatusCode } from "../error";

const hasProperty = <T extends keyof ValidationTargets>(
	input: unknown,
	property: T,
): input is { [K in T]: NonNullable<ValidationTargets[K]> } =>
	input != null &&
	typeof input === "object" &&
	property in input &&
	// @ts-expect-error Type 'T' cannot be used to index type 'object'. (ts 2536)
	input[property] != null;

export type Builder = (
	input: unknown,
	overwriteHeaders?: HeadersInit,
) => [url: string, init: RequestInit];

export const buildRequest =
	<C extends AuthRouteConfig>(config: C, baseURL: string): Builder =>
	(input, overwriteHeaders) => {
		/* --- assemble headers --- */
		const headers: Record<string, string> = {};
		if (hasProperty(input, "header")) Object.assign(headers, input.header);

		/* --- build the final URL --- */
		let url = config.path;
		if (hasProperty(input, "param")) {
			for (const [k, v] of Object.entries(input.param))
				url = url.replace(
					`:${k}`,
					encodeURIComponent(String(v)),
				) as `/${string}`;
		}
		if (hasProperty(input, "query")) {
			const q = new URLSearchParams();
			Object.entries(input.query).forEach(([k, v]) => {
				if (v !== undefined) q.set(k, String(v));
			});
			const qs = q.toString();
			if (q.size > 0) url += `?${qs}`;
		}

		/* --- decide body & content-type --- */
		// let body: string | Uint8Array | undefined;
		let body: any;
		let contentType: string | undefined;

		if (hasProperty(input, "json")) {
			body = JSON.stringify(input.json);
			contentType = "application/json";
		} else if (hasProperty(input, "cbor" as any)) {
			body = encode(input.cbor) as any;
			contentType = "application/cbor";
		} else if (hasProperty(input, "form")) {
			const f = new URLSearchParams();
			Object.entries(input.form).forEach(([k, v]) => {
				if (v !== undefined) f.set(k, String(v));
			});
			body = f.toString();
			contentType = "application/x-www-form-urlencoded";
		}

		if (contentType != null) headers["content-type"] = contentType;

		/* --- cookies --- */
		if (hasProperty(input, "cookie")) {
			headers["cookie"] = Object.entries(input.cookie)
				.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
				.join("; ");
		}

		const finalOverwrite =
			overwriteHeaders instanceof Headers
				? Object.fromEntries(overwriteHeaders.entries())
				: Array.isArray(overwriteHeaders)
					? Object.fromEntries(overwriteHeaders)
					: (overwriteHeaders ?? {});

		// logger.debug('buildRequest', {
		//   input,
		//   url: `${getBaseURL(baseURL, basePath)}${url}`,
		//   body,
		//   headers: { ...headers, ...finalOverwrite },
		// })

		return [
			`${baseURL}${url}`,
			{
				method: config.method,
				headers: { ...headers, ...finalOverwrite },
				...(body != null && { body }),
			},
		];
	};

export type Parser<C extends AuthRouteConfig> = (
	response: Response,
) => Promise<ExecRet<C>>;

export async function decodeContent<T = any>(
	dat: Request | Response,
): Promise<T>;

//look for a specific content-type and return null if it’s absent
export async function decodeContent<T = any>(
	dat: Request | Response,
	expectedType: "json" | "form" | "text" | "xml" | "cbor",
): Promise<T | null>;

export async function decodeContent<T = any>(
	dat: Request | Response,
	expectedType?: "json" | "form" | "text" | "xml" | "cbor",
): Promise<T | null> {
	// return redirects as is
	if (dat instanceof Response && isRedirectStatusCode(dat.status))
		return dat as T;

	const contentType = dat.headers.get("Content-Type") ?? "";

	const jsonRegex =
		/^application\/([a-z-\.]+\+)?json(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/;
	const multipartRegex =
		/^multipart\/form-data(;\s?boundary=[a-zA-Z0-9'"()+_,\-./:=?]+)?$/;
	const urlencodedRegex =
		/^application\/x-www-form-urlencoded(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/;

	if (expectedType) {
		switch (expectedType) {
			case "json":
				if (!jsonRegex.test(contentType)) return null;
				break;
			case "form":
				if (
					!urlencodedRegex.test(contentType) &&
					!multipartRegex.test(contentType)
				)
					return null;
				break;
			case "text":
				if (!contentType.includes("text/")) return null;
				break;
			case "xml":
				if (!contentType.includes("application/xml")) return null;
				break;
			case "cbor":
				if (!contentType.includes("application/cbor")) return null;
				break;
			default:
				return null; // header | param | query | cookie  → not body decoders
		}
	}

	/* ---------- actual parsing ---------- */
	if (contentType.includes("application/json") || jsonRegex.test(contentType)) {
		try {
			return await dat.json();
		} catch {
			const message = "Malformed JSON in request body";
			throw new HTTPException(400, { message });
		}
	}
	if (multipartRegex.test(contentType) || urlencodedRegex.test(contentType)) {
		let formData: FormData;

		try {
			const arrayBuffer = await dat.arrayBuffer();
			formData = await bufferToFormData(arrayBuffer, contentType);
		} catch (e) {
			let message = "Malformed FormData request.";
			message += e instanceof Error ? ` ${e.message}` : ` ${String(e)}`;
			throw new HTTPException(400, { message });
		}

		const form: BodyData<{ all: true }> = {};
		formData.forEach((value, key) => {
			if (key.endsWith("[]")) ((form[key] ??= []) as unknown[]).push(value);
			else if (Array.isArray(form[key])) (form[key] as unknown[]).push(value);
			else if (key in form) form[key] = [form[key] as string | File, value];
			else form[key] = value;
		});

		return formData as T;
	}
	if (contentType.includes("text/")) return (await dat.text()) as any;
	if (contentType.includes("application/xml")) return (await dat.text()) as any;
	if (contentType === "application/cbor")
		return decode(new Uint8Array(await dat.arrayBuffer())) as T;

	throw new Error("Unknown content type");
}

export const parseResponse =
	<C extends AuthRouteConfig>(
		config: C,
		logger: { warn: (...args: any[]) => any } = console,
	): Parser<C> =>
	async (response, validate?: boolean) => {
		let decoded: Awaited<ExecRet<C>>;
		try {
			decoded = await decodeContent<ExecRet<C>>(response);
		} catch {
			logger.warn("Could not parse response, returning response");
			return response as ExecRet<C>;
		}
		if (validate === true) {
			const schema = findSchema<ExecRet<C>>(
				config,
				response.status,
				response.headers.get("Content-Type"),
			);
			if (schema)
				// TODO: data heuristic is smelly code
				return schema.parseAsync(
					decoded != null && typeof decoded === "object" && "data" in decoded
						? decoded.data
						: decoded,
				);
		}
		return decoded;
	};

export const getEndpointRequest = async <T>(
	ctx: Context,
	expectedType: "json" | "form" | "text" | "xml" | "cbor",
): Promise<T | null> => decodeContent(ctx.req.raw.clone(), expectedType);

export const getEndpointResponse = async <T>(ctx: Context) => {
	if (ctx.finalized === false) return null;
	if (ctx.res.status !== 200) return null;
	return decodeContent<T>(ctx.res.clone());
};
