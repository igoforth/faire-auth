import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: ["./src/index.ts"],
		outDir: ".output",
		deps: {
			alwaysBundle: [/.*/],
			neverBundle: ["node:*", "@libsql/*", "@libsql/client"],
		},
		shims: true,
		clean: true,
	},
	{
		dts: true,
		format: ["esm", "cjs"],
		entry: ["./src/client.ts"],
		outDir: "./dist",
		clean: true,
	},
]);
