import { beforeEach, describe, expect, test, vi } from "vitest";
import LoggerAPI from "./logged";
import { inspect } from "node:util";

const di = (obj: any) => inspect(obj, { colors: true });

// --- Test Objects (unchanged) ---
const syncCalculator = {
	add: (a: number, b: number) => a + b,
	subtract: (a: number, b: number) => a - b,
	getConstant: () => 42,
	version: "1.0.0",
};

const errorProne = {
	syncError: () => {
		throw new Error("Synchronous failure");
	},
	asyncError: async () => {
		throw new Error("Asynchronous failure");
	},
};

const asyncService = {
	fetchData: async (id: string) => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return { id, data: `Data for ${id}` };
	},
	fetchNothing: async () => null,
};

// --- Test Suite ---

describe("Logger API", (test) => {
	// Ensure a clean slate before each test
	beforeEach(() => {
		LoggerAPI.clear();
	});

	describe("Core Functionality", (test) => {
		test("logger.wrap() should log synchronous function calls correctly", ({
			expect,
		}) => {
			const wrappedCalc = LoggerAPI.wrap(syncCalculator, "Math");
			const result = wrappedCalc.add(5, 10);

			expect(result).toBe(15);
			expect(LoggerAPI.size).toBe(1);

			const log = LoggerAPI.read.next();
			expect(log).toBeDefined();
			expect(log!.method).toBe("Math.add");
			expect(log!.input).toEqual([di(5), di(10)]);
			expect(log!.output).toBe(di(15));
			expect(log!.error).toBeUndefined();
		});

		test("logger.wrap() should not log access to non-function properties", ({
			expect,
		}) => {
			const wrappedCalc = LoggerAPI.wrap(syncCalculator);
			const version = wrappedCalc.version;

			expect(version).toBe("1.0.0");
			expect(LoggerAPI.size).toBe(0);
		});

		test("logger.wrap() should log synchronous errors correctly", ({
			expect,
		}) => {
			const wrappedError = LoggerAPI.wrap(errorProne, "ErrService");

			expect(() => wrappedError.syncError()).toThrow("Synchronous failure");

			expect(LoggerAPI.size).toBe(1);
			const log = LoggerAPI.read.next();
			expect(log!.method).toBe("ErrService.syncError");
			expect(log!.output).toBe("None");
			expect(log!.error).toBeInstanceOf(Error);
			expect(log!.error!.message).toBe("Synchronous failure");
		});

		test("logger.wrap() should log resolved promises correctly", async ({
			expect,
		}) => {
			const wrappedService = LoggerAPI.wrap(asyncService, "DataService");
			const result = await wrappedService.fetchData("abc-123");

			expect(result).toEqual({ id: "abc-123", data: "Data for abc-123" });
			expect(LoggerAPI.size).toBe(1);

			const log = LoggerAPI.read.next();
			expect(log!.method).toBe("DataService.fetchData");
			expect(log!.output).toEqual(
				di({ id: "abc-123", data: "Data for abc-123" }),
			);
			expect(log!.error).toBeUndefined();
		});

		test("logger.wrap() should log rejected promises correctly", async ({
			expect,
		}) => {
			const wrappedError = LoggerAPI.wrap(errorProne, "AsyncErrService");

			await expect(wrappedError.asyncError()).rejects.toThrow(
				"Asynchronous failure",
			);

			expect(LoggerAPI.size).toBe(1);
			const log = LoggerAPI.read.next();
			expect(log!.method).toBe("AsyncErrService.asyncError");
			expect(log!.error!.message).toBe("Asynchronous failure");
		});

		test("logger.wrap() should clone input and output to prevent mutation", ({
			expect,
		}) => {
			const inputObj = { value: 1 };
			const outputObj = { result: 2 };
			const testObj = {
				process: (input: { value: number }) => {
					input.value++;
					return outputObj;
				},
			};
			const wrappedTest = LoggerAPI.wrap(testObj);
			wrappedTest.process(inputObj);

			const log = LoggerAPI.read.next();
			expect(log!.input).toEqual([di({ value: 1 })]);
			expect(log!.input).not.toBe(inputObj);
			expect(log!.output).toEqual(di({ result: 2 }));
			expect(log!.output).not.toBe(outputObj);
		});
	});

	describe("Queue Management API", (test) => {
		test("logger.size getter should report the correct number of logs", ({
			expect,
		}) => {
			expect(LoggerAPI.size).toBe(0);
			const calc = LoggerAPI.wrap(syncCalculator);
			calc.add(1, 2);
			expect(LoggerAPI.size).toBe(1);
			calc.subtract(5, 3);
			expect(LoggerAPI.size).toBe(2);
		});

		test("logger.clear() should remove all logs", ({ expect }) => {
			const calc = LoggerAPI.wrap(syncCalculator);
			calc.add(1, 2);
			calc.subtract(5, 3);
			expect(LoggerAPI.size).toBe(2);
			LoggerAPI.clear();
			expect(LoggerAPI.size).toBe(0);
			expect(LoggerAPI.read.all()).toEqual([]);
		});

		test("logger.size setter should trim the queue if it exceeds the new limit", ({
			expect,
		}) => {
			LoggerAPI.size = 3;
			const calc = LoggerAPI.wrap(syncCalculator);
			calc.add(1, 2); // Log 1
			calc.subtract(5, 3); // Log 2
			calc.getConstant(); // Log 3
			expect(LoggerAPI.size).toBe(3);

			calc.add(10, 20); // Log 4, should trigger trim

			expect(LoggerAPI.size).toBe(3);
			const logs = LoggerAPI.read.all();
			expect(logs[0]?.method).toBe("subtract"); // Log 1 was removed
			expect(logs[2]?.method).toBe("add");

			// Reset size for other tests
			LoggerAPI.size = 100;
		});
	});

	describe("Read/Peek API", (test) => {
		beforeEach(() => {
			// Add some logs for each test in this block
			const calc = LoggerAPI.wrap(syncCalculator, "Test");
			calc.add(1, 2);
			calc.subtract(5, 3);
			calc.getConstant();
		});

		test("logger.peek should return logs without removing them", ({
			expect,
		}) => {
			expect(LoggerAPI.size).toBe(3);

			const firstLog = LoggerAPI.peek.next();
			expect(firstLog!.method).toBe("Test.add");
			expect(LoggerAPI.size).toBe(3); // Size unchanged

			const firstTwoLogs = LoggerAPI.peek.next(2);
			expect(firstTwoLogs).toHaveLength(2);
			expect(firstTwoLogs[0]?.method).toBe("Test.add");
			expect(firstTwoLogs[1]?.method).toBe("Test.subtract");
			expect(LoggerAPI.size).toBe(3); // Size unchanged

			const allLogs = LoggerAPI.peek.all();
			expect(allLogs).toHaveLength(3);
			expect(LoggerAPI.size).toBe(3); // Size unchanged
		});

		test("logger.read should remove logs from the queue", ({ expect }) => {
			expect(LoggerAPI.size).toBe(3);

			const firstLog = LoggerAPI.read.next();
			expect(firstLog!.method).toBe("Test.add");
			expect(LoggerAPI.size).toBe(2); // Size changed

			const nextTwoLogs = LoggerAPI.read.next(2);
			expect(nextTwoLogs).toHaveLength(2);
			expect(nextTwoLogs[0]?.method).toBe("Test.subtract");
			expect(nextTwoLogs[1]?.method).toBe("Test.getConstant");
			expect(LoggerAPI.size).toBe(0); // Queue is now empty

			expect(LoggerAPI.read.next()).toBeUndefined();
		});

		test("logger.read.all() should consume all logs", ({ expect }) => {
			expect(LoggerAPI.size).toBe(3);
			const allLogs = LoggerAPI.read.all();
			expect(allLogs).toHaveLength(3);
			expect(LoggerAPI.size).toBe(0);
		});
	});

	describe("Iterators", (test) => {
		test("should support synchronous iteration with for...of", ({ expect }) => {
			const calc = LoggerAPI.wrap(syncCalculator, "IterTest");
			calc.add(10, 20);
			calc.subtract(30, 5);

			const consumedLogs: string[] = [];
			for (const log of LoggerAPI) {
				consumedLogs.push(log.method);
			}

			expect(consumedLogs).toEqual(["IterTest.add", "IterTest.subtract"]);
			expect(LoggerAPI.size).toBe(0); // Iterator consumes logs
		});

		test("should support asynchronous iteration with for await...of", async ({
			expect,
		}) => {
			// Use fake timers to control the async watch loop
			vi.useFakeTimers();

			const calc = LoggerAPI.wrap(asyncService, "AsyncIterTest");
			const consumedLogs: string[] = [];

			// Start the async loop in the background
			const watchPromise = (async () => {
				for await (const log of LoggerAPI.watch()) {
					consumedLogs.push(log.method);
					// Stop after one log to prevent an infinite loop in the test
					break;
				}
			})();

			// Initially, no logs, so the loop should be waiting
			await vi.advanceTimersByTimeAsync(10);
			expect(consumedLogs).toHaveLength(0);

			// Add a log
			calc.fetchData("test-123");

			// Advance timers to allow the watcher to pick up the new log
			await vi.advanceTimersByTimeAsync(10);

			// Wait for the watch promise to resolve
			await watchPromise;

			expect(consumedLogs).toEqual(["AsyncIterTest.fetchData"]);
			// The watch iterator consumes the log
			expect(LoggerAPI.size).toBe(0);

			vi.useRealTimers();
		});
	});
});
