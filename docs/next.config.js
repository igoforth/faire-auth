import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
	allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(",") ?? [],
	reactStrictMode: true,
	poweredByHeader: false,
	cleanDistDir: true,
	typescript: {
		ignoreBuildErrors: true,
	},
	async rewrites() {
		return [
			{
				source: "/docs/:path*.mdx",
				destination: "/llms.txt/:path*",
			},
		];
	},
	redirects: async () => {
		return [
			{
				source: "/docs",
				destination: "/docs/introduction",
				permanent: true,
			},
			{
				source: "/docs/examples",
				destination: "/docs/examples/next-js",
				permanent: true,
			},
		];
	},
	serverExternalPackages: [
		"ts-morph",
		"typescript",
		"oxc-transform",
		"@shikijs/twoslash",
		"@vercel/og",
		"@resvg/resvg-wasm",
	],
	images: {
		unoptimized: true,
	},
	reactCompiler: true,
	experimental: {
		optimizeServerReact: true,
		optimizePackageImports: [
			"next",
			"framer-motion",
			"lucide-react",
			"recharts",
			"@opennextjs/cloudflare",
			"radix-ui",
			"zod",
		],
		parallelServerCompiles: true,
		webpackBuildWorker: true,
		viewTransition: true,
		useSkewCookie: true,
		useCache: true,
	},
	/**
	 * @param {import('webpack').Configuration} config
	 * @returns {import('webpack').Configuration}
	 */
	webpack(config) {
		if (config.output)
			config.output.trustedTypes = {
				policyName: "nextjs#bundler",
			};
		return config;
	},
};

export default withMDX(config);

import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development") initOpenNextCloudflareForDev();
