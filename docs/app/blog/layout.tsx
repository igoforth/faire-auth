import { Metadata } from "next";

export const metadata: Metadata = {
	title: "Blog - Faire Auth",
	description: "Latest updates, articles, and insights about Faire Auth",
};

interface BlogLayoutProps {
	children: React.ReactNode;
}

export default function BlogLayout({ children }: BlogLayoutProps) {
	return (
		<div
			className="relative flex min-h-screen flex-col"
			style={{
				scrollbarWidth: "none",
			}}
		>
			<main className="flex-1">{children}</main>
		</div>
	);
}
