import type { Context, Env } from "hono";
import type {
	Account,
	AccountInput,
	DBPreservedModels,
	FaireAuthDBSchema,
	SecondaryStorage,
	Session,
	StrictAccount,
	StrictUser,
	User,
	UserInput,
	Verification,
	VerificationInput,
} from "../db";
import type { DBAdapter, Where } from "../db/adapter";
import { createLogger } from "../env";
import type { OAuthProviders } from "../social-providers";
import type { CookieOptions, FaireAuthCookies } from "./cookie";
import type { ExK, LiteralStringUnion, OmitId } from "./helper";
import type { JSONRespondReturn } from "./json";
import type { FaireAuthOptions, FaireAuthRateLimitOptions } from "./options";

export interface InternalAdapter<
	Options extends FaireAuthOptions = FaireAuthOptions,
> {
	createOAuthUser(
		user: OmitId<UserInput>,
		account: ExK<AccountInput, "userId" | "id">,
	): Promise<{ user: User | null; account: Account | null }>;

	createUser<T extends Record<string, any>>(
		user: OmitId<UserInput>,
	): Promise<T & StrictUser>;

	createAccount<T extends Record<string, any>>(
		account: OmitId<AccountInput>,
	): Promise<T & StrictAccount>;

	listSessions(userId: string): Promise<Session[]>;

	listUsers(
		limit?: number | undefined,
		offset?: number | undefined,
		sortBy?: { field: string; direction: "asc" | "desc" } | undefined,
		where?: Where[] | undefined,
	): Promise<User[]>;

	countTotalUsers(where?: Where[] | undefined): Promise<number>;

	deleteUser(userId: string): Promise<void>;

	createSession(
		userId: string,
		dontRememberMe?: boolean | undefined,
		override?: Partial<Session> | undefined,
		overrideAll?: boolean | undefined,
	): Promise<Session>;

	findSession(token: string): Promise<{
		session: Session;
		user: User;
	} | null>;

	findSessions(
		sessionTokens: string[],
	): Promise<{ session: Session; user: User }[]>;

	updateSession(
		sessionToken: string,
		session: Partial<Session>,
	): Promise<Session | null>;

	deleteSession(token: string): Promise<void>;

	deleteAccounts(userId: string): Promise<void>;

	deleteAccount(accountId: string): Promise<void>;

	deleteSessions(userIdOrSessionTokens: string | string[]): Promise<void>;

	findOAuthUser(
		email: string,
		accountId: string,
		providerId: string,
	): Promise<{ user: User; accounts: Account[] } | null>;

	findUserByEmail(
		email: string,
		options?: { includeAccounts: boolean } | undefined,
	): Promise<{ user: User; accounts: Account[] } | null>;

	findUserById(userId: string): Promise<User | null>;

	linkAccount(account: OmitId<AccountInput>): Promise<Account>;

	// fixme: any type
	updateUser(userId: string, data: Partial<User>): Promise<any>;

	updateUserByEmail(email: string, data: Partial<User>): Promise<User>;

	updatePassword(userId: string, password: string): Promise<void>;

	findAccounts(userId: string): Promise<Account[]>;

	findAccount(accountId: string): Promise<Account | null>;

	findAccountByProviderId(
		accountId: string,
		providerId: string,
	): Promise<Account | null>;

	findAccountByUserId(userId: string): Promise<Account[]>;

	updateAccount(id: string, data: Partial<Account>): Promise<Account>;

	createVerificationValue(
		data: OmitId<VerificationInput>,
	): Promise<Verification>;

	findVerificationValue(identifier: string): Promise<Verification | null>;

	deleteVerificationValue(id: string): Promise<void>;

	deleteVerificationByIdentifier(identifier: string): Promise<void>;

	updateVerificationValue(
		id: string,
		data: Partial<Verification>,
	): Promise<Verification>;
}

type CheckPasswordFn<E extends Env = any> = (
	userId: string,
	ctx: Context<E>,
) => Promise<
	boolean | JSONRespondReturn<{ success: false; message: string }, 400>
>;

type CreateCookieGetterFn = (
	cookieName: string,
	overrideAttributes?: Partial<CookieOptions> | undefined,
) => {
	name: string;
	attributes: CookieOptions;
};

export interface AuthContext<
	E extends Env = any,
	Options extends FaireAuthOptions<E> = FaireAuthOptions<E>,
> {
	appName: string;
	baseURL: string;
	trustedOrigins: Set<string>;
	// oauthConfig: {
	// 	/**
	// 	 * This is dangerous and should only be used in dev or staging environments.
	// 	 */
	// 	skipStateCookieCheck?: boolean | undefined;
	// 	/**
	// 	 * Strategy for storing OAuth state
	// 	 *
	// 	 * - "cookie": Store state in an encrypted cookie (stateless)
	// 	 * - "database": Store state in the database
	// 	 *
	// 	 * @default "cookie"
	// 	 */
	// 	storeStateStrategy: "database" | "cookie";
	// };
	/**
	 * New session that will be set after the request
	 * meaning: there is a `set-cookie` header that will set
	 * the session cookie. This is the fetched session. And it's set
	 * by `setNewSession` method.
	 */
	newSession: {
		session: Session;
		user: User;
	} | null;
	socialProviders: OAuthProviders;
	authCookies: FaireAuthCookies;
	logger: ReturnType<typeof createLogger>;
	rateLimit: {
		enabled: boolean;
		window: number;
		max: number;
		storage: "memory" | "database" | "secondary-storage";
	} & FaireAuthRateLimitOptions;
	adapter: DBAdapter<Options>;
	internalAdapter: InternalAdapter<Options>;
	createAuthCookie: CreateCookieGetterFn;
	secret: string;
	sessionConfig: {
		updateAge: number;
		expiresIn: number;
		freshAge: number;
		cookieRefreshCache:
			| false
			| {
					enabled: true;
					updateAge: number;
			  };
	};
	generateId: (options: {
		model: LiteralStringUnion<DBPreservedModels>;
		size?: number | undefined;
	}) => string | false;
	secondaryStorage?: SecondaryStorage;
	password: {
		hash: (password: string) => Promise<string>;
		verify: (data: { password: string; hash: string }) => Promise<boolean>;
		config: {
			minPasswordLength: number;
			maxPasswordLength: number;
		};
		checkPassword: CheckPasswordFn<E>;
	};
	tables: FaireAuthDBSchema;
	runMigrations: () => Promise<void>;
	publishTelemetry: (event: {
		type: string;
		anonymousId?: string | undefined;
		payload: Record<string, any>;
	}) => Promise<void>;
	// /**
	//  * This skips the origin check for all requests.
	//  *
	//  * set to true by default for `test` environments and `false`
	//  * for other environments.
	//  *
	//  * It's inferred from the `options.advanced?.disableCSRFCheck`
	//  * option or `options.advanced?.disableOriginCheck` option.
	//  *
	//  * @default false
	//  */
	// skipOriginCheck: boolean;
	// /**
	//  * This skips the CSRF check for all requests.
	//  *
	//  * This is inferred from the `options.advanced?.
	//  * disableCSRFCheck` option.
	//  *
	//  * @default false
	//  */
	// skipCSRFCheck: boolean;
}
