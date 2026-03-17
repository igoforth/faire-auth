import type { SuccessContext } from "@better-fetch/fetch";
import type { AnyHono, ExK } from "@faire-auth/core/types";
import type { InferAPI, InferApp, InferClient } from "../api/types";
import type { Auth } from "../auth";
import { faireAuth } from "../auth";
import type { ClientOptions } from "../client/types";
import { createAuthClient } from "../client/vanilla";
import { getMigrations } from "../db/get-migration";
import { getAdapter } from "../db/utils";
import type { FaireAuthOptions } from "../types/options";
import { createCookieCapture, createCookieSetter } from "../utils/cookies";
import { getBaseURL } from "../utils/url";
import type { TestDatabaseType } from "./test-database";
import { createTestOptions } from "./test-options";

export interface TestUser {
	[x: string]: unknown;
	email: string;
	password: string;
	name: string;
	image?: string | null;
}

export interface CreatedTestUser extends TestUser {
	id: string;
	emailVerified: boolean;
	createdAt: Date;
	updatedAt: Date;
}

const generateTestCredentials = (overrides?: Partial<TestUser>) => {
	const randomId = Math.random().toString(36).substring(2, 11);
	return {
		email: `user-${randomId}@test.com`,
		password: `pass-${randomId}-${Math.random().toString(36).substring(2, 11)}`,
		name: `Test User ${randomId}`,
		...overrides,
	};
};

export interface SignInResult {
	token: string;
	user: CreatedTestUser;
	headers: Headers;
	setCookie: (name: string, value: string) => void;
	captureCookies: (
		callback?: (cookieMap: Map<string, string>) => void,
	) => <Res = {}>(context: SuccessContext<Res> | { response: Response }) => void;
}

export interface RepeatableSignInResult extends SignInResult {
	signIn: () => Promise<SignInResult>;
}

const createSignIn =
	<C extends ClientOptions>(clientOpts: C, client: any, user?: TestUser) =>
	async (): Promise<SignInResult> => {
		if (!user) throw new Error("No user credentials provided");

		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		const setCookie = createCookieSetter(headers);

		const res = await client.signIn.email.$post(
			{ json: user },
			{
				fetchOptions: {
					onSuccess: captureCookies(),
				},
			},
		);
		const { data, error } =
			clientOpts.fetchOptions?.throw === true
				? { data: res as any, error: null }
				: res;
		if (data == null || data.success === false)
			throw new Error(`Failed to sign in with user: ${JSON.stringify(error)}`);
		if (data.data.token == null)
			throw new Error(`Token not found ${JSON.stringify(data)}`);

		return {
			user: {
				createdAt: data.data.user.createdAt,
				updatedAt: data.data.user.updatedAt,
				...(data.data.user.image !== undefined && {
					image: data.data.user.image,
				}),
				...(data.data.user.name !== undefined && { name: data.data.user.name }),
				id: data.data.user.id,
				email: data.data.user.email,
				emailVerified: data.data.user.emailVerified,
				password: user.password,
			} as CreatedTestUser,
			token: data.data.token as string,
			headers,
			setCookie,
			captureCookies,
		};
	};

const createUserCreator =
	<C extends ClientOptions>(clientOpts: C, client: any, auth: Auth) =>
	async <SignIn extends boolean = true>(
		signInUser = true as SignIn,
		userOverrides?: Partial<TestUser>,
	): Promise<false extends SignIn ? TestUser : RepeatableSignInResult> => {
		const credentials = generateTestCredentials(userOverrides);

		const signUpRes = await auth.api.signUpEmail({ json: credentials });
		if (signUpRes.success !== true)
			throw new Error("Failed to create random user account");

		const signIn = createSignIn(clientOpts, client, credentials);
		return (
			signInUser
				? await signIn().then((r) => ({
						...r,
						signIn,
					}))
				: credentials
		) as false extends SignIn ? TestUser : RepeatableSignInResult;
	};

export const getTestInstance = async <
	O extends FaireAuthOptions,
	C extends ClientOptions,
	DisableTestUser extends boolean = false,
>(
	overrideOptions = {} as O,
	{
		clientOptions = {} as C,
		port = 3000,
		disableTestUser = false as DisableTestUser,
		testUser,
		testWith = "sqlite",
	}: {
		clientOptions?: C;
		port?: number;
		disableTestUser?: DisableTestUser;
		testUser?: Partial<TestUser>;
		testWith?: TestDatabaseType;
	} = {
		clientOptions: {} as C,
		port: 3000,
		disableTestUser: false as DisableTestUser,
		testWith: "sqlite",
	},
) => {
	const { options, migrationsDb } = await createTestOptions({
		port,
		testWith,
		overrideOptions,
	});

	const auth: Auth = faireAuth(options);

	if (testWith !== "mongodb") {
		const { runMigrations } = await getMigrations({
			...auth.options,
			database: migrationsDb,
		});
		await runMigrations();
	}

	const customFetchImpl = (url: Request | string | URL, init?: RequestInit) =>
		auth.app.fetch(new Request(url, init)) as Promise<Response>;

	const finalClientOpts = {
		...(clientOptions as C extends undefined ? {} : C),
		baseURL: getBaseURL(
			options?.baseURL ?? `http://localhost:${port}`,
			options?.basePath ?? "/api/auth",
		)!,
		fetchOptions: {
			customFetchImpl,
			...(clientOptions?.fetchOptions as {}),
		},
	};

	const client = createAuthClient<(typeof auth)["app"]>()(finalClientOpts);

	const createUser = createUserCreator(finalClientOpts, client, auth);
	const resolvedTestUser = (
		disableTestUser ? undefined : await createUser(false, testUser)
	) as DisableTestUser extends true ? undefined : TestUser;

	return {
		auth: { ...(auth as ExK<Auth, "options">), options },
		client,
		testUser: resolvedTestUser,
		signIn: createSignIn(finalClientOpts, client, resolvedTestUser),
		createUser,
		customFetchImpl,
		$Infer: {
			app: <O extends FaireAuthOptions>(_o: O) => auth.app as InferApp<O>,
			api: <A extends AnyHono>(_a: A) => auth.api as unknown as InferAPI<A>,
			client: <A extends AnyHono>(_a: A) =>
				client as InferClient<A, typeof finalClientOpts>,
		},
		db: getAdapter(auth.options),
	};
};
