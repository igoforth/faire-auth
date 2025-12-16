import { isCI, isTest } from "@faire-auth/core/env";
import { inspect as nodeInspect } from "node:util";

const inspect = (object: any) => nodeInspect(object, { colors: true });
const MAX_SIZE = 100;

// Logging storage
interface ExecutionLog {
	method: string;
	input: string[];
	output: string;
	timestamp: Date;
	duration: number;
	error?: Error;
}

class LogQueue {
	private queue: ExecutionLog[] = [];
	private maxSize: number;

	constructor(maxSize = MAX_SIZE) {
		this.maxSize = maxSize;
	}

	push(log: ExecutionLog) {
		this.queue.push(log);
		// Remove oldest if exceeds max size
		if (this.queue.length > this.maxSize) {
			this.queue.shift();
		}
	}

	// Read and remove from front
	read(): ExecutionLog | undefined {
		return this.queue.shift();
	}

	// Read multiple logs
	readN(n: number): ExecutionLog[] {
		return this.queue.splice(0, n);
	}

	// Read all and clear
	readAll(): ExecutionLog[] {
		return this.queue.splice(0);
	}

	// Peek without removing
	peek(): ExecutionLog | undefined {
		return this.queue[0];
	}

	peekN(n: number): ExecutionLog[] {
		return this.queue.slice(0, n);
	}

	peekAll(): ExecutionLog[] {
		return [...this.queue];
	}

	size(): number {
		return this.queue.length;
	}

	clear() {
		this.queue.length = 0;
	}

	setMaxSize(size: number) {
		this.maxSize = size;
		// Trim if current size exceeds new max
		if (this.queue.length > size) {
			this.queue.splice(0, this.queue.length - size);
		}
	}

	// Iterator that consumes logs
	[Symbol.iterator](): Iterator<ExecutionLog> {
		return {
			next: (): IteratorResult<ExecutionLog> => {
				const log = this.queue.shift();
				if (log === undefined) {
					return { done: true, value: undefined };
				}
				return { done: false, value: log };
			},
		};
	}

	// Async iterator for waiting on new logs
	async *watch(): AsyncIterableIterator<ExecutionLog> {
		while (true) {
			const log = this.queue.shift();
			if (log) {
				yield log;
			} else {
				// Wait a bit before checking again
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}
	}
}

const logQueue = new LogQueue();

const LoggerAPI: LoggerAPI = {
	wrap(target, prefix = "", strategy: "immediate" | "queue" = "queue") {
		return logged(target, prefix, strategy);
	},

	clear() {
		logQueue.clear();
	},

	get size() {
		return logQueue.size();
	},

	set size(newSize) {
		logQueue.setMaxSize(newSize);
	},

	read: {
		next(n): any {
			if (n == null) return logQueue.read();
			return logQueue.readN(n);
		},
		all() {
			return logQueue.readAll();
		},
	},

	peek: {
		next(n): any {
			if (n == null) return logQueue.peek();
			return logQueue.peekN(n);
		},
		all() {
			return logQueue.peekAll();
		},
	},

	[Symbol.iterator]() {
		return logQueue[Symbol.iterator]();
	},

	watch() {
		return logQueue.watch();
	},
};

export function printLogs(logs: ExecutionLog[] = LoggerAPI.read.all()) {
	if (logs.length === 0) return;
	logs.forEach((log, i) => {
		console.log(
			`${log.duration.toFixed(2)}ms \x1b[35m\x1b[1m${log.method}\x1b[0m(${log.input.join(", ")}): ${log.error ? inspect(log.error) : log.output}`,
		);
	});
}

function wrapFunction(
	fn: Function,
	method: string,
	strategy: "immediate" | "queue",
) {
	const queue = strategy === "immediate" ? new LogQueue() : logQueue;
	const onComplete = () => {
		if (strategy === "immediate") printLogs(queue.readAll());
	};
	return new Proxy(fn, {
		apply(target, thisArg, args) {
			const input = args.map((a) => inspect(a));
			const timestamp = new Date();
			const startTime = performance.now();

			try {
				const result = target.apply(thisArg, args);

				// Handle promises
				if (result instanceof Promise) {
					return result
						.then(
							(resolvedValue) => {
								const duration = performance.now() - startTime;
								queue.push({
									method,
									input,
									output: inspect(resolvedValue),
									timestamp,
									duration,
								});
								return resolvedValue;
							},
							(error) => {
								const duration = performance.now() - startTime;
								queue.push({
									method,
									input,
									output: "None",
									timestamp,
									duration,
									error,
								});
								throw error;
							},
						)
						.finally(onComplete);
				}

				// Handle sync functions
				const duration = performance.now() - startTime;
				queue.push({
					method,
					input,
					output: inspect(result),
					timestamp,
					duration,
				});

				return result;
			} catch (error) {
				const duration = performance.now() - startTime;
				queue.push({
					method,
					input,
					output: "None",
					timestamp,
					duration,
					error: error as Error,
				});
				throw error;
			} finally {
				onComplete();
			}
		},
	});
}

// Invisible logging wrapper using Proxy
function logged<T>(
	target: T,
	name?: string,
	strategy: "immediate" | "queue" = "queue",
): T {
	if (!isTest() || isCI()) return target;

	// If it's a function, wrap it directly
	if (typeof target === "function") {
		const fnName = name || target.name || "anonymous";
		return wrapFunction(target, fnName, strategy) as T;
	}

	// If it's an object, wrap all methods
	return new Proxy(target as object, {
		get(obj, prop) {
			const value = obj[prop as keyof typeof obj];

			// Only wrap functions
			if (typeof value !== "function") {
				return value;
			}

			const methodName = name ? `${name}.${String(prop)}` : String(prop);
			return wrapFunction(value, methodName, strategy);
		},
	}) as T;
}

/**
 * Defines the public API for the logger.
 * This ensures our implementation matches the contract we promise to users.
 */
export interface LoggerAPI {
	wrap<T extends object>(
		target: T,
		prefix?: string,
		strategy?: "immediate" | "queue",
	): T;
	clear(): void;
	size: number; // Getter and Setter
	read: {
		next<N extends number | undefined>(
			n?: N,
		): undefined extends N ? ExecutionLog | undefined : ExecutionLog[];
		all(): ExecutionLog[];
	};
	peek: {
		next<N extends number | undefined>(
			n?: N,
		): undefined extends N ? ExecutionLog | undefined : ExecutionLog[];
		all(): ExecutionLog[];
	};
	// Add the iterators to the interface
	[Symbol.iterator](): Iterator<ExecutionLog>;
	watch(): AsyncIterableIterator<ExecutionLog>;
}

export default LoggerAPI;
