import { TestError } from "@faire-auth/core/error";
import { expect } from "vitest";
import { createTestSuite } from "../create-test-suite";

/**
 * This test suite tests basic authentication flow using the adapter.
 */
export const authFlowTestSuite = createTestSuite(
	"auth-flow",
	{},
	(
		{ generate, getAuth, modifyFaireAuthOptions },
		debug?: { showDB?: () => Promise<void> },
	) => ({
		"should successfully sign up": async () => {
			await modifyFaireAuthOptions(
				{
					emailAndPassword: {
						enabled: true,
						password: { hash: async (password) => password },
					},
				},
				false,
			);
			const auth = await getAuth();
			const user = await generate("user");
			const start = Date.now();
			const result = await auth.api.signUpEmail({
				json: {
					email: user.email,
					password: crypto.randomUUID(),
					name: user.name,
					image: user.image,
				},
			});
			const end = Date.now();
			console.log(`signUpEmail took ${end - start}ms (without hashing)`);
			if (result.success === false)
				throw new TestError("Failed db auth flow test", result);
			expect(result.data.user).toBeDefined();
			expect(result.data.user!.email).toBe(user.email);
			expect(result.data.user!.name).toBe(user.name);
			expect(result.data.user!.image).toBe(user.image);
			expect(result.data.user!.emailVerified).toBe(false);
			expect(result.data.user!.createdAt).toBeDefined();
			expect(result.data.user!.updatedAt).toBeDefined();
		},
		"should successfully sign in": async () => {
			await modifyFaireAuthOptions(
				{
					emailAndPassword: {
						enabled: true,
						password: {
							hash: async (password) => password,
							async verify(data) {
								return data.hash === data.password;
							},
						},
					},
				},
				false,
			);
			const auth = await getAuth();
			const user = await generate("user");
			const password = crypto.randomUUID();
			const signUpResult = await auth.api.signUpEmail({
				json: {
					email: user.email,
					password: password,
					name: user.name,
					image: user.image,
				},
			});
			if (signUpResult.success === false)
				throw new TestError("Failed db auth flow test", signUpResult);
			const start = Date.now();
			const result = await auth.api.signInEmail({
				json: { email: user.email, password: password },
			});
			const end = Date.now();
			console.log(`signInEmail took ${end - start}ms (without hashing)`);
			if (result.success === false)
				throw new TestError("Failed db auth flow test", result);
			expect(result.data?.user).toBeDefined();
			expect(result.data.user!.id).toBe(signUpResult.data.user!.id);
		},
		"should successfully get session": async () => {
			await modifyFaireAuthOptions(
				{
					emailAndPassword: {
						enabled: true,
						password: { hash: async (password) => password },
					},
				},
				false,
			);
			const auth = await getAuth();
			const user = await generate("user");
			const password = crypto.randomUUID();
			const app = auth.$Infer.App(auth.options);
			const api = auth.$Infer.Api(app);

			const { headers, response: signUpResult } = await api.signUpEmail(
				{
					json: {
						email: user.email,
						password: password,
						name: user.name,
						image: user.image,
					},
				},
				{ returnHeaders: true },
			);
			if (signUpResult.success === false)
				throw new TestError("Failed db auth flow test", signUpResult);

			// Convert set-cookie header to cookie header for getSession call
			const modifiedHeaders = new Headers(headers);
			if (headers.has("set-cookie")) {
				modifiedHeaders.set("cookie", headers.getSetCookie().join("; "));
				modifiedHeaders.delete("set-cookie");
			}

			const start = Date.now();
			const result = await auth.api.getSession(
				{ query: {} },
				{
					headers: modifiedHeaders,
				},
			);
			const end = Date.now();
			console.log(`getSession took ${end - start}ms`);
			if (result.success === false)
				throw new TestError("Failed db auth flow test", result);
			expect(result.data?.user).toBeDefined();
			expect(result.data?.user).toStrictEqual(signUpResult.data?.user);
			expect(result.data?.session).toBeDefined();
		},
		"should not sign in with invalid email": async () => {
			await modifyFaireAuthOptions(
				{ emailAndPassword: { enabled: true } },
				false,
			);
			const auth = await getAuth();
			const user = await generate("user");
			const data = await auth.api.signInEmail({
				json: { email: user.email, password: crypto.randomUUID() },
			});
			expect(data).toMatchObject({
				message: "Invalid email or password",
				success: false,
			});
		},
		"should store and retrieve timestamps correctly across timezones":
			async () => {
				using _ = recoverProcessTZ();
				await modifyFaireAuthOptions(
					{ emailAndPassword: { enabled: true } },
					false,
				);
				const auth = await getAuth();
				const user = await generate("user");
				const password = crypto.randomUUID();
				const userSignUp = await auth.api.signUpEmail({
					json: {
						email: user.email,
						password: password,
						name: user.name,
						image: user.image,
					},
				});
				if (userSignUp.success === false)
					throw new TestError("Failed db auth flow test", userSignUp);
				process.env.TZ = "Europe/London";
				const userSignIn = await auth.api.signInEmail({
					json: { email: user.email, password: password },
				});
				if (userSignIn.success === false)
					throw new TestError("Failed db auth flow test", userSignIn);
				process.env.TZ = "America/Los_Angeles";
				expect(userSignUp.data.user?.createdAt).toStrictEqual(
					userSignIn.data.user?.createdAt,
				);
			},
	}),
);

function recoverProcessTZ() {
	const originalTZ = process.env.TZ;
	return {
		[Symbol.dispose]: () => {
			process.env.TZ = originalTZ!;
		},
	};
}
