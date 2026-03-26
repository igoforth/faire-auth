"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";
const listeners = new Set<() => void>();

function getSystemTheme(): ResolvedTheme {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "dark";
	return (localStorage.getItem(STORAGE_KEY) as Theme) ?? "dark";
}

function resolve(theme: Theme): ResolvedTheme {
	return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme) {
	const root = document.documentElement;
	root.classList.remove("light", "dark");
	root.classList.add(resolved);
	root.style.colorScheme = resolved;
}

function notify() {
	for (const listener of listeners) listener();
}

function setThemeValue(theme: Theme) {
	localStorage.setItem(STORAGE_KEY, theme);
	applyTheme(resolve(theme));
	notify();
}

function subscribe(callback: () => void) {
	listeners.add(callback);

	const onStorage = (e: StorageEvent) => {
		if (e.key === STORAGE_KEY) {
			applyTheme(resolve(getStoredTheme()));
			notify();
		}
	};

	const mql = window.matchMedia("(prefers-color-scheme: dark)");
	const onSystemChange = () => {
		if (getStoredTheme() === "system") {
			applyTheme(getSystemTheme());
			notify();
		}
	};

	window.addEventListener("storage", onStorage);
	mql.addEventListener("change", onSystemChange);

	return () => {
		listeners.delete(callback);
		window.removeEventListener("storage", onStorage);
		mql.removeEventListener("change", onSystemChange);
	};
}

function getSnapshot(): string {
	return `${getStoredTheme()}:${resolve(getStoredTheme())}`;
}

function getServerSnapshot(): string {
	return "dark:dark";
}

export function useTheme() {
	const snapshot = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);
	const [theme, resolvedTheme] = snapshot.split(":") as [Theme, ResolvedTheme];

	const setTheme = useCallback((value: Theme | ((prev: Theme) => Theme)) => {
		const next = typeof value === "function" ? value(getStoredTheme()) : value;
		setThemeValue(next);
	}, []);

	return useMemo(
		() => ({ theme, setTheme, resolvedTheme }),
		[theme, setTheme, resolvedTheme],
	);
}
