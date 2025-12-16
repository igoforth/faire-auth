import { DEFAULT_SECRET } from "@faire-auth/core/static";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe } from "vitest";
import { signJWT } from "../../crypto";
import type { GoogleProfile } from "../../social-providers";
import { getTestInstance } from "../../test-utils";
import { oAuthProxy } from "./index";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "user@email.com",
		email_verified: true,
		name: "First Last",
		picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
		exp: 1234567890,
		sub: "1234567890",
		iat: 1234567890,
		aud: "test",
		azp: "test",
		nbf: 1234567890,
		iss: "test",
		locale: "en",
		jti: "test",
		given_name: "First",
		family_name: "Last",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("oauth-proxy", async (test) => {
	const { client } = await getTestInstance({
		plugins: [
			oAuthProxy({
				currentURL: "http://preview-localhost:3000",
				productionURL: "http://production.example.com",
			}),
		],
		socialProviders: { google: { clientId: "test", clientSecret: "test" } },
	});

	test("should redirect to proxy url", async ({ expect }) => {
		const res = await client.signIn.social.$post({
			json: { provider: "google", callbackURL: "/dashboard" },
		});
		const state = new URL(res.data?.data.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context: any) {
				const location = context.response.headers.get("location") ?? "";
				if (!location) throw new Error("Location header not found");

				expect(location).toContain(
					"http://preview-localhost:3000/api/auth/oauth-proxy-callback?callbackURL=%2Fdashboard",
				);
				const cookies = new URL(location).searchParams.get("cookies");
				expect(cookies).toBeTruthy();
			},
		});
	});

	test("shouldn't redirect to proxy url on same origin", async ({ expect }) => {
		const { client } = await getTestInstance({
			plugins: [oAuthProxy()],
			socialProviders: { google: { clientId: "test", clientSecret: "test" } },
		});
		const res = await client.signIn.social.$post({
			json: { provider: "google", callbackURL: "/dashboard" },
		});
		const state = new URL(res.data?.data.url!).searchParams.get("state");
		await client.$fetch(`/callback/google?code=test&state=${state}`, {
			onError(context: any) {
				const location = context.response.headers.get("location");
				if (!location) {
					throw new Error("Location header not found");
				}
				expect(location).not.toContain("/api/auth/oauth-proxy-callback");
				expect(location).toContain("/dashboard");
			},
		});
	});
});
