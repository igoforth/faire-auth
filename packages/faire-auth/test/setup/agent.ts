import { setGlobalDispatcher } from "undici";
import { beforeAll, inject, vi } from "vitest";
import { createAgent } from "../utils/agent";
import { fileExists } from "../utils/file";

beforeAll(async () => {
	const certFile = inject("certFile");

	// Wait for cert file to be created
	await vi.waitUntil(async () => await fileExists(certFile), {
		timeout: 5000,
		interval: 100,
	});

	// For test files
	setGlobalDispatcher(createAgent(certFile));
});
