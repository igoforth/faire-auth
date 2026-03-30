import { defineConfig } from "tsdown";

export default defineConfig([
	{
		dts: true,
		format: ["esm", "cjs"],
		entry: ["./src/client.ts"],
		outDir: "./dist",
		clean: true,
	},
	{
		format: "esm",
		entry: { index: "./src/api.ts" },
		outDir: "./api",
		noExternal: [/.*/],
		external: ["node:*"],
		clean: true,
	},
]);
