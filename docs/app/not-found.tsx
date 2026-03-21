import Link from "next/link";
export default function NotFound() {
	return (
		<div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 px-4">
			<div className="flex items-center gap-2">
				<span className="inline-block w-3 h-3 rounded-full bg-brand-red" />
				<span className="inline-block w-3 h-3 rounded-full bg-brand-yellow" />
				<span className="inline-block w-3 h-3 rounded-full bg-brand-blue" />
			</div>
			<h1 className="text-8xl font-normal text-foreground">404</h1>
			<p className="text-lg text-muted-foreground">
				Lost at the{" "}
				<span className="font-display italic font-semibold text-foreground text-xl">
					faire
				</span>
				?
			</p>
			<Link
				href="/docs"
				className="rounded-md bg-foreground text-background px-6 py-2 text-sm font-medium transition hover:opacity-90"
			>
				Back to the docs
			</Link>
		</div>
	);
}
