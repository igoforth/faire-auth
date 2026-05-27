import type { UserConfig } from "tsdown";
import { defineConfig } from "tsdown";

const shared: Pick<
	UserConfig,
	"format" | "external" | "treeshake" | "nodeProtocol" | "publint"
> = {
	format: ["esm", "cjs"],
	external: [
		"prisma",
		"@prisma/client",
		"better-sqlite3",
		"react",
		"vue",
		"solid-js",
		"solid-js/store",
		"next/headers",
		"$app/environment",
		"vitest",
		"@vitest/runner",
		"@vitest/utils",
		"@vitest/expect",
		"@vitest/snapshot",
		"@vitest/spy",
		"chai",
		"mongodb",
		"drizzle-orm",
		"pathe",
		"std-env",
		"magic-string",
		"pretty-format",
		"p-limit",
		"tinyspy",
		"next/dist/compiled/@edge-runtime/cookies",
		"@tanstack/react-start",
		"@tanstack/start-server-core",
		"bson",
		"mongodb-connection-string-url",
		"@mongodb-js/saslprep",
		"kerberos",
		"@mongodb-js/zstd",
		"nanostores",
		"@aws-sdk/credential-providers",
		"mongodb-client-encryption",
		"@vue/runtime-dom",
		"@vue/runtime-core",
		"@vue/shared",
		"@vue/reactivity",
		"@vue/compiler-dom",
		"@vue/compiler-core",
		"@babel/types",
		"@babel/parser",
		"punycode",
		"@sveltejs/kit",
		"svelte/compiler",
		"@sveltejs/vite-plugin-svelte",
		"csstype",
		"siwe",
		"@lynx-js/react",
		"hono",
		"cbor-x",
	],
	treeshake: true,
	nodeProtocol: true,
	publint: true,
};

// Modules whose types are statically imported by 2+ entry subpaths and would
// otherwise be auto-extracted by rolldown into an un-exported, hash-named
// `.d.ts` chunk. Capturing them into ONE stable-named `shared` chunk makes the
// shared contract/client types nameable by consumers via `faire-auth/shared`.
const SHARED_MODULES =
	/[\\/]src[\\/](client[\\/]types|client[\\/]hono|types[\\/]options|types[\\/]plugin|types[\\/]hono|api[\\/]factory[\\/]endpoint|api[\\/]types)(\.d)?\.ts$/;

export default defineConfig([
	{
		...shared,
		dts: { build: true, incremental: true },
		outputOptions(options) {
			options.advancedChunks ??= {};
			options.advancedChunks.groups = [
				{
					// rolldown-plugin-dts bundles the JS (`.ts`) and declaration
					// (`.d.ts`) variants of a module in the same rolldown graph and
					// splits them by chunk name suffix at emit time. A static group
					// name would collapse both into one chunk; a name FUNCTION that
					// returns distinct names for `.ts` vs `.d.ts` creates two groups
					// -> two chunks (`shared` JS, `shared.d` declarations), letting
					// the dts pass produce a real `shared.d.*ts` file.
					name: (id) =>
						SHARED_MODULES.test(id)
							? id.endsWith(".d.ts")
								? "shared.d"
								: "shared"
							: null,
					// capture regardless of how many entries reference it
					minShareCount: 1,
					minSize: 0,
				},
				...(options.advancedChunks.groups ?? []),
			];
			// Give the `shared` group a stable (un-hashed) filename while keeping
			// hashes for every other chunk. tsdown's default chunkFileNames is a
			// function whose returned template still contains `[name]`/`[hash]`
			// placeholders for rolldown to substitute; for the shared chunk we
			// strip `-[hash]` so the path is stable and referenceable from the
			// package `exports`.
			const base = options.chunkFileNames;
			options.chunkFileNames = (chunk) => {
				const template =
					typeof base === "function"
						? base(chunk)
						: (base ?? "[name]-[hash].mjs");
				// Strip the hash for the shared group so its path is stable and
				// addressable from `exports`. The declaration chunk is named
				// `shared.d` (rolldown-plugin-dts's fake-js pass converts the
				// returned JS-style template into the matching `.d.*ts` name);
				// the JS chunk is named `shared`.
				if (chunk.name === "shared" || chunk.name === "shared.d") {
					return template.replace("-[hash]", "");
				}
				return template;
			};
			return options;
		},
		entry: [
			"./src/index.ts",
			"./src/social-providers/index.ts",
			"./src/client/index.ts",
			"./src/client/plugins/index.ts",
			"./src/types/index.ts",
			"./src/crypto/index.ts",
			"./src/utils/cookies.ts",
			"./src/adapters/prisma-adapter/index.ts",
			"./src/adapters/drizzle-adapter/index.ts",
			"./src/adapters/mongodb-adapter/index.ts",
			"./src/adapters/kysely-adapter/index.ts",
			"./src/adapters/memory-adapter/index.ts",
			"./src/adapters/test.ts",
			"./src/adapters/index.ts",
			"./src/db/index.ts",
			"./src/oauth2/index.ts",
			"./src/client/react/index.ts",
			"./src/client/vue/index.ts",
			"./src/client/svelte/index.ts",
			"./src/client/solid/index.ts",
			"./src/client/lynx/index.ts",
			"./src/plugins/index.ts",
			"./src/plugins/access/index.ts",
			"./src/api/index.ts",
			"./src/api/middleware/index.ts",
			"./src/integrations/svelte-kit.ts",
			"./src/integrations/solid-start.ts",
			"./src/integrations/next-js.ts",
			"./src/integrations/react-start.ts",
			"./src/integrations/node.ts",
			"./src/plugins/bearer/index.ts",
			"./src/plugins/passkey/index.ts",
		],
		clean: true,
	},
	{
		...shared,
		dts: { build: true, incremental: true },
		entry: ["./src/test-utils/index.ts"],
		outDir: "./dist/test-utils",
		publint: false,
	},
]);
