import { describe } from "vitest";
import {
	normaliseHeaders,
	mergeHeaders,
	buildSearchParams,
	removeIndexString,
	replaceUrlParam,
	mergePath,
	replaceUrlProtocol,
} from "./request";

describe("normaliseHeaders", (test) => {
	test("should return empty Headers when source is null", ({ expect }) => {
		// @ts-expect-error invalid arg
		const result = normaliseHeaders(null);
		expect(result).toBeInstanceOf(Headers);
		// @ts-expect-error not promise
		expect(Array.from(result.entries())).toEqual([]);
	});

	test("should return empty Headers when source is undefined", ({ expect }) => {
		const result = normaliseHeaders(undefined);
		expect(result).toBeInstanceOf(Headers);
		// @ts-expect-error not promise
		expect(Array.from(result.entries())).toEqual([]);
	});

	test("should handle plain object HeadersInit", ({ expect }) => {
		const result = normaliseHeaders({ "Content-Type": "application/json" });
		expect(result).toBeInstanceOf(Headers);
		expect((result as Headers).get("Content-Type")).toBe("application/json");
	});

	test("should handle array of tuples HeadersInit", ({ expect }) => {
		const result = normaliseHeaders([["Authorization", "Bearer token"]]);
		expect(result).toBeInstanceOf(Headers);
		expect((result as Headers).get("Authorization")).toBe("Bearer token");
	});

	test("should handle Headers instance", ({ expect }) => {
		const headers = new Headers({ "X-Custom": "value" });
		const result = normaliseHeaders(headers);
		expect(result).toBeInstanceOf(Headers);
		expect((result as Headers).get("X-Custom")).toBe("value");
	});

	test("should handle synchronous function returning HeadersInit", ({
		expect,
	}) => {
		const fn = () => ({ "X-Test": "sync" });
		const result = normaliseHeaders(fn);
		expect(result).toBeInstanceOf(Headers);
		expect((result as Headers).get("X-Test")).toBe("sync");
	});

	test("should handle async function returning HeadersInit", async ({
		expect,
	}) => {
		const fn = () => Promise.resolve({ "X-Test": "async" });
		const result = normaliseHeaders(fn);
		expect(result).toBeInstanceOf(Promise);
		const headers = await result;
		expect(headers.get("X-Test")).toBe("async");
	});

	test("should handle function returning empty object", ({ expect }) => {
		const fn = () => ({});
		const result = normaliseHeaders(fn);
		expect(result).toBeInstanceOf(Headers);
		expect(Array.from((result as Headers).entries())).toEqual([]);
	});
});

describe("mergeHeaders", (test) => {
	test("should handle empty sources array", ({ expect }) => {
		const result = mergeHeaders();
		expect(result).toBeInstanceOf(Headers);
		expect(Array.from((result as Headers).entries())).toEqual([]);
	});

	test("should filter out undefined sources", ({ expect }) => {
		const result = mergeHeaders(undefined, { "X-Test": "value" }, undefined);
		expect(result).toBeInstanceOf(Headers);
		expect((result as Headers).get("X-Test")).toBe("value");
	});

	test("should merge multiple synchronous HeadersInit objects", ({
		expect,
	}) => {
		const result = mergeHeaders(
			{ "X-First": "one" },
			{ "X-Second": "two" },
		) as Headers;
		expect(result.get("X-First")).toBe("one");
		expect(result.get("X-Second")).toBe("two");
	});

	test("should overwrite earlier headers with later ones", ({ expect }) => {
		const result = mergeHeaders(
			{ "X-Test": "first" },
			{ "X-Test": "second" },
		) as Headers;
		expect(result.get("X-Test")).toBe("second");
	});

	test("should handle synchronous functions", ({ expect }) => {
		const result = mergeHeaders(() => ({ "X-Func": "value" }), {
			"X-Plain": "value",
		}) as Headers;
		expect(result.get("X-Func")).toBe("value");
		expect(result.get("X-Plain")).toBe("value");
	});

	test("should return async merger when at least one source is async", async ({
		expect,
	}) => {
		const asyncFn = () => Promise.resolve({ "X-Async": "value" });
		const result = mergeHeaders({ "X-Sync": "value" }, asyncFn);
		expect(result).toBeTypeOf("function");
		const headers = await (result as () => Promise<Headers>)();
		expect(headers.get("X-Sync")).toBe("value");
		expect(headers.get("X-Async")).toBe("value");
	});

	test("should handle all async sources", async ({ expect }) => {
		const asyncFn1 = () => Promise.resolve({ "X-First": "one" });
		const asyncFn2 = () => Promise.resolve({ "X-Second": "two" });
		const result = mergeHeaders(asyncFn1, asyncFn2);
		expect(result).toBeTypeOf("function");
		const headers = await (result as () => Promise<Headers>)();
		expect(headers.get("X-First")).toBe("one");
		expect(headers.get("X-Second")).toBe("two");
	});

	test("should handle mixed sync and async with overwriting", async ({
		expect,
	}) => {
		const asyncFn = () => Promise.resolve({ "X-Test": "async" });
		const result = mergeHeaders({ "X-Test": "sync" }, asyncFn);
		const headers = await (result as () => Promise<Headers>)();
		expect(headers.get("X-Test")).toBe("async");
	});

	test("should handle null sources alongside valid ones", ({ expect }) => {
		// @ts-expect-error invalid arg
		const result = mergeHeaders(null, { "X-Test": "value" }, null) as Headers;
		expect(result.get("X-Test")).toBe("value");
	});

	test("should handle Headers instances", ({ expect }) => {
		const h1 = new Headers({ "X-One": "value1" });
		const h2 = new Headers({ "X-Two": "value2" });
		const result = mergeHeaders(h1, h2) as Headers;
		expect(result.get("X-One")).toBe("value1");
		expect(result.get("X-Two")).toBe("value2");
	});
});

describe("buildSearchParams", (test) => {
	test("should handle empty object", ({ expect }) => {
		const result = buildSearchParams({});
		expect(result.toString()).toBe("");
	});

	test("should handle single string value", ({ expect }) => {
		const result = buildSearchParams({ key: "value" });
		expect(result.toString()).toBe("key=value");
	});

	test("should handle multiple string values", ({ expect }) => {
		const result = buildSearchParams({ key1: "value1", key2: "value2" });
		expect(result.get("key1")).toBe("value1");
		expect(result.get("key2")).toBe("value2");
	});

	test("should handle array values using append", ({ expect }) => {
		const result = buildSearchParams({ tags: ["tag1", "tag2", "tag3"] });
		expect(result.getAll("tags")).toEqual(["tag1", "tag2", "tag3"]);
	});

	test("should skip undefined values", ({ expect }) => {
		const result = buildSearchParams({ key: undefined as any });
		expect(result.has("key")).toBe(false);
	});

	test("should handle empty array", ({ expect }) => {
		const result = buildSearchParams({ empty: [] });
		expect(result.has("empty")).toBe(false);
	});

	test("should handle mixed string and array values", ({ expect }) => {
		const result = buildSearchParams({
			single: "value",
			multi: ["a", "b"],
			another: "test",
		});
		expect(result.get("single")).toBe("value");
		expect(result.getAll("multi")).toEqual(["a", "b"]);
		expect(result.get("another")).toBe("test");
	});

	test("should URL encode special characters", ({ expect }) => {
		const result = buildSearchParams({ key: "value with spaces" });
		expect(result.toString()).toBe("key=value+with+spaces");
	});

	test("should handle empty strings", ({ expect }) => {
		const result = buildSearchParams({ empty: "" });
		expect(result.get("empty")).toBe("");
	});
});

describe("removeIndexString", (test) => {
	test("should remove /index from simple path", ({ expect }) => {
		expect(removeIndexString("/path/index")).toBe("/path");
	});

	test("should remove /index from root domain with https", ({ expect }) => {
		expect(removeIndexString("https://example.com/index")).toBe(
			"https://example.com/",
		);
	});

	test("should remove /index from root domain with http", ({ expect }) => {
		expect(removeIndexString("http://example.com/index")).toBe(
			"http://example.com/",
		);
	});

	test("should not remove /index from middle of path", ({ expect }) => {
		expect(removeIndexString("/path/index/more")).toBe("/path/index/more");
	});

	test("should handle URL without /index", ({ expect }) => {
		expect(removeIndexString("/path/to/resource")).toBe("/path/to/resource");
	});

	test("should handle empty string", ({ expect }) => {
		expect(removeIndexString("")).toBe("");
	});

	test("should handle just /index", ({ expect }) => {
		expect(removeIndexString("/index")).toBe("");
	});

	test("should handle domain with subdomain", ({ expect }) => {
		expect(removeIndexString("https://api.example.com/index")).toBe(
			"https://api.example.com/",
		);
	});

	test("should handle domain with port", ({ expect }) => {
		expect(removeIndexString("http://localhost:3000/index")).toBe(
			"http://localhost:3000/",
		);
	});

	test("should not remove index if not at end", ({ expect }) => {
		expect(removeIndexString("https://example.com/indexer")).toBe(
			"https://example.com/indexer",
		);
	});

	test("should handle multiple trailing slashes before index", ({ expect }) => {
		expect(removeIndexString("/path//index")).toBe("/path/");
	});
});

describe("replaceUrlParam", (test) => {
	test("should replace single parameter", ({ expect }) => {
		expect(replaceUrlParam("/users/:id", { id: "123" })).toBe("/users/123");
	});

	test("should replace multiple parameters", ({ expect }) => {
		expect(
			replaceUrlParam("/users/:userId/posts/:postId", {
				userId: "1",
				postId: "2",
			}),
		).toBe("/users/1/posts/2");
	});

	test("should remove parameter when value is undefined", ({ expect }) => {
		expect(replaceUrlParam("/users/:id", { id: undefined })).toBe("/users");
	});

	test("should handle optional parameters with ?", ({ expect }) => {
		expect(replaceUrlParam("/users/:id?", { id: "123" })).toBe("/users/123");
		expect(replaceUrlParam("/users/:id?", { id: undefined })).toBe("/users");
	});

	test("should handle parameters with type annotations", ({ expect }) => {
		expect(replaceUrlParam("/users/:id{[0-9]+}", { id: "123" })).toBe(
			"/users/123",
		);
	});

	test("should handle parameters with complex type annotations", ({
		expect,
	}) => {
		expect(
			replaceUrlParam("/files/:path{.*}", { path: "docs/readme.md" }),
		).toBe("/files/docs/readme.md");
	});

	test("should handle optional parameters with type annotations", ({
		expect,
	}) => {
		expect(replaceUrlParam("/users/:id{[0-9]+}?", { id: "123" })).toBe(
			"/users/123",
		);
		expect(replaceUrlParam("/users/:id{[0-9]+}?", { id: undefined })).toBe(
			"/users",
		);
	});

	test("should handle empty string value", ({ expect }) => {
		expect(replaceUrlParam("/users/:id", { id: "" })).toBe("/users");
	});

	test("should handle URL with no parameters", ({ expect }) => {
		expect(replaceUrlParam("/users/list", {})).toBe("/users/list");
	});

	test("should handle mixed replaced and unreplaced params", ({ expect }) => {
		expect(
			replaceUrlParam("/users/:userId/posts/:postId", { userId: "1" }),
		).toBe("/users/1/posts/:postId");
	});

	test("should handle special characters in replacement value", ({
		expect,
	}) => {
		expect(replaceUrlParam("/users/:id", { id: "user@123" })).toBe(
			"/users/user@123",
		);
	});

	test("should handle parameter at start of URL", ({ expect }) => {
		expect(replaceUrlParam(":domain/users", { domain: "example.com" })).toBe(
			"example.com/users",
		);
	});

	test("should not replace similar parameter names", ({ expect }) => {
		expect(replaceUrlParam("/users/:id/items/:itemId", { id: "1" })).toBe(
			"/users/1/items/:itemId",
		);
	});
});

describe("mergePath", (test) => {
	test("should merge base and path with single slashes", ({ expect }) => {
		expect(mergePath("/api", "users")).toBe("/api/users");
	});

	test("should handle trailing slash on base", ({ expect }) => {
		expect(mergePath("/api/", "users")).toBe("/api/users");
	});

	test("should handle leading slash on path", ({ expect }) => {
		expect(mergePath("/api", "/users")).toBe("/api/users");
	});

	test("should handle both trailing and leading slashes", ({ expect }) => {
		expect(mergePath("/api/", "/users")).toBe("/api/users");
	});

	test("should handle multiple trailing slashes on base", ({ expect }) => {
		expect(mergePath("/api///", "users")).toBe("/api/users");
	});

	test("should handle multiple leading slashes on path", ({ expect }) => {
		expect(mergePath("/api", "///users")).toBe("/api/users");
	});

	test("should return path when base is null", ({ expect }) => {
		expect(mergePath(null as any, "/users")).toBe("/users");
	});

	test("should return path when base is undefined", ({ expect }) => {
		expect(mergePath(undefined, "/users")).toBe("/users");
	});

	test("should handle empty base", ({ expect }) => {
		expect(mergePath("", "users")).toBe("/users");
	});

	test("should handle empty path", ({ expect }) => {
		expect(mergePath("/api", "")).toBe("/api/");
	});

	test("should handle both empty", ({ expect }) => {
		expect(mergePath("", "")).toBe("/");
	});

	test("should handle base with no leading slash", ({ expect }) => {
		expect(mergePath("api", "users")).toBe("api/users");
	});

	test("should handle complex paths", ({ expect }) => {
		expect(mergePath("/api/v1", "users/123")).toBe("/api/v1/users/123");
	});

	test("should handle just slash as base", ({ expect }) => {
		expect(mergePath("/", "users")).toBe("/users");
	});

	test("should handle just slash as path", ({ expect }) => {
		expect(mergePath("/api", "/")).toBe("/api/");
	});
});

describe("replaceUrlProtocol", (test) => {
	test("should replace http with ws", ({ expect }) => {
		expect(replaceUrlProtocol("http://example.com", "ws")).toBe(
			"ws://example.com",
		);
	});

	test("should replace https with wss", ({ expect }) => {
		expect(replaceUrlProtocol("https://example.com", "ws")).toBe(
			"wss://example.com",
		);
	});

	test("should replace ws with http", ({ expect }) => {
		expect(replaceUrlProtocol("ws://example.com", "http")).toBe(
			"http://example.com",
		);
	});

	test("should replace wss with https", ({ expect }) => {
		expect(replaceUrlProtocol("wss://example.com", "http")).toBe(
			"https://example.com",
		);
	});

	test("should handle URL with port", ({ expect }) => {
		expect(replaceUrlProtocol("http://localhost:3000", "ws")).toBe(
			"ws://localhost:3000",
		);
	});

	test("should handle URL with path", ({ expect }) => {
		expect(replaceUrlProtocol("http://example.com/api", "ws")).toBe(
			"ws://example.com/api",
		);
	});

	test("should handle URL with query params", ({ expect }) => {
		expect(replaceUrlProtocol("http://example.com?query=1", "ws")).toBe(
			"ws://example.com?query=1",
		);
	});

	test("should handle URL with hash", ({ expect }) => {
		expect(replaceUrlProtocol("http://example.com#section", "ws")).toBe(
			"ws://example.com#section",
		);
	});

	test("should handle complex URL", ({ expect }) => {
		expect(
			replaceUrlProtocol(
				"https://api.example.com:8080/ws?token=abc#room",
				"ws",
			),
		).toBe("wss://api.example.com:8080/ws?token=abc#room");
	});

	test("should not affect URL without http/ws protocol", ({ expect }) => {
		expect(replaceUrlProtocol("ftp://example.com", "ws")).toBe(
			"ftp://example.com",
		);
	});

	test("should handle uppercase protocol", ({ expect }) => {
		expect(replaceUrlProtocol("HTTP://example.com", "ws")).toBe(
			"ws://example.com",
		);
	});
});
