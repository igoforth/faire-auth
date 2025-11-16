import { defineConfig } from "tsdown";

export default defineConfig({
	dts: { build: true, incremental: true },
	format: ["esm", "cjs"],
	entry: [
		"./src/index.ts",
		// "./src/api/index.ts",
		// "./src/async_hooks/index.ts",
		// "./src/context/index.ts",
		"./src/crypto/index.ts",
		"./src/datatypes/index.ts",
		"./src/db/index.ts",
		"./src/db/adapter/index.ts",
		"./src/env/index.ts",
		"./src/error/index.ts",
		"./src/factory/index.ts",
		"./src/static/index.ts",
		"./src/types/index.ts",
		"./src/utils/index.ts",
		"./src/oauth2/index.ts",
		"./src/social-providers/index.ts",
	],
	clean: true,
	nodeProtocol: true,
	publint: true,
	// exports: true,
	// outExtensions: (ctx) => ({ dts: ".ts", js: ".js" }),
});
