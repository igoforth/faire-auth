// Inlined to avoid pulling @faire-auth/core/static (which bundles schema code
// with Node-only CJS interop) into the browser client bundle.
const isPromise = <T>(value: T | Promise<T>): value is Promise<T> =>
	value != null && typeof (value as any).then === "function";

// Cookie and Content-Type will overwrite
export const normaliseHeaders = (
	source?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>),
): Promise<Headers> | Headers => {
	if (source == null) return new Headers();
	let result: HeadersInit | Promise<HeadersInit>;
	result = typeof source === "function" ? source() : source;
	if (isPromise(result)) return result.then((h) => new Headers(h));
	return new Headers(result);
};

export const mergeHeaders = (
	...sources: (
		| HeadersInit
		| (() => HeadersInit | Promise<HeadersInit>)
		| undefined
	)[]
): Headers | (() => Promise<Headers>) => {
	// 1. Normalise once (remove undefined, resolve functions).
	const resolved = sources
		.filter((v) => v !== undefined)
		.map((src) => (src == null ? {} : typeof src === "function" ? src() : src));

	// 2. Fast-path check.
	const anyAsync = resolved.some((r) => isPromise(r));
	if (!anyAsync) {
		// All synchronous – fold immediately.
		const out = new Headers();
		(resolved as HeadersInit[]).forEach((h) =>
			new Headers(h).forEach((v, k) => out.set(k, v)),
		);
		return out;
	}

	// 3. At least one async – return async merger.
	return async () => {
		const out = new Headers();
		for (const r of resolved) {
			const h = new Headers(isPromise(r) ? await r : r);
			h.forEach((v, k) => out.set(k, v));
		}
		return out;
	};
};

export const buildSearchParams = (query: Record<string, string | string[]>) => {
	const searchParams = new URLSearchParams();

	for (const [k, v] of Object.entries(query)) {
		if (v === undefined) continue;

		if (Array.isArray(v)) for (const v2 of v) searchParams.append(k, v2);
		else searchParams.set(k, v);
	}

	return searchParams;
};

export const removeIndexString = (urlString: string) => {
	if (/^https?:\/\/[^\/]+?\/index$/.test(urlString))
		return urlString.replace(/\/index$/, "/");

	return urlString.replace(/\/index$/, "");
};

export const replaceUrlParam = (
	urlString: string,
	params: Record<string, string | undefined>,
) => {
	for (const [k, v] of Object.entries(params)) {
		// Updated regex to handle parameters at start of URL (no leading slash)
		const reg = new RegExp("/?:" + k + "(?:{[^/]+})?\\??");
		urlString = urlString.replace(reg, (substring: string) =>
			v ? `${substring[0] === "/" ? "/" : ""}${v}` : "",
		);
	}
	// Clean up double slashes at the start if parameter was at beginning
	return urlString.replace(/^\/\//, "/");
};

export const mergePath = (base: string | undefined, path: string) => {
	if (base == null) return path;
	base = base.replace(/\/+$/, "");
	base = base + "/";
	path = path.replace(/^\/+/, "");
	return base + path;
};

export const replaceUrlProtocol = (
	urlString: string,
	protocol: "ws" | "http",
) => {
	switch (protocol) {
		case "ws":
			return urlString.replace(/^https?/i, (match) =>
				match.toLowerCase() === "https" ? "wss" : "ws",
			);
		case "http":
			return urlString.replace(/^wss?/i, (match) =>
				match.toLowerCase() === "wss" ? "https" : "http",
			);
	}
};
