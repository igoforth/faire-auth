// Polyfill localStorage for MSW in Node.js environments
// MSW's CookieStore tries to use localStorage.getItem during initialization
// This provides a minimal implementation that satisfies MSW's requirements

class LocalStorageMock {
	private store: Map<string, string> = new Map();

	getItem(key: string): string | null {
		return this.store.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.store.set(key, value);
	}

	removeItem(key: string): void {
		this.store.delete(key);
	}

	clear(): void {
		this.store.clear();
	}

	get length(): number {
		return this.store.size;
	}

	key(index: number): string | null {
		const keys = Array.from(this.store.keys());
		return keys[index] ?? null;
	}
}

// Polyfill if localStorage doesn't exist OR if getItem is not a function (Node.js 25+)
if (
	typeof globalThis.localStorage === "undefined" ||
	typeof globalThis.localStorage?.getItem !== "function"
) {
	globalThis.localStorage = new LocalStorageMock();
}
