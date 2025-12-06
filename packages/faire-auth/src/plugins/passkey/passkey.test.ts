import { True } from "@faire-auth/core/static";
import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils";
import { passkeyClient } from "./client";
import type { Passkey } from "./index";
import { passkey } from "./index";

describe("passkey", async () => {
	const { $Infer, auth, signInWithTestUser, customFetchImpl } =
		await getTestInstance({ plugins: [passkey()] });
	const app = $Infer.app(auth.options);
	const api = $Infer.api(app);

	it("should generate register options", async () => {
		const { headers } = await signInWithTestUser();
		const options = await api.generatePasskeyRegistrationOptions(
			{ query: {} },
			{ headers },
		);
		// ,JSON.stringify(options)
		expect(options.success).toBe(True);
		expect(options.data).toHaveProperty("challenge");
		expect(options.data).toHaveProperty("rp");
		expect(options.data).toHaveProperty("user");
		expect(options.data).toHaveProperty("pubKeyCredParams");

		const client = createAuthClient<typeof app>()({
			plugins: [passkeyClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: { headers, customFetchImpl },
		});

		// await client.$fetch('/passkey/generate-register-options', {
		//   headers: headers,
		//   method: 'GET',
		//   onResponse(context) {
		//     const setCookie = context.response.headers.get('Set-Cookie')
		//     expect(setCookie).toBeDefined()
		//     expect(setCookie).toContain('better-auth-passkey')
		//   },
		// })
		await client.passkey.generateRegisterOptions.$get(
			{ query: {} },
			{
				headers,
				fetchOptions: {
					onResponse(context) {
						const setCookie = context.response.headers.get("Set-Cookie");
						expect(setCookie).toBeDefined();
						expect(setCookie).toContain("better-auth-passkey");
					},
				},
			},
		);
	});

	it("should generate authenticate options", async () => {
		const { headers } = await signInWithTestUser();
		const options = await api.generatePasskeyAuthenticationOptions(
			{ json: {} },
			{ headers },
		);
		expect(options.success).toBe(True);
		expect(options.data).toHaveProperty("challenge");
		expect(options.data).toHaveProperty("rpId");
		expect(options.data).toHaveProperty("allowCredentials");
		expect(options.data).toHaveProperty("userVerification");
	});

	it("should list user passkeys", async () => {
		const { headers, user } = await signInWithTestUser();
		const context = auth.$context;
		await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "mockName",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "mockCredentialID",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		const passkeys = await api.listPasskeys({ headers });

		expect(Array.isArray(passkeys.data)).toBe(true);
		if (Array.isArray(passkeys.data)) {
			expect(passkeys.data[0]).toHaveProperty("id");
			expect(passkeys.data[0]).toHaveProperty("userId");
			expect(passkeys.data[0]).toHaveProperty("publicKey");
			expect(passkeys.data[0]).toHaveProperty("credentialID");
			expect(passkeys.data[0]).toHaveProperty("aaguid");
		}
	});

	it("should update a passkey", async () => {
		const { headers } = await signInWithTestUser();
		const passkeys = await api.listPasskeys({ headers });
		expect(Array.isArray(passkeys.data)).toBe(true);
		if (Array.isArray(passkeys.data)) {
			const passkey = passkeys.data[0]!;
			const updateResult = await api.updatePasskey(
				{ json: { id: passkey.id, name: "newName" } },
				{ headers },
			);

			expect(updateResult).not.toMatchObject({ success: false });
			expect(updateResult.data.name).toBe("newName");
		}
	});

	it("should delete a passkey", async () => {
		const { headers } = await signInWithTestUser();
		const deleteResult = await api.deletePasskey(
			{ json: { id: "mockPasskeyId" } },
			{ headers: headers },
		);
		expect(deleteResult).toMatchObject({ success: true });
	});
});
