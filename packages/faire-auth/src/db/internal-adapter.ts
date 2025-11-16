import type {
	Account,
	Session,
	StrictAccount,
	StrictUser,
	User,
	Verification,
} from "@faire-auth/core/db";
import type { DBAdapter } from "@faire-auth/core/db/adapter";
import type { InternalAdapter } from "@faire-auth/core/types";
import { getDate } from "@faire-auth/core/utils";
import { getContext } from "../context/hono";
import { getCurrentAdapter, runWithTransaction } from "../context/transaction";
import type { AuthContext, FaireAuthOptions } from "../types";
import { generateId } from "../utils";
import { getIp } from "../utils/ip";
import { safeJSONParse } from "../utils/json";
import { parseSessionOutput, parseUserOutput } from "./schema";
import { getWithHooks } from "./with-hooks";

export const createInternalAdapter = (
	adapter: DBAdapter<FaireAuthOptions>,
	options: Pick<
		FaireAuthOptions,
		"advanced" | "user" | "session" | "verification" | "plugins"
	>,
	context: Pick<
		AuthContext,
		"logger" | "generateId" | "secondaryStorage" | "sessionConfig"
	>,
	hooks?: Exclude<FaireAuthOptions["databaseHooks"], undefined>[],
): InternalAdapter => {
	const secondaryStorage = context.secondaryStorage;
	const sessionExpiration = context.sessionConfig.expiresIn;
	const {
		createWithHooks,
		updateWithHooks,
		updateManyWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
	} = getWithHooks(adapter, hooks);

	async function refreshUserSessions(user: Partial<User>) {
		if (!secondaryStorage) return;
		if (!user.id) return;

		const listRaw = await secondaryStorage.get(`active-sessions-${user.id}`);
		if (!listRaw) return;

		const now = Date.now();
		const list =
			safeJSONParse<{ token: string; expiresAt: number }[]>(listRaw) || [];
		const validSessions = list.filter((s) => s.expiresAt > now);

		await Promise.all(
			validSessions.map(async ({ token }) => {
				const cached = await secondaryStorage.get(token);
				if (!cached) return;
				const parsed = safeJSONParse<{ session: Session; user: User }>(cached);
				if (!parsed) return;

				const sessionTTL = Math.max(
					Math.floor(new Date(parsed.session.expiresAt).getTime() - now) / 1000,
					0,
				);

				await secondaryStorage.set(
					token,
					JSON.stringify({
						session: parsed.session,
						user,
					}),
					Math.floor(sessionTTL),
				);
			}),
		);
	}

	return {
		createOAuthUser: async (user, account) => {
			return runWithTransaction(adapter, async () => {
				const createdUser = await createWithHooks(
					{
						// TODO: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
						...user,
						createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
						updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date(),
					},
					"user",
				);
				const createdAccount = await createWithHooks(
					{
						...account,
						userId: createdUser!.id,
						// TODO: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
						createdAt: account.createdAt
							? new Date(account.createdAt)
							: new Date(),
						updatedAt: account.updatedAt
							? new Date(account.updatedAt)
							: new Date(),
					},
					"account",
				);
				// TODO: hooks may modify, update callers to validate?
				return {
					user: createdUser as User | null,
					account: createdAccount as Account | null,
				};
			});
		},
		createUser: async <T extends Record<string, any>>(
			user: Parameters<InternalAdapter["createUser"]>[0],
		) => {
			const createdUser = await createWithHooks(
				{
					// TODO: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					...user,
					createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
					updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date(),
					...(user.email && { email: user.email.toLowerCase() }),
				},
				"user",
			);

			// TODO: hooks may modify, update callers to validate?
			return createdUser as T & StrictUser;
		},
		createAccount: async <T extends Record<string, any>>(
			account: Parameters<InternalAdapter["createAccount"]>[0],
		) => {
			const createdAccount = await createWithHooks(
				{
					// TODO: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					...account,
					createdAt: account.createdAt
						? new Date(account.createdAt)
						: new Date(),
					updatedAt: account.updatedAt
						? new Date(account.updatedAt)
						: new Date(),
				},
				"account",
			);

			// TODO: hooks may modify, update callers to validate?
			return createdAccount as T & StrictAccount;
		},
		listSessions: async (userId) => {
			if (secondaryStorage) {
				const currentList = await secondaryStorage.get(
					`active-sessions-${userId}`,
				);
				if (!currentList) return [];

				const list: { token: string; expiresAt: number }[] =
					safeJSONParse(currentList) || [];
				const now = Date.now();

				const validSessions = list.filter((s) => s.expiresAt > now);
				const sessions = [];

				for (const session of validSessions) {
					const sessionStringified = await secondaryStorage.get(session.token);
					if (sessionStringified) {
						const s = safeJSONParse<{
							session: Session;
							user: User;
						}>(sessionStringified);
						if (!s) return [];
						const parsedSession = parseSessionOutput(options, {
							...s.session,
							expiresAt: new Date(s.session.expiresAt),
						});
						sessions.push(parsedSession);
					}
				}
				return sessions;
			}

			const sessions = await getCurrentAdapter(adapter).findMany<Session>({
				model: "session",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			return sessions;
		},
		listUsers: async (limit, offset, sortBy, where) => {
			const users = await getCurrentAdapter(adapter).findMany<User>({
				model: "user",
				...(limit && { limit }),
				...(offset && { offset }),
				...(sortBy && { sortBy }),
				...(where && { where }),
			});
			return users;
		},
		countTotalUsers: async (where) => {
			const total = await getCurrentAdapter(adapter).count({
				model: "user",
				...(where && { where }),
			});
			if (typeof total === "string") return parseInt(total);

			return total;
		},
		deleteUser: async (userId) => {
			if (secondaryStorage)
				await secondaryStorage.delete(`active-sessions-${userId}`);

			if (!secondaryStorage || options.session?.storeSessionInDatabase) {
				await deleteManyWithHooks(
					[
						{
							field: "userId",
							value: userId,
						},
					],
					"session",
				);
			}
			await deleteManyWithHooks(
				[
					{
						field: "userId",
						value: userId,
					},
				],
				"account",
			);

			await deleteWithHooks(
				[
					{
						field: "id",
						value: userId,
					},
				],
				"user",
			);
		},
		createSession: async (userId, dontRememberMe, override, overrideAll) => {
			const ctx = getContext();
			const ip = getIp(ctx.req, options);
			const ua = ctx.req.header("user-agent");
			const { id: _, ...rest } = override || {};
			const data: Session = {
				...(ip && { ipAddress: ip }),
				...(ua && { userAgent: ua }),
				...rest,
				/**
				 * If the user doesn't want to be remembered
				 * set the session to expire in 1 day.
				 * The cookie will be set to expire at the end of the session
				 */
				expiresAt: dontRememberMe
					? getDate(60 * 60 * 24, "sec") // 1 day
					: getDate(sessionExpiration, "sec"),
				userId,
				token: generateId(32),
				// TODO: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
				createdAt: new Date(),
				updatedAt: new Date(),
				...(overrideAll ? rest : {}),
			};
			const res = await createWithHooks(
				data,
				"session",
				secondaryStorage
					? {
							fn: async (sessionData) => {
								/**
								 * store the session token for the user
								 * so we can retrieve it later for listing sessions
								 */
								const currentList = await secondaryStorage.get(
									`active-sessions-${userId}`,
								);

								let list: { token: string; expiresAt: number }[] = [];
								const now = Date.now();

								if (currentList) {
									list = safeJSONParse(currentList) || [];
									list = list.filter((session) => session.expiresAt > now);
								}

								const sorted = list.sort((a, b) => a.expiresAt - b.expiresAt);
								let furthestSessionExp = sorted.at(-1)?.expiresAt;

								sorted.push({
									token: data.token,
									expiresAt: data.expiresAt.getTime(),
								});
								if (
									!furthestSessionExp ||
									furthestSessionExp < data.expiresAt.getTime()
								) {
									furthestSessionExp = data.expiresAt.getTime();
								}
								const furthestSessionTTL = Math.max(
									Math.floor((furthestSessionExp! - now) / 1000),
									0,
								);
								if (furthestSessionTTL > 0) {
									await secondaryStorage.set(
										`active-sessions-${userId}`,
										JSON.stringify(sorted),
										furthestSessionTTL,
									);
								}

								const user = await adapter.findOne<User>({
									model: "user",
									where: [
										{
											field: "id",
											value: userId,
										},
									],
								});
								const sessionTTL = Math.max(
									Math.floor((data.expiresAt.getTime() - now) / 1000),
									0,
								);
								if (sessionTTL > 0) {
									await secondaryStorage.set(
										data.token,
										JSON.stringify({
											session: sessionData,
											user,
										}),
										sessionTTL,
									);
								}

								// TODO: casting from SessionInput to Partial<Session> here
								return sessionData as Partial<Session>;
							},
							executeMainFn: options.session?.storeSessionInDatabase === true,
						}
					: undefined,
			);

			// TODO: hooks may modify, update callers to validate?
			return res as Session;
		},
		findSession: async (token) => {
			if (secondaryStorage) {
				const sessionStringified = await secondaryStorage.get(token);
				if (!sessionStringified && !options.session?.storeSessionInDatabase) {
					return null;
				}
				if (sessionStringified) {
					const s = safeJSONParse<{
						session: Session;
						user: User;
					}>(sessionStringified);
					if (!s) return null;
					const parsedSession = parseSessionOutput(options, {
						...s.session,
						expiresAt: new Date(s.session.expiresAt),
						createdAt: new Date(s.session.createdAt),
						updatedAt: new Date(s.session.updatedAt),
					});
					const parsedUser = parseUserOutput(options, {
						...s.user,
						createdAt: new Date(s.user.createdAt),
						updatedAt: new Date(s.user.updatedAt),
					});
					return {
						session: parsedSession,
						user: parsedUser,
					};
				}
			}

			const session = await getCurrentAdapter(adapter).findOne<Session>({
				model: "session",
				where: [
					{
						value: token,
						field: "token",
					},
				],
			});

			if (!session) return null;

			const user = await getCurrentAdapter(adapter).findOne<User>({
				model: "user",
				where: [
					{
						value: session.userId,
						field: "id",
					},
				],
			});
			if (!user) return null;

			const parsedSession = parseSessionOutput(options, session);
			const parsedUser = parseUserOutput(options, user);

			return {
				session: parsedSession,
				user: parsedUser,
			};
		},
		findSessions: async (sessionTokens) => {
			if (secondaryStorage) {
				const sessions: {
					session: Session;
					user: User;
				}[] = [];
				for (const sessionToken of sessionTokens) {
					const sessionStringified = await secondaryStorage.get(sessionToken);
					if (sessionStringified) {
						const s = safeJSONParse<{
							session: Session;
							user: User;
						}>(sessionStringified);
						if (!s) return [];
						const session = {
							session: {
								...s.session,
								expiresAt: new Date(s.session.expiresAt),
							},
							user: {
								...s.user,
								createdAt: new Date(s.user.createdAt),
								updatedAt: new Date(s.user.updatedAt),
							},
						} as {
							session: Session;
							user: User;
						};
						sessions.push(session);
					}
				}
				return sessions;
			}

			const sessions = await getCurrentAdapter(adapter).findMany<Session>({
				model: "session",
				where: [
					{
						field: "token",
						value: sessionTokens,
						operator: "in",
					},
				],
			});
			const userIds = sessions.map((session) => {
				return session.userId;
			});
			if (!userIds.length) return [];
			const users = await getCurrentAdapter(adapter).findMany<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: userIds,
						operator: "in",
					},
				],
			});
			return sessions.map((session) => {
				const user = users.find((u) => u.id === session.userId);
				if (!user) return null;
				return {
					session,
					user,
				};
			}) as {
				session: Session;
				user: User;
			}[];
		},
		updateSession: async (sessionToken, session) => {
			const updatedSession = await updateWithHooks(
				session,
				[{ field: "token", value: sessionToken }],
				"session",
				secondaryStorage
					? {
							fn: async (data) => {
								const currentSession = await secondaryStorage.get(sessionToken);
								let updatedSession: Session;
								if (currentSession) {
									const parsedSession = safeJSONParse<{
										session: Session;
										user: User;
									}>(currentSession);
									if (!parsedSession) return;
									updatedSession = {
										...parsedSession.session,
										...data,
									};
									return updatedSession;
								}
							},
							executeMainFn: options.session?.storeSessionInDatabase === true,
						}
					: undefined,
			);

			// TODO: hooks may modify, update callers to validate?
			return updatedSession as Session | null;
		},
		deleteSession: async (token) => {
			if (secondaryStorage) {
				// remove the session from the active sessions list
				const data = await secondaryStorage.get(token);
				if (data) {
					const { session } =
						safeJSONParse<{
							session: Session;
							user: User;
						}>(data) ?? {};
					if (!session) {
						context.logger.error("Session not found in secondary storage");
						return;
					}
					const userId = session.userId;

					const currentList = await secondaryStorage.get(
						`active-sessions-${userId}`,
					);
					if (currentList) {
						let list: { token: string; expiresAt: number }[] =
							safeJSONParse(currentList) || [];
						const now = Date.now();

						const filtered = list.filter(
							(session) => session.expiresAt > now && session.token !== token,
						);
						const sorted = filtered.sort((a, b) => a.expiresAt - b.expiresAt);
						const furthestSessionExp = sorted.at(-1)?.expiresAt;

						if (
							filtered.length > 0 &&
							furthestSessionExp &&
							furthestSessionExp > Date.now()
						) {
							await secondaryStorage.set(
								`active-sessions-${userId}`,
								JSON.stringify(filtered),
								Math.floor((furthestSessionExp - now) / 1000),
							);
						} else await secondaryStorage.delete(`active-sessions-${userId}`);
					} else
						context.logger.error(
							"Active sessions list not found in secondary storage",
						);
				}

				await secondaryStorage.delete(token);

				if (
					!options.session?.storeSessionInDatabase ||
					options.session?.preserveSessionInDatabase
				)
					return;
			}
			await getCurrentAdapter(adapter).delete<Session>({
				model: "session",
				where: [
					{
						field: "token",
						value: token,
					},
				],
			});
		},
		deleteAccounts: async (userId) => {
			await deleteManyWithHooks(
				[
					{
						field: "userId",
						value: userId,
					},
				],
				"account",
			);
		},
		deleteAccount: async (accountId) => {
			await deleteWithHooks([{ field: "id", value: accountId }], "account");
		},
		deleteSessions: async (userIdOrSessionTokens) => {
			if (secondaryStorage) {
				if (typeof userIdOrSessionTokens === "string") {
					const activeSession = await secondaryStorage.get(
						`active-sessions-${userIdOrSessionTokens}`,
					);
					const sessions = activeSession
						? safeJSONParse<{ token: string }[]>(activeSession)
						: [];
					if (!sessions) return;
					for (const session of sessions) {
						await secondaryStorage.delete(session.token);
					}
				} else {
					for (const sessionToken of userIdOrSessionTokens) {
						const session = await secondaryStorage.get(sessionToken);
						if (session) {
							await secondaryStorage.delete(sessionToken);
						}
					}
				}

				if (
					!options.session?.storeSessionInDatabase ||
					options.session?.preserveSessionInDatabase
				)
					return;
			}
			await deleteManyWithHooks(
				[
					{
						field: Array.isArray(userIdOrSessionTokens) ? "token" : "userId",
						value: userIdOrSessionTokens,
						...(Array.isArray(userIdOrSessionTokens) && { operator: "in" }),
					},
				],
				"session",
			);
		},
		findOAuthUser: async (email, accountId, providerId) => {
			// we need to find account first to avoid missing user if the email changed with the provider for the same account
			const account = await getCurrentAdapter(adapter)
				.findMany<Account>({
					model: "account",
					where: [
						{
							value: accountId,
							field: "accountId",
						},
					],
				})
				.then((accounts) => {
					return accounts.find((a) => a.providerId === providerId);
				});
			if (account) {
				const user = await getCurrentAdapter(adapter).findOne<User>({
					model: "user",
					where: [
						{
							value: account.userId,
							field: "id",
						},
					],
				});
				if (user) {
					return {
						user,
						accounts: [account],
					};
				} else {
					const user = await getCurrentAdapter(adapter).findOne<User>({
						model: "user",
						where: [
							{
								value: email.toLowerCase(),
								field: "email",
							},
						],
					});
					if (user) {
						return {
							user,
							accounts: [account],
						};
					}
					return null;
				}
			} else {
				const user = await getCurrentAdapter(adapter).findOne<User>({
					model: "user",
					where: [
						{
							value: email.toLowerCase(),
							field: "email",
						},
					],
				});
				if (user) {
					const accounts = await getCurrentAdapter(adapter).findMany<Account>({
						model: "account",
						where: [
							{
								value: user.id,
								field: "userId",
							},
						],
					});
					return {
						user,
						accounts: accounts || [],
					};
				} else {
					return null;
				}
			}
		},
		findUserByEmail: async (email, options) => {
			const user = await getCurrentAdapter(adapter).findOne<User>({
				model: "user",
				where: [
					{
						value: email.toLowerCase(),
						field: "email",
					},
				],
			});
			if (!user) return null;
			if (options?.includeAccounts) {
				const accounts = await getCurrentAdapter(adapter).findMany<Account>({
					model: "account",
					where: [
						{
							value: user.id,
							field: "userId",
						},
					],
				});
				return {
					user,
					accounts,
				};
			}
			return {
				user,
				accounts: [],
			};
		},
		findUserById: async (userId) => {
			const user = await getCurrentAdapter(adapter).findOne<User>({
				model: "user",
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			});
			return user;
		},
		linkAccount: async (account) => {
			const result = await createWithHooks(
				{
					// TODO: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					...account,
					createdAt: account.createdAt
						? new Date(account.createdAt)
						: new Date(),
					updatedAt: account.updatedAt
						? new Date(account.updatedAt)
						: new Date(),
				},
				"account",
			);

			// TODO: hooks may modify, update callers to validate?
			return result as Account;
		},
		updateUser: async (userId, data) => {
			const user = await updateWithHooks(
				data,
				[
					{
						field: "id",
						value: userId,
					},
				],
				"user",
			);
			if (user) {
				await refreshUserSessions(user);
				await refreshUserSessions(user);
			}
			return user;
		},
		updateUserByEmail: async (email, data) => {
			const user = await updateWithHooks(
				data,
				[
					{
						field: "email",
						value: email.toLowerCase(),
					},
				],
				"user",
			);
			if (user) {
				await refreshUserSessions(user);
				await refreshUserSessions(user);
			}

			// TODO: hooks may modify, update callers to validate?
			return user as User;
		},
		updatePassword: async (userId, password) => {
			await updateManyWithHooks(
				{
					password,
				},
				[
					{
						field: "userId",
						value: userId,
					},
					{
						field: "providerId",
						value: "credential",
					},
				],
				"account",
			);
		},
		findAccounts: async (userId) => {
			const accounts = await getCurrentAdapter(adapter).findMany<Account>({
				model: "account",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});
			return accounts;
		},
		findAccount: async (accountId) => {
			const account = await getCurrentAdapter(adapter).findOne<Account>({
				model: "account",
				where: [
					{
						field: "accountId",
						value: accountId,
					},
				],
			});
			return account;
		},
		findAccountByProviderId: async (accountId, providerId) => {
			const account = await getCurrentAdapter(adapter).findOne<Account>({
				model: "account",
				where: [
					{
						field: "accountId",
						value: accountId,
					},
					{
						field: "providerId",
						value: providerId,
					},
				],
			});
			return account;
		},
		findAccountByUserId: async (userId) => {
			const account = await getCurrentAdapter(adapter).findMany<Account>({
				model: "account",
				where: [
					{
						field: "userId",
						value: userId,
					},
				],
			});

			return account;
		},
		updateAccount: async (id, data) => {
			const account = await updateWithHooks(
				data,
				[{ field: "id", value: id }],
				"account",
			);

			// TODO: hooks may modify, update callers to validate?
			return account as Account;
		},
		createVerificationValue: async (data) => {
			const verification = await createWithHooks(
				{
					// TODO: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...data,
				},
				"verification",
			);

			// TODO: hooks may modify, update callers to validate?
			return verification as Verification;
		},
		findVerificationValue: async (identifier) => {
			const verification = await getCurrentAdapter(
				adapter,
			).findMany<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: identifier,
					},
				],
				sortBy: {
					field: "createdAt",
					direction: "desc",
				},
				limit: 1,
			});
			if (!options.verification?.disableCleanup) {
				await getCurrentAdapter(adapter).deleteMany({
					model: "verification",
					where: [
						{
							field: "expiresAt",
							value: new Date(),
							operator: "lt",
						},
					],
				});
			}
			const lastVerification = verification[0] ?? null;

			return lastVerification;
		},
		deleteVerificationValue: async (id) => {
			await getCurrentAdapter(adapter).delete<Verification>({
				model: "verification",
				where: [
					{
						field: "id",
						value: id,
					},
				],
			});
		},
		deleteVerificationByIdentifier: async (identifier) => {
			await getCurrentAdapter(adapter).delete<Verification>({
				model: "verification",
				where: [
					{
						field: "identifier",
						value: identifier,
					},
				],
			});
		},
		updateVerificationValue: async (id, data) => {
			const verification = await updateWithHooks(
				data,
				[{ field: "id", value: id }],
				"verification",
			);

			// TODO: hooks may modify, update callers to validate?
			return verification as Verification;
		},
	};
};
