"use client";

import { useEffect, useState } from "react";
import useMeasure from "react-use-measure";
import Link from "next/link";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { useTheme } from "@/lib/use-theme";
import { Highlight, themes } from "prism-react-renderer";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Builder } from "../builder";

const tabs: { name: "config.ts" | "app.ts" | "client.ts"; code: string }[] = [
	{
		name: "config.ts",
		code: `export const cfg = defineOptions({
  baseURL: "http://localhost:3000",
  plugins: [organization(), twoFactor()],
  middleware: {
    getSession: async (ctx, next) =>
      await next(),
  },
  rateLimit: { enabled: true },
})`,
	},
	{
		name: "app.ts",
		code: `const { $Infer } = faireAuth(cfg)
export const App = $Infer.App(cfg)
export const Api = $Infer.Api(App)`,
	},
	{
		name: "client.ts",
		code: `const client = createAuthClient<
  typeof App
>()({})

await client.getSession.$get()`,
	},
];

export default function Hero() {
	return (
		<section className="relative w-full min-h-[33vh] flex flex-col items-center justify-center px-4 py-12 md:py-16">
			<div className="flex flex-col items-center gap-6 max-w-4xl mx-auto w-full">
				<div className="flex items-center gap-2">
					<span className="inline-block w-2 h-2 rounded-full bg-brand-red" />
					<span className="inline-block w-2 h-2 rounded-full bg-brand-yellow" />
					<span className="inline-block w-2 h-2 rounded-full bg-brand-blue" />
				</div>

				<h1 className="text-center tracking-tight text-3xl md:text-5xl text-foreground text-balance">
					<span className="whitespace-nowrap">Better Auth</span>
					{" + "}
					<span className="whitespace-nowrap">Hono</span>
					{" = "}
					<span className="whitespace-nowrap">
						<span className="font-display italic font-bold text-4xl md:text-6xl">
							Faire
						</span>{" "}
						<span className="font-sans font-medium">Auth</span>
					</span>
				</h1>

				<div className="flex flex-wrap items-center justify-center gap-3 mt-2">
					<Link
						href="/docs"
						className="rounded-md bg-foreground text-background px-6 py-2 text-sm font-medium transition hover:opacity-90"
					>
						Get Started
					</Link>
					<Builder />
				</div>

				<div className="w-full max-w-2xl mt-4">
					<CodePreview />
				</div>
			</div>
		</section>
	);
}

function TrafficLightsIcon(props: React.ComponentPropsWithoutRef<"svg">) {
	return (
		<svg aria-hidden="true" viewBox="0 0 42 10" fill="none" {...props}>
			<circle cx="5" cy="5" r="4.5" />
			<circle cx="21" cy="5" r="4.5" />
			<circle cx="37" cy="5" r="4.5" />
		</svg>
	);
}

function CodePreview() {
	const [currentTab, setCurrentTab] = useState<
		"config.ts" | "app.ts" | "client.ts"
	>("config.ts");

	const theme = useTheme();

	const code = tabs.find((tab) => tab.name === currentTab)?.code ?? "";
	const [copyState, setCopyState] = useState(false);
	const [ref, { height }] = useMeasure();
	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text).then(() => {
			setCopyState(true);
			setTimeout(() => {
				setCopyState(false);
			}, 2000);
		});
	};

	const [codeTheme, setCodeTheme] = useState(themes.synthwave84);

	useEffect(() => {
		setCodeTheme(
			theme.resolvedTheme === "light" ? themes.oneLight : themes.synthwave84,
		);
	}, [theme.resolvedTheme]);

	return (
		<AnimatePresence initial={false}>
			<MotionConfig transition={{ duration: 0.5, type: "spring", bounce: 0 }}>
				<motion.div
					animate={{ height: height > 0 ? height : "auto" }}
					className="relative overflow-hidden rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm"
				>
					<div ref={ref}>
						<div className="pl-4 pt-4">
							<TrafficLightsIcon className="stroke-muted-foreground/30 h-2.5 w-auto" />

							<div className="mt-4 flex space-x-2 text-xs">
								{tabs.map((tab) => (
									<button
										key={tab.name}
										onClick={() => setCurrentTab(tab.name)}
										className={clsx(
											"relative isolate flex h-6 cursor-pointer items-center justify-center rounded-full px-2.5",
											currentTab === tab.name
												? "text-foreground"
												: "text-muted-foreground",
										)}
									>
										{tab.name}
										{tab.name === currentTab && (
											<motion.div
												layoutId="tab-code-preview"
												className="bg-muted absolute inset-0 -z-10 rounded-full"
											/>
										)}
									</button>
								))}
							</div>

							<div className="mt-6 flex flex-col items-start px-1 text-sm">
								<div className="absolute top-2 right-4">
									<Button
										variant="outline"
										size="icon"
										className="absolute w-5 border-none bg-transparent h-5 top-2 right-0"
										onClick={() => copyToClipboard(code)}
									>
										{copyState ? (
											<Check className="h-3 w-3" />
										) : (
											<Copy className="h-3 w-3" />
										)}
										<span className="sr-only">Copy code</span>
									</Button>
								</div>
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									transition={{ duration: 0.5 }}
									key={currentTab}
									className="relative flex items-start px-1 text-sm"
								>
									<div
										aria-hidden="true"
										className="border-border/10 text-muted-foreground select-none border-r pr-4 font-mono"
									>
										{Array.from({
											length: code.split("\n").length,
										}).map((_, index) => (
											<div key={index}>
												{(index + 1).toString().padStart(2, "0")}
												<br />
											</div>
										))}
									</div>
									<Highlight
										key={theme.resolvedTheme}
										code={code}
										language={"javascript"}
										theme={{
											...codeTheme,
											plain: {
												backgroundColor: "transparent",
											},
										}}
									>
										{({
											className,
											style,
											tokens,
											getLineProps,
											getTokenProps,
										}) => (
											<pre
												className={clsx(className, "flex overflow-x-auto pb-6")}
												style={style}
											>
												<code className="px-4">
													{tokens.map((line, lineIndex) => (
														<div key={lineIndex} {...getLineProps({ line })}>
															{line.map((token, tokenIndex) => (
																<span
																	key={tokenIndex}
																	{...getTokenProps({ token })}
																/>
															))}
														</div>
													))}
												</code>
											</pre>
										)}
									</Highlight>
								</motion.div>
							</div>
						</div>
					</div>
				</motion.div>
			</MotionConfig>
		</AnimatePresence>
	);
}
