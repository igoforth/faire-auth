import { defineConfig } from "tsdown";

export default defineConfig({
	dts: false,
	format: ["esm", "cjs"],
	entry: ["./src/client.ts"],
	clean: true,
});
