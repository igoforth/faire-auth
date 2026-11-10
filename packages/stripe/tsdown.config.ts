import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { tsc: { build: true, incremental: true } },
	format: ["esm", "cjs"],
	entry: ["./src/index.ts", "./src/client.ts"],
	deps: {
		neverBundle: [
			"faire-auth",
			"better-call",
			"@better-fetch/fetch",
			"stripe",
			"hono",
		],
	},
	nodeProtocol: true,
	publint: true,
});
