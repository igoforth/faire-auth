import { createAuthClient } from "faire-auth/client";
import type { App } from "./auth";

export const createClient = createAuthClient<App>()<{
	baseURL: string;
}>;
