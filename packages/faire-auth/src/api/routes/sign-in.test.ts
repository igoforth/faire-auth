import { describe } from "vitest";
import { getTestInstance } from "../../test-utils";
import { createCookieCapture, parseSetCookieHeader } from "../../utils/cookies";

/**
 * More test can be found in `session.test.ts`
 */
describe("sign-in", async (test) => {
	const { $Infer, auth, testUser } = await getTestInstance();
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);

	test("should return a response with a set-cookie header", async ({
		expect,
	}) => {
		const signInRes = await api.signInEmail(
			{ json: { email: testUser!.email, password: testUser!.password } },
			{ asResponse: true },
		);
		const setCookie = signInRes.headers.getSetCookie();
		const parsed = parseSetCookieHeader(setCookie);
		expect(parsed.get("faire-auth.session_token")).toBeDefined();
	});

	test("should read the ip address and user agent from the headers", async ({
		expect,
	}) => {
		const headers = new Headers({
			"X-Forwarded-For": "127.0.0.1",
			"User-Agent": "Test",
		});
		const captureCookies = createCookieCapture(headers)();
		const signInRes = await api.signInEmail(
			{ json: { email: testUser!.email, password: testUser!.password } },
			{ asResponse: true, headers },
		);
		captureCookies({ response: signInRes });
		const session = await auth.api.getSession({ query: {} }, { headers });
		expect(session?.data.session.ipAddress).toBe(
			headers.get("X-Forwarded-For")!,
		);
		expect(session?.data.session.userAgent).toBe(headers.get("User-Agent")!);
	});
});
