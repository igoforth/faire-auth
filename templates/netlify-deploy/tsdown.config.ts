import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: { index: "./src/index.ts" },
		outDir: ".netlify/functions",
		noExternal: [/.*/],
		external: ["node:*", "@libsql/*", "@libsql/client", "@netlify/functions"],
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
