import { createOTP } from "@faire-auth/core/datatypes";
import { DEFAULT_SECRET, True } from "@faire-auth/core/static";
import { describe, vi } from "vitest";
import { symmetricDecrypt } from "../../crypto";
import { getTestInstance } from "../../test-utils";
import {
	createCookieCapture,
	createCookieSetter,
	parseSetCookieHeader,
} from "../../utils/cookies";
import { TWO_FACTOR_ERROR_CODES, twoFactor, twoFactorClient } from "./index";
import type { TwoFactorTable, UserWithTwoFactor } from "./types";

describe("two factor", async (test) => {
	let OTP = "";
	const { $Infer, db, auth, createUser } = await getTestInstance(
		{
			secret: DEFAULT_SECRET,
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp }) {
							OTP = otp;
						},
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [twoFactorClient()],
			},
		},
	);
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);
	const client = $Infer.client(app);

	const { headers, user: testUser, token, captureCookies } = await createUser();

	// const headers = new Headers();

	// const { data: session } = await client.signIn.email.$post(
	// 	{
	// 		json: {
	// 			email: testUser.email,
	// 			password: testUser.password,
	// 		},
	// 	},
	// 	{
	// 		fetchOptions: {
	// 			onSuccess: createCookieCapture(headers),
	// 		},
	// 	},
	// );
	// if (!session) throw new Error("No session");

	test("should return uri and backup codes and shouldn't enable twoFactor yet", async ({
		expect,
	}) => {
		const res = await client.twoFactor.enable.$post(
			{ json: { password: testUser.password } },
			{ headers },
		);
		expect(res.data?.data.backupCodes.length).toEqual(10);
		expect(res.data?.data.totpURI).toBeDefined();
		const dbUser = await db.findOne<UserWithTwoFactor>({
			model: "user",
			where: [{ field: "id", value: testUser.id }],
		});
		const twoFactor = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: testUser.id }],
		});
		expect(dbUser?.twoFactorEnabled).toBe(false);
		expect(twoFactor?.secret).toBeDefined();
		expect(twoFactor?.backupCodes).toBeDefined();
	});

	test("should use custom issuer from request parameter", async ({
		expect,
	}) => {
		const CUSTOM_ISSUER = "Custom App Name";
		const res = await client.twoFactor.enable.$post(
			{ json: { password: testUser.password, issuer: CUSTOM_ISSUER } },
			{ headers },
		);

		const totpURI = res.data?.data.totpURI;
		expect(totpURI).toMatch(
			new RegExp(`^otpauth://totp/${encodeURIComponent(CUSTOM_ISSUER)}:`),
		);
		expect(totpURI).toContain(`&issuer=Custom+App+Name&`);
	});

	test("should fallback to appName when no issuer provided", async ({
		expect,
	}) => {
		const res = await client.twoFactor.enable.$post(
			{ json: { password: testUser.password } },
			{ headers },
		);

		const totpURI = res.data?.data.totpURI;
		expect(totpURI).toMatch(/^otpauth:\/\/totp\/Faire%20Auth:/);
		expect(totpURI).toContain("&issuer=Faire+Auth&");
	});

	test("should enable twoFactor", async ({ expect }) => {
		const twoFactor = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: testUser.id }],
		});
		if (!twoFactor) throw new Error("No two factor");

		const decrypted = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: twoFactor.secret,
		});
		const code = await createOTP(decrypted).totp();

		const res = await client.twoFactor.verifyTotp.$post(
			{ json: { code } },
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies(),
				},
			},
		);
		expect(res.data?.data.token).toBeDefined();
	});

	test("should require two factor", async ({ expect }) => {
		const headers = new Headers();
		const setCookie = createCookieSetter(headers);

		const res = await client.signIn.email.$post(
			{
				json: {
					email: testUser.email,
					password: testUser.password,
					rememberMe: false,
				},
			},
			{
				fetchOptions: {
					onResponse: (context) => {
						const parsed = parseSetCookieHeader(
							context.response.headers.getSetCookie(),
						);
						const sessionToken = parsed.get("faire-auth.session_token");
						const twoFactor = parsed.get("faire-auth.two_factor");
						const dontRemember = parsed.get("faire-auth.dont_remember");
						expect(sessionToken?.value).toBe("");
						expect(twoFactor?.value).toBeTruthy();
						expect(dontRemember?.value).toBeTruthy();
						setCookie("faire-auth.two_factor", twoFactor!.value);
						setCookie("faire-auth.dont_remember", dontRemember!.value);
					},
				},
			},
		);
		expect((res.data as Record<string, unknown>)?.twoFactorRedirect).toBe(True);
		const res2 = await client.twoFactor.sendOtp.$post(
			{ json: {} },
			{ headers },
		);
		expect(res2.data?.success).toBe(True);

		const verifyRes = await client.twoFactor.verifyOtp.$post(
			{ json: { code: OTP } },
			{
				headers,
				fetchOptions: {
					onResponse: (context) => {
						const parsed = parseSetCookieHeader(
							context.response.headers.getSetCookie(),
						);
						const sessionToken = parsed.get("faire-auth.session_token");
						// expect(sessionToken?.value).toBeDefined();
						expect(sessionToken?.value).toBeTruthy();
						// max age should be undefined because we are not using remember me
						expect(sessionToken!["max-age"]).not.toBeDefined();
					},
				},
			},
		);
		expect(verifyRes.data?.data.token).toBeDefined();
	});

	test("should fail if two factor cookie is missing", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);
		const setCookie = createCookieSetter(headers);

		const res = await client.signIn.email.$post(
			{
				json: {
					email: testUser.email,
					password: testUser.password,
					rememberMe: false,
				},
			},
			{
				fetchOptions: {
					onResponse: (context) => {
						const parsed = parseSetCookieHeader(
							context.response.headers.getSetCookie(),
						);
						const sessionToken = parsed.get("faire-auth.session_token");
						const twoFactor = parsed.get("faire-auth.two_factor");
						const dontRemember = parsed.get("faire-auth.dont_remember");
						expect(sessionToken?.value).toBe("");
						expect(twoFactor?.value).toBeTruthy();
						expect(dontRemember?.value).toBeTruthy();
						// 2FA Cookie is in response, but we are not setting it in headers
						setCookie("faire-auth.dont_remember", dontRemember!.value);
					},
				},
			},
		);
		expect((res.data as Record<string, unknown>)?.twoFactorRedirect).toBe(True);
		await client.twoFactor.sendOtp.$post(
			{ json: {} },
			{
				headers,
			},
		);

		const verifyRes = await client.twoFactor.verifyOtp.$post(
			{
				json: {
					code: OTP,
				},
			},
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies((parsed) => {
						// Session should not be defined when two factor cookie is missing
						expect(parsed.get("faire-auth.session_token")).not.toBeDefined();
					}),
				},
			},
		);

		if (!verifyRes.error || !("message" in verifyRes.error))
			throw new Error("Expected error with message");
		expect(verifyRes.error.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE,
		);
	});

	test("should fail when passing invalid TOTP code with expected error code", async ({
		expect,
	}) => {
		const res = await client.twoFactor.verifyTotp.$post(
			{
				json: {
					code: "invalid-code",
				},
			},
			{
				headers,
			},
		);
		if (!res.error || !("message" in res.error))
			throw new Error("Expected error with message");
		expect(res.error.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE);
	});

	let backupCodes: string[] = [];
	test("should generate backup codes", async ({ expect }) => {
		await client.twoFactor.enable.$post(
			{ json: { password: testUser.password } },
			{ headers },
		);
		const backupCodesRes = await client.twoFactor.generateBackupCodes.$post(
			{ json: { password: testUser.password } },
			{ headers },
		);
		expect(backupCodesRes.data?.data).toBeDefined();
		backupCodes = backupCodesRes.data?.data || [];
	});

	test("should allow sign in with backup code", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		const res0 = await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onSuccess: captureCookies((parsed) => {
						const sessionToken = parsed.get("faire-auth.session_token");
						const twoFactor = parsed.get("faire-auth.two_factor");
						expect(sessionToken).toBe("");
						expect(twoFactor).toBeTruthy();
					}),
				},
			},
		);
		expect(res0.data).toBeDefined();
		const backupCode = backupCodes[0]!;

		await client.twoFactor.verifyBackupCode.$post(
			{ json: { code: backupCode } },
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies((parsed) => {
						const token = parsed.get("faire-auth.session_token");
						expect(token).toBeDefined();
						expect(token!.length).toBeGreaterThan(0);
					}),
				},
			},
		);
		const currentBackupCodes = await api.viewBackupCodes({
			json: { userId: testUser.id },
		});
		if (currentBackupCodes.success !== true)
			throw new Error("Expected success response");
		expect(currentBackupCodes.data).toBeDefined();
		expect(currentBackupCodes.data).not.toContain(backupCode);

		const res = await client.twoFactor.verifyBackupCode.$post(
			{ json: { code: "invalid-code" } },
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies((parsed) => {
						const token = parsed.get("faire-auth.session_token");
						expect(token?.length).toBeGreaterThan(0);
					}),
				},
			},
		);
		if (!res.error || !("message" in res.error))
			throw new Error("Expected error with message");
		expect(res.error.message).toBe("Invalid backup code");
	});

	test("should trust device", async ({ expect }) => {
		let headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		const res = await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onSuccess: captureCookies(),
				},
			},
		);
		expect((res.data as Record<string, unknown>)?.twoFactorRedirect).toBe(True);
		await client.twoFactor.sendOtp.$post(
			{ json: {} },
			{
				headers,
				fetchOptions: {
					onSuccess: captureCookies(),
					// TODO: Figure out whatever the heck this original code was
					// headers.append(
					// 	"cookie",
					// 	`faire-auth.otp.counter=${
					// 		parsed.get("faire-auth.otp_counter")?.value
					// 	}`,
					// );
				},
			},
		);

		const newHeaders = new Headers();
		const newCaptureCookies = createCookieCapture(newHeaders);

		await client.twoFactor.verifyOtp.$post(
			{ json: { trustDevice: true, code: OTP } },
			{
				headers,
				fetchOptions: {
					onSuccess: newCaptureCookies(),
				},
			},
		);

		const signInRes = await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{ headers: newHeaders },
		);
		expect(signInRes.data?.data.user).toBeDefined();
	});

	test("should limit OTP verification attempts", async ({ expect }) => {
		const headers = new Headers();
		const captureCookies = createCookieCapture(headers);

		// Sign in to trigger 2FA
		await client.signIn.email.$post(
			{ json: { email: testUser.email, password: testUser.password } },
			{
				fetchOptions: {
					onSuccess: captureCookies(),
				},
			},
		);
		await client.twoFactor.sendOtp.$post({ json: {} }, { headers });
		for (let i = 0; i < 5; i++) {
			const res = await client.twoFactor.verifyOtp.$post(
				{
					json: {
						code: "000000", // Invalid code
					},
				},
				{ headers },
			);
			if (!res.error || !("message" in res.error))
				throw new Error("Expected error with message");
			expect(res.error.message).toBe("Invalid code");
		}

		// Next attempt should be blocked
		const res = await client.twoFactor.verifyOtp.$post(
			{
				json: {
					code: OTP, // Even with correct code
				},
			},
			{ headers },
		);
		if (!res.error || !("message" in res.error))
			throw new Error("Expected error with message");
		expect(res.error.message).toBe(
			"Too many attempts. Please request a new code.",
		);
	});

	test("should disable two factor", async ({ expect }) => {
		const res = await client.twoFactor.disable.$post(
			{ json: { password: testUser.password } },
			{ headers },
		);

		expect(res.data?.success).toBe(True);
		const dbUser = await db.findOne<UserWithTwoFactor>({
			model: "user",
			where: [{ field: "id", value: testUser.id }],
		});
		expect(dbUser?.twoFactorEnabled).toBe(false);

		const signInRes = await client.signIn.email.$post({
			json: { email: testUser.email, password: testUser.password },
		});
		expect(signInRes.data?.data.user).toBeDefined();
	});
});

describe("two factor auth API", async (test) => {
	let OTP = "";
	const sendOTP = vi.fn();
	const { $Infer, auth, signIn, testUser } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP({ otp }) {
						OTP = otp;
						sendOTP(otp);
					},
				},
				skipVerificationOnEnable: true,
			}),
		],
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);
	const { headers, captureCookies } = await signIn();

	test("enable two factor", async ({ expect }) => {
		const response = await api.enableTwoFactor(
			{ json: { password: testUser.password } },
			{ headers, asResponse: true },
		);
		captureCookies()({ response });

		const json = (await response.json()) as {
			success: true;
			data: {
				backupCodes: string[];
				totpURI: string;
			};
		};
		expect(json.data.backupCodes.length).toBe(10);
		expect(json.data.totpURI).toBeDefined();
		const session = await api.getSession({ query: {} }, { headers });
		if (session.success !== true) throw new Error("Expected success response");
		expect(session.data.user.twoFactorEnabled).toBe(True);
	});

	test("should get totp uri", async ({ expect }) => {
		const res = await api.getTOTPURI(
			{ json: { password: testUser.password } },
			{ headers },
		);
		if (res.success !== true) throw new Error("Expected success response");
		expect(res.data).toBeTypeOf("string");
	});

	test("should request second factor", async ({ expect }) => {
		const response = await api.signInEmail(
			{ json: { email: testUser.email, password: testUser.password } },
			{ asResponse: true },
		);

		captureCookies()({ response });

		expect(response).toBeInstanceOf(Response);
		expect(response.status).toBe(200);
		const parsed = parseSetCookieHeader(response.headers.getSetCookie());
		const twoFactorCookie = parsed.get("faire-auth.two_factor");
		expect(twoFactorCookie).toBeDefined();
		const sessionToken = parsed.get("faire-auth.session_token");
		expect(sessionToken?.value).toBeFalsy();
	});

	test("should send otp", async ({ expect }) => {
		const res = await api.sendTwoFactorOTP(
			{ json: { trustDevice: false } },
			{ headers },
		);
		expect(res.success).toBe(True);
		expect(OTP.length).toBe(6);
		expect(sendOTP).toHaveBeenCalledWith(OTP);
	});

	test("should verify otp", async ({ expect }) => {
		const response = await api.verifyTwoFactorOTP(
			{ json: { code: OTP } },
			{ headers, asResponse: true },
		);
		expect(response.status).toBe(200);
		expect(response.headers.getSetCookie().length).toBeTruthy();
		captureCookies()({ response });
	});

	test("should disable two factor", async ({ expect }) => {
		const response = await api.disableTwoFactor(
			{ json: { password: testUser.password } },
			{ headers, asResponse: true },
		);
		captureCookies()({ response });
		const session = await api.getSession({ query: {} }, { headers });
		if (session.success !== true) throw new Error("Expected success response");
		expect(session.data.user.twoFactorEnabled).toBe(false);
	});
});

describe("view backup codes", async (test) => {
	const sendOTP = vi.fn();
	const { $Infer, auth, signIn, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				otpOptions: {
					sendOTP({ otp }) {
						sendOTP(otp);
					},
				},
				skipVerificationOnEnable: true,
			}),
		],
	});
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);
	const { headers, user, captureCookies } = await signIn();
	const userId = user.id;

	test("should return parsed array of backup codes, not JSON string", async ({
		expect,
	}) => {
		const response = await api.enableTwoFactor(
			{
				json: { password: testUser.password },
			},
			{
				headers,
				asResponse: true,
			},
		);

		expect(response.status).toBe(200);
		captureCookies()({ response });

		const enableJson = (await response.json()) as {
			data: {
				backupCodes: string[];
			};
		};

		const viewResult = await api.viewBackupCodes({
			json: { userId },
		});

		if (viewResult.success !== true)
			throw new Error("Expected success response");
		expect(viewResult.data).not.toBeTypeOf("string");
		expect(Array.isArray(viewResult.data), JSON.stringify(viewResult)).toBe(
			True,
		);
		expect(viewResult.data.length).toBe(10);
		viewResult.data.forEach((code: string) => {
			expect(code).toBeTypeOf("string");
			expect(code.length).toBeGreaterThan(0);
		});
		expect(viewResult.data).toEqual(enableJson.data.backupCodes);
	});

	test("should return array after generating new backup codes", async ({
		expect,
	}) => {
		const generateResult = await api.generateBackupCodes(
			{
				json: { password: testUser.password },
			},
			{
				headers,
			},
		);

		if (generateResult.success !== true)
			throw new Error("Expected success response");
		expect(generateResult.data).toBeDefined();
		expect(generateResult.data.length).toBe(10);

		const viewResult = await api.viewBackupCodes({
			json: { userId },
		});

		if (viewResult.success !== true)
			throw new Error("Expected success response");
		expect(viewResult.data).not.toBeTypeOf("string");
		expect(Array.isArray(viewResult.data)).toBe(True);
		expect(viewResult.data.length).toBe(10);
		viewResult.data.forEach((code: string) => {
			expect(code).toBeTypeOf("string");
			expect(code.length).toBeGreaterThan(0);
		});
		expect(viewResult.data).toEqual(generateResult.data);
	});
});
