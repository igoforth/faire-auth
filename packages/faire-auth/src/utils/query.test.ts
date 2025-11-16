import { describe, expect, test } from "vitest";
import { appendQueryParam, setQueryParam } from "./query";

describe("setQueryParam", (test) => {
	test("adds a new param to a bare path", ({ expect }) => {
		expect(setQueryParam("/foo", "x", "1")).toBe("/foo?x=1");
	});

	test("adds a new param to a path with an existing query", ({ expect }) => {
		expect(setQueryParam("/foo?a=1&b=2", "c", "3")).toBe("/foo?a=1&b=2&c=3");
	});

	test("replaces an existing param (append=false by default)", ({ expect }) => {
		expect(setQueryParam("/foo?a=1&b=2", "a", "9")).toBe("/foo?a=9&b=2");
	});

	test("preserves the hash fragment", ({ expect }) => {
		expect(setQueryParam("/foo#bar", "x", "1")).toBe("/foo?x=1#bar");
		expect(setQueryParam("/foo?a=1#bar", "x", "2")).toBe("/foo?a=1&x=2#bar");
	});

	test("URL-encodes keys and values", ({ expect }) => {
		expect(setQueryParam("/", "a b", "c d")).toBe("/?a%20b=c%20d");
	});

	test("keeps the fast-path values untouched", ({ expect }) => {
		expect(setQueryParam("/", "key", "abcABC123.-~_")).toBe(
			"/?key=abcABC123.-~_",
		);
	});

	test("handles malformed query strings gracefully", ({ expect }) => {
		expect(setQueryParam("/?a=1&&b=", "c", "3")).toBe("/?a=1&b=&c=3");
	});

	test("works with absolute http URLs", ({ expect }) => {
		expect(setQueryParam("http://example.com", "lang", "en")).toBe(
			"http://example.com?lang=en",
		);

		expect(setQueryParam("http://example.com?a=1", "b", "2")).toBe(
			"http://example.com?a=1&b=2",
		);
	});

	test("works with absolute https URLs", ({ expect }) => {
		expect(
			setQueryParam(
				"https://user:pass@sub.example.com:8080/path?q=1#top",
				"page",
				"5",
			),
		).toBe("https://user:pass@sub.example.com:8080/path?q=1&page=5#top");
	});

	test("works with protocol-relative URLs", ({ expect }) => {
		expect(setQueryParam("//cdn.site.com/assets?v=2", "v", "3")).toBe(
			"//cdn.site.com/assets?v=3",
		);
	});

	test("works with mailto / magnet / custom schemes", ({ expect }) => {
		expect(
			setQueryParam("mailto:someone@host.com?subject=hello", "body", "text"),
		).toBe("mailto:someone@host.com?subject=hello&body=text");
	});

	test("keeps path, auth, host, port, and fragment untouched", ({ expect }) => {
		const original = "https://user:pass@host:9000/dir/index.html?old=val#frag";
		expect(setQueryParam(original, "new", "param")).toBe(
			"https://user:pass@host:9000/dir/index.html?old=val&new=param#frag",
		);
	});

	test("handles IPv6 hosts", ({ expect }) => {
		expect(setQueryParam("http://[2001:db8::1]:8080/", "x", "1")).toBe(
			"http://[2001:db8::1]:8080/?x=1",
		);
	});

	test("does not double-encode already encoded query parts", ({ expect }) => {
		expect(setQueryParam("/?filter=%3A", "q", "a b")).toBe(
			"/?filter=%3A&q=a%20b",
		);
	});

	test("handles empty query edge cases", ({ expect }) => {
		expect(setQueryParam("https://example.com?", "a", "1")).toBe(
			"https://example.com?a=1",
		);

		expect(setQueryParam("https://example.com?#hash", "a", "1")).toBe(
			"https://example.com?a=1#hash",
		);
	});
});

describe("appendQueryParam", (test) => {
	test("appends a new value when requested", ({ expect }) => {
		expect(appendQueryParam("/foo?a=1&b=2", "a", "9")).toBe("/foo?a=1&a=9&b=2");
	});

	test("appends params to absolute URLs", ({ expect }) => {
		expect(
			appendQueryParam("https://api.io/search?q=cat&type=image", "q", "dog"),
		).toBe("https://api.io/search?q=cat&q=dog&type=image");
	});

	test("appends to query-only URLs", ({ expect }) => {
		expect(appendQueryParam("?x=1", "x", "2")).toBe("?x=1&x=2");
	});
});
