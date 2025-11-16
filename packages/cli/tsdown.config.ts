import { defineConfig } from "tsdown";

export default defineConfig({
	dts: false,
	minify: true,
	format: "esm",
	entry: ["./src/index.ts"],
	external: ["faire-auth"],
});
