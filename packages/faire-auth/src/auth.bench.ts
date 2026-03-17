import { isCI } from "@faire-auth/core/env";
import { Routes } from "@faire-auth/core/static";
import type {
	InputTypeCookie,
	InputTypeHeader,
	InputTypeJson,
	InputTypeParam,
	InputTypeQuery,
} from "@faire-auth/core/types";
import { existsSync } from "fs";
import { appendFile, mkdir, open } from "fs/promises";
import { join } from "path";
import { Bench, type BenchOptions, type FnHook } from "tinybench";
import { describe, inject, bench as vtBench } from "vitest";
import { staticConfigMap } from "./api/configs";
import type { Config } from "./api/types";
import type { SuccessContext } from "./client";
import type { User } from "./db";
import {
	faireAuth,
	type Auth,
	type ClientOptions,
	type DBAdapter,
	type FaireAuthOptions,
} from "./index";
import {
	getTestInstance,
	type CreatedTestUser,
	type RepeatableSignInResult,
	type SignInResult,
	type TestUser,
} from "./test-utils/test-instance";
import { createCookieCapture } from "./utils/cookies";

enum BenchType {
	COLD_START,
	REQ_SEC,
}

type ToInput<I, S extends string> = I extends { in: { [K in S]: infer Q } }
	? Q
	: {};

interface Context {
	testUser: TestUser | undefined;
	currentTestUser?: typeof BenchUtils.testUser | undefined;
	signIn: () => Promise<SignInResult>;
	createUser: <SignIn extends boolean = true>(
		signInUser?: SignIn,
		userOverrides?: Partial<TestUser>,
	) => Promise<false extends SignIn ? TestUser : RepeatableSignInResult>;
	cookieCapture: <Res>(
		context: SuccessContext<Res> | { response: Response },
	) => void;
	db: DBAdapter;
	api: Auth<any>["api"];
	$Infer: Record<string, any>;
}

const BenchUtils = {
	testUser: {
		email: "test@test.com",
		password: "test123456",
		name: "test user",
	},
	async createRandomTestUser(ctx: Context) {
		ctx.currentTestUser = {
			email: `test-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
			password: "test123456",
			name: "test user",
		};
	},
	async signUpAuthenticatedUser(ctx: Context) {
		if (!ctx.currentTestUser) await BenchUtils.createRandomTestUser(ctx);
		await ctx.api.signUpEmail({ json: ctx.currentTestUser! });
	},
	// Helper function to create and authenticate a user
	async signInAuthenticatedUser(ctx: Context) {
		if (!ctx.currentTestUser) throw new Error("No current test user");
		ctx.cookieCapture({
			response: (await ctx.api.signInEmail(
				{ json: ctx.currentTestUser },
				{ asResponse: true },
			)) as unknown as Response,
		} as any);
	},
	// Helper function to create and authenticate a user
	async setupAuthenticatedUser(ctx: Context) {
		await BenchUtils.signUpAuthenticatedUser(ctx);
		await BenchUtils.signInAuthenticatedUser(ctx);
	},
	// Helper function to clean up test user
	async cleanupTestUser(ctx: Context) {
		if (!ctx.currentTestUser) throw new Error("No current test user");
		// const email = ctx.currentTestUser.email;
		// ctx.currentTestUser = undefined;
		await ctx.db.delete<User>({
			model: "user",
			where: [
				{
					field: "email",
					value: ctx.currentTestUser!.email, // email,
				},
			],
		});
	},
	// Helper function to append benchmarks to markdown file
	async addToTable(
		data: ReturnType<Bench["table"]>,
		filePath: string = "benchmark.md",
	): Promise<void> {
		if (data.length === 0) return;
		const logsPath = join(process.cwd(), "logs");
		const fullPath = join(logsPath, filePath);
		const headers = Object.keys(data[0] ?? {});
		// Create the header and separator rows
		const headerRow = `| ${headers.join(" | ")} |`;
		const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
		const headerSection = `${headerRow}\n${separatorRow}\n`;
		// Create data rows
		const dataRows =
			data
				.filter((v) => v != null)
				.map((row) => {
					const values = headers.map((header) => String(row[header]));
					return `| ${values.join(" | ")} |`;
				})
				.join("\n") + "\n";
		try {
			// create logs dir if not exists
			if (!existsSync(logsPath)) await mkdir(logsPath);
		} finally {
			try {
				// Try to open file with 'wx' flag - fails if file exists
				const fd = await open(fullPath, "wx");
				// File doesn't exist - write headers + data
				await fd.write(headerSection + dataRows);
				await fd.close();
			} catch (error: any) {
				// File exists - just append data rows
				if (error.code === "EEXIST") await appendFile(fullPath, dataRows);
				// Some other error occurred
				else throw error;
			}
		}
	},
};

interface BenchmarkOptions<O extends FaireAuthOptions = FaireAuthOptions> {
	debug?: boolean | undefined;
	ci?: boolean | undefined;
	config?: BenchOptions;
	authOpts?: O;
}

abstract class BenchmarkBase extends Bench {
	protected debugFns: (() => Promise<void>)[] = [];
	private static display: Record<BenchType, string> = {
		[BenchType.COLD_START]: "Cold start",
		[BenchType.REQ_SEC]: "Requests per second",
	};

	constructor(config?: BenchOptions) {
		super(config);
	}

	protected execute() {
		describe(BenchmarkBase.display[this.getType()], async () => {
			const results: ReturnType<Bench["table"]> = [];
			if (this.isDebug()) for (const fn of this.debugFns) await fn();
			else {
				await this.run();
				results.push(...this.table());
			}
			if (this.isCI()) await BenchUtils.addToTable(results);
			vtBench("Ignore me", void (() => console.table(results))(), {
				time: 0,
				iterations: 1,
				warmupTime: 0,
				warmupIterations: 0,
				throws: true,
			});
		});
	}

	protected abstract getType(): BenchType;
	protected abstract isDebug(): boolean;
	protected abstract isCI(): boolean;
}

interface ColdStartOptions<O extends FaireAuthOptions>
	extends BenchmarkOptions<O> {}

class ColdStartBenchmark<O extends FaireAuthOptions> extends BenchmarkBase {
	constructor(
		private readonly options: ColdStartOptions<O> = { debug: false, ci: false },
	) {
		super(options.config);
		this.setup();
	}

	private setup() {
		this.add("faireAuth initialization", async () => {
			const auth = faireAuth({
				emailAndPassword: { enabled: true },
				rateLimit: { enabled: false },
				// baseURL: "http://localhost:3000",
				...this.options.authOpts,
			});
			await auth.handler(new Request("http://localhost:3000/api/auth/ok"));
		});
	}

	protected getType() {
		return BenchType.COLD_START;
	}
	protected isDebug() {
		return this.options.debug === true;
	}
	protected isCI() {
		return this.options.ci === true;
	}

	static create(debug?: boolean, ci?: boolean) {
		return new ColdStartBenchmark({
			debug,
			ci,
		}).execute();
	}
}

interface EndpointConfig<K extends Routes> {
	name: K;
	method?: Config<K>["method"];
	path?: Config<K>["path"];
	requiresAuth?: boolean;
	payload?:
		| ToInput<InputTypeJson<Config<K>>, "json">
		| ((ctx: Context) => ToInput<InputTypeJson<Config<K>>, "json">);
	query?: ToInput<InputTypeQuery<Config<K>>, "query">;
	param?: ToInput<InputTypeParam<Config<K>>, "param">;
	header?: ToInput<InputTypeHeader<Config<K>>, "header">;
	cookie?: ToInput<InputTypeCookie<Config<K>>, "cookie">;
	setup?: (ctx: Context) => Promise<{ headers?: HeadersInit } | void>;
	before?: (ctx: Context) => Promise<{ headers?: HeadersInit } | void>;
	after?: (ctx: Context) => Promise<void>;
	teardown?: (ctx: Context) => Promise<void>;
}

interface RequestSecOptions<O extends FaireAuthOptions>
	extends BenchmarkOptions<O> {
	endpoints: (Routes extends infer K
		? K extends any
			? EndpointConfig<K & Routes>
			: never
		: never)[];
	testOpts?: {
		clientOptions?: ClientOptions;
		port?: number;
		disableTestUser?: boolean;
		testUser?: Partial<User>;
		testWith?: "sqlite" | "postgres" | "mongodb" | "mysql";
	};
}

class RequestSecBenchmark<O extends FaireAuthOptions> extends BenchmarkBase {
	constructor(private readonly options: RequestSecOptions<O>) {
		super(options.config);
	}

	async setup() {
		const { endpoints, testOpts: extraTestOpts } = this.options;
		const {
			client,
			auth: { options, api },
			customFetchImpl,
			...rest
		} = await getTestInstance(
			{
				logger: {
					level: "error",
				},
				emailVerification: {
					async sendVerificationEmail({ user, url, token: _token }) {},
				},
				emailAndPassword: { enabled: true },
				rateLimit: { enabled: false },
				...this.options.authOpts,
			},
			{
				clientOptions: { fetchOptions: { throw: true } },
				disableTestUser: true,
				...extraTestOpts,
			},
		);

		for (const {
			name,
			method = staticConfigMap[name].method,
			path = staticConfigMap[name].path,
			setup,
			before,
			after,
			teardown,
			...endpoint
		} of endpoints) {
			let headers: HeadersInit = new Headers({
				"Content-Type": "application/json",
			});
			const ctx = {
				api,
				cookieCapture: createCookieCapture(headers)(),
				...rest,
				currentTestUser: undefined,
			} as Context;

			const fetchHandler = async () =>
				await client.$fetch(path, {
					...(endpoint.payload != null && {
						body: JSON.stringify(
							typeof endpoint.payload === "function"
								? endpoint.payload(ctx)
								: endpoint.payload,
						),
					}),
					headers,
					query: endpoint.query,
					method: method.toUpperCase(),
					params: endpoint.param,
					customFetchImpl,
				});

			let beforeAll: FnHook | undefined;
			if (setup)
				beforeAll = () =>
					setup(ctx).then((res) => {
						if (typeof res === "object" && "headers" in res && res.headers)
							headers = res.headers;
					});

			let beforeEach: FnHook | undefined;
			if (before)
				beforeEach = () =>
					before(ctx).then((res) => {
						if (typeof res === "object" && "headers" in res && res.headers)
							headers = res.headers;
					});

			let afterEach: FnHook | undefined;
			if (after) afterEach = () => after(ctx);

			let afterAll: FnHook | undefined;
			if (teardown) afterAll = () => teardown(ctx);

			this.debugFns.push(async () => {
				// @ts-expect-error FnHook doesn't like being called manually
				if (beforeAll) await beforeAll(this);
				// @ts-expect-error FnHook doesn't like being called manually
				if (beforeEach) await beforeEach(this);
				console.log(name, await fetchHandler());
				// @ts-expect-error FnHook doesn't like being called manually
				if (afterEach) await afterEach(this);
				// @ts-expect-error FnHook doesn't like being called manually
				if (afterAll) await afterAll(this);
			});

			this.add(name, fetchHandler, {
				...(beforeAll && { beforeAll }),
				...(beforeEach && { beforeEach }),
				...(afterEach && { afterEach }),
				...(afterAll && { afterAll }),
			});
		}
	}

	protected getType() {
		return BenchType.REQ_SEC;
	}
	protected isDebug() {
		return this.options.debug === true;
	}
	protected isCI() {
		return this.options.ci === true;
	}

	static async create(debug?: boolean, ci?: boolean) {
		const benchmark = new RequestSecBenchmark({
			debug,
			ci,
			endpoints: [
				{
					name: "signUpEmail",
					// payload: BenchUtils.testUser,
					payload: (ctx) => ctx.currentTestUser!,
					before: BenchUtils.createRandomTestUser,
					after: BenchUtils.cleanupTestUser,
				},
				{
					name: "signInEmail",
					payload: (ctx) => ctx.currentTestUser!,
					before: BenchUtils.signUpAuthenticatedUser,
					after: BenchUtils.cleanupTestUser,
				},
				{
					name: "getSession",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "listSessions",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "sendVerificationEmail",
					payload: (ctx) => ({
						email: ctx.currentTestUser!.email,
					}),
					// payload: { email: BenchUtils.testUser.email },
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "updateUser",
					payload: {
						name: "Benchmark Updated Name",
						image: "https://example.com/benchmark-image.jpg",
					},
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "changePassword",
					payload: (ctx) => ({
						newPassword: "benchmarkNewPassword123",
						currentPassword: ctx.currentTestUser!.password,
						revokeOtherSessions: false,
					}),
					before: BenchUtils.setupAuthenticatedUser,
					after: BenchUtils.cleanupTestUser,
				},
				{
					name: "listAccounts",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "signOut",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "deleteUser",
					payload: (ctx) => ({
						password: ctx.currentTestUser!.password,
					}),
					before: BenchUtils.setupAuthenticatedUser,
					after: BenchUtils.cleanupTestUser,
				},
				{
					name: "ok",
				},
				{
					name: "error",
				},
			],
			authOpts: { user: { deleteUser: { enabled: true } } },
		});
		await benchmark.setup();
		return benchmark.execute();
	}
}

// ColdStartBenchmark.create(inject("debugBenchmark"), isCI());
await RequestSecBenchmark.create(inject("debugBenchmark"), isCI());
