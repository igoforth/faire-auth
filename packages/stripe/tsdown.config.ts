import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm", "cjs"],
	entry: ["./src/index.ts", "./src/client.ts"],
	external: [
		"faire-auth",
		"better-call",
		"@better-fetch/fetch",
		"stripe",
		"hono",
	],
	nodeProtocol: true,
	publint: true,
});
