import type { HonoRequest } from "hono";
import { tryDecode } from "./url";

type Encoder = (str: string) => string;

const tryEncode = (str: string, encoder: Encoder): string => {
	try {
		return encoder(str);
	} catch {
		// If the string contains characters that cannot be encoded,
		// we simply leave it untouched (same behaviour as the browser).
		return str;
	}
};

// Allow minification savings
const encodeURIComponent_ = encodeURIComponent;
const decodeURIComponent_ = decodeURIComponent;

const _decodeURI = (value: string) => {
	if (!/[%+]/.test(value)) return value;
	if (value.indexOf("+") !== -1) value = value.replace(/\+/g, " ");
	return value.indexOf("%") !== -1
		? tryDecode(value, decodeURIComponent_)
		: value;
};

/**
 * Encodes a query-string value (or key) without adding `+` for spaces.
 * Mirrors _decodeURI logic:
 *   - fast path when nothing needs encoding
 *   - safe fallback on malformed strings
 */
const _encodeURI = (value: string): string => {
	// Fast path: nothing to encode
	if (/^[\w.~-]*$/.test(value)) return value;
	return tryEncode(value, encodeURIComponent_);
};

/**
 * Adds or updates a query parameter in a URL.
 * @param url     Original URL (relative or absolute).
 * @param key     Parameter name.
 * @param value   Parameter value.
 * @param append  If true, keep existing values for the same key; otherwise replace them.
 */
function _setQueryParam(
	url: string,
	key: string,
	value: string,
	append = false,
): string {
	const encodedKey = _encodeURI(key);
	const encodedValue = _encodeURI(value);

	// ---- 1. Split the URL into (prefix, query, hash) -------------------------
	let hashStart = url.indexOf("#");
	const afterQuery = hashStart === -1 ? "" : url.slice(hashStart); // keeps the '#'
	const beforeHash = hashStart === -1 ? url : url.slice(0, hashStart);

	let queryStart = beforeHash.indexOf("?");
	const prefix =
		queryStart === -1 ? beforeHash : beforeHash.slice(0, queryStart);
	const oldQuery = queryStart === -1 ? "" : beforeHash.slice(queryStart + 1);

	// ---- 2. Build the new query string ---------------------------------------
	let newQuery = "";
	let handled = false;

	if (oldQuery) {
		// iterate over raw pairs exactly like _getQueryParam
		let pos = 0;
		const len = oldQuery.length;
		while (pos < len) {
			const nextAmp = oldQuery.indexOf("&", pos);
			const end = nextAmp === -1 ? len : nextAmp;
			const eq = oldQuery.indexOf("=", pos);

			let kEnd = eq === -1 || eq > end ? end : eq;
			const k = oldQuery.slice(pos, kEnd);

			const vStart = kEnd === end ? end : kEnd + 1;
			const v = kEnd === end ? "" : oldQuery.slice(vStart, end);

			// If this is the key we want to touch …
			if (_decodeURI(k) === key && !handled) {
				if (append) {
					// keep the current pair and add the new one
					newQuery += (newQuery ? "&" : "") + k + "=" + v;
					newQuery += "&" + encodedKey + "=" + encodedValue;
				}
				// overwrite
				else
					newQuery += (newQuery ? "&" : "") + encodedKey + "=" + encodedValue;

				handled = true;
			} else if (k)
				// unrelated pair – copy verbatim
				newQuery += (newQuery ? "&" : "") + k + "=" + v;

			pos = end + 1;
		}
	}

	// ---- 3. Key was not present yet ------------------------------------------
	if (!handled)
		newQuery += (newQuery ? "&" : "") + encodedKey + "=" + encodedValue;

	// ---- 4. Assemble final URL -----------------------------------------------
	return prefix + (newQuery ? "?" + newQuery : "") + afterQuery;
}

export { _setQueryParam as setQueryParamRaw };

export const setQueryParam: (
	url: string,
	key: string,
	value: string,
) => string = _setQueryParam as (
	url: string,
	key: string,
	value: string,
) => string;

export const appendQueryParam = (
	url: string,
	key: string,
	value: string,
): string => _setQueryParam(url, key, value, true);

export const updateQueryParam = (
	req: HonoRequest,
	key: string,
	value: string,
	append?: boolean,
) => {
	const url = _setQueryParam(req.url, key, value, append);
	Object.defineProperty(req, "url", {
		get: () => url,
		configurable: true,
		enumerable: true,
	});
};
