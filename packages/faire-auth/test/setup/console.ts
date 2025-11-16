import { capitalizeFirstLetter } from "@faire-auth/core/utils";
import { afterEach, beforeEach, vi } from "vitest";

interface CapturedLog {
	test: string;
	args: [message?: any, ...optionalParams: any[]];
	type: "log" | "error" | "warn" | "info" | "debug" | "trace";
}

let allCapturedLogs: CapturedLog[] = [];

beforeEach((ctx) => {
	if (ctx.task.mode !== "run") return;
	const currentTest = ctx.task.name;

	// Spy on console methods and capture their output with test context
	if (!(console.log as any).mock)
		vi.spyOn(console, "log").mockImplementation((...args) => {
			// ctx.annotate(inspect(args), "log").catch(() => {});
			allCapturedLogs.push({ test: currentTest, args, type: "log" });
		});

	if (!(console.error as any).mock)
		vi.spyOn(console, "error").mockImplementation((...args) => {
			// ctx.annotate(inspect(args), "error").catch(() => {});
			allCapturedLogs.push({ test: currentTest, args, type: "error" });
		});

	if (!(console.warn as any).mock)
		vi.spyOn(console, "warn").mockImplementation((...args) => {
			// ctx.annotate(inspect(args), "warn").catch(() => {});
			allCapturedLogs.push({ test: currentTest, args, type: "warn" });
		});

	if (!(console.info as any).mock)
		vi.spyOn(console, "info").mockImplementation((...args) => {
			// ctx.annotate(inspect(args), "info").catch(() => {});
			allCapturedLogs.push({ test: currentTest, args, type: "info" });
		});

	if (!(console.debug as any).mock)
		vi.spyOn(console, "debug").mockImplementation((...args) => {
			// ctx.annotate(inspect(args), "debug").catch(() => {});
			allCapturedLogs.push({ test: currentTest, args, type: "debug" });
		});

	if (!(console.trace as any).mock)
		vi.spyOn(console, "trace").mockImplementation((...args) => {
			// ctx.annotate(inspect(args), "trace").catch(() => {});
			allCapturedLogs.push({ test: currentTest, args, type: "trace" });
		});
});

afterEach(() => {
	// Restore original console methods
	vi.restoreAllMocks();

	// Group logs by test
	const logsByTest = new Map<string, CapturedLog[]>();
	allCapturedLogs.forEach((log) => {
		if (log.args[0]) {
			// Only include logs with content
			if (!logsByTest.has(log.test)) {
				logsByTest.set(log.test, []);
			}
			logsByTest.get(log.test)!.push(log);
		}
	});

	// Print logs grouped by test
	for (const [testName, logs] of logsByTest) {
		console.group(`\n- ${testName}`);

		const logsByType = {
			log: logs.filter((l) => l.type === "log"),
			error: logs.filter((l) => l.type === "error"),
			warn: logs.filter((l) => l.type === "warn"),
			info: logs.filter((l) => l.type === "info"),
			debug: logs.filter((l) => l.type === "debug"),
			trace: logs.filter((l) => l.type === "trace"),
		};

		Object.entries(logsByType).forEach(([type, typeLogs]) => {
			if (typeLogs.length > 0) {
				typeLogs.forEach((log) => {
					const consoleMethod = console[type as keyof Console] as Function;
					consoleMethod(...log.args);
				});
			}
		});

		console.groupEnd();
	}

	// Reset for next file
	allCapturedLogs = [];
});
