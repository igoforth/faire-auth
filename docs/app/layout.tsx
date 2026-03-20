import { Navbar } from "@/components/nav-bar";
import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";
import { NavbarProvider } from "@/components/nav-mobile";
import { Inter, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { CustomSearchDialog } from "@/components/search-dialog";
import { AnchorScroll } from "@/components/anchor-scroll-fix";

const inter = Inter({
	subsets: ["latin"],
	variable: "--font-sans",
	display: "swap",
});

const cormorant = Cormorant_Garamond({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	style: ["normal", "italic"],
	variable: "--font-display",
	display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	display: "swap",
});

export const metadata = createMetadata({
	title: {
		template: "%s | Faire Auth",
		default: "Faire Auth",
	},
	description: "The most comprehensive authentication library for TypeScript.",
	metadataBase: baseUrl,
});

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon/favicon.ico" sizes="any" />
				<script
					dangerouslySetInnerHTML={{
						__html: `
                    try {
                      if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                        document.querySelector('meta[name="theme-color"]').setAttribute('content')
                      }
                    } catch (_) {}
                  `,
					}}
				/>
			</head>
			<body
				className={`${inter.variable} ${cormorant.variable} ${jetbrainsMono.variable} bg-background font-sans relative `}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem
					disableTransitionOnChange
				>
					<RootProvider
						theme={{
							enableSystem: true,
							defaultTheme: "dark",
						}}
						search={{
							enabled: true,
							SearchDialog: process.env.ORAMA_PRIVATE_API_KEY
								? CustomSearchDialog
								: undefined,
						}}
					>
						<AnchorScroll />
						<NavbarProvider>
							<Navbar />
							{children}
							<Toaster
								toastOptions={{
									style: {
										borderRadius: "8px",
										fontSize: "11px",
									},
								}}
							/>
						</NavbarProvider>
					</RootProvider>
					<Analytics />
				</ThemeProvider>
			</body>
		</html>
	);
}
