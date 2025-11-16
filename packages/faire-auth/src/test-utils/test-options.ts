import type { Merge } from "type-fest";
import { defineOptions } from "../auth";
import { bearer } from "../plugins";
import type { FaireAuthOptions } from "../types/options";
import { getTestDatabase, type TestDatabaseType } from "./test-database";

export interface CreateTestOptionsConfig<
	O extends FaireAuthOptions,
	D extends TestDatabaseType,
> {
	/**
	 * Base URL for auth (default: http://localhost:3000)
	 */
	baseURL?: string | undefined;

	/**
	 * Port number (used if baseURL not provided)
	 */
	port?: number | undefined;

	/**
	 * Path prefix for auth routes
	 */
	basePath?: string | undefined;

	/**
	 * Which database backend to simulate
	 */
	testWith?: D | undefined;

	/**
	 * Additional options to merge/override defaults
	 */
	overrideOptions?: O | undefined;
}

// Default options
const initDefaultOptions = <D extends FaireAuthOptions["database"]>(
	baseURL: string,
	basePath: string,
	database: D,
) =>
	({
		baseURL,
		basePath,
		secret: "faire-auth.secret",
		socialProviders: {
			github: { clientId: "test", clientSecret: "test" },
			google: { clientId: "test", clientSecret: "test" },
		},
		emailAndPassword: { enabled: true },
		rateLimit: { enabled: false },
		advanced: {
			disableCSRFCheck: true,
		},
		logger: {
			level: "debug" as const,
		},
		plugins: [bearer()],
		database: database as D,
	}) satisfies FaireAuthOptions;

export const createTestOptions = async <
	O extends FaireAuthOptions,
	D extends TestDatabaseType,
>(
	config: CreateTestOptionsConfig<O, D> = {},
) => {
	const {
		port = 3000,
		baseURL = `http://localhost:${port}`,
		basePath = "/api/auth",
		testWith,
		overrideOptions = {} as O,
	} = config;

	const database = await getTestDatabase(testWith);

	const defaultOptions = initDefaultOptions(baseURL, basePath, database);

	// Merge with overrides using defineOptions for validation/transformation
	const finalOptions = defineOptions({
		...defaultOptions,
		...overrideOptions,
		advanced: {
			...defaultOptions.advanced,
			...overrideOptions.advanced,
		},
		plugins: [...defaultOptions.plugins!, ...(overrideOptions.plugins ?? [])],
	} as O extends undefined
		? typeof defaultOptions
		: Merge<typeof defaultOptions, O>);

	// every scenario worked returning just finalOptions but this one test in
	// organization.test.ts has migrations failing due to the memory adapter
	// (which doesn't support migrations...?) because getTestInstance in
	// upstream cleverly ignores any override-set database so getMigrations
	// only see's the testWith one
	return { options: finalOptions, migrationsDb: defaultOptions.database };
};
