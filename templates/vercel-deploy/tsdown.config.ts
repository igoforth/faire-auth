import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: ["./src/index.ts"],
		outDir: ".output",
		noExternal: [/.*/],
		external: ["node:*"],
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
