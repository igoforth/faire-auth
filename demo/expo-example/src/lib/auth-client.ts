import { expoClient } from "@faire-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { createAuthClient } from "faire-auth/client";
import type { App } from "./auth";

export const authClient = createAuthClient<App>()({
	baseURL: "http://localhost:8081",
	disableDefaultFetchPlugins: true,
	plugins: [
		expoClient({
			scheme: "faire-auth",
			storage: SecureStore,
		}),
	],
});
