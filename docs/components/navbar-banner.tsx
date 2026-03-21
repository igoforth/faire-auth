"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import BannerLight from "../../assets/banner.png";
import BannerDark from "../../assets/banner-dark.png";

export function NavbarBanner() {
	const { resolvedTheme } = useTheme();
	const [mounted, setMounted] = useState(false);

	useEffect(() => setMounted(true), []);

	const imgClass = "h-12 w-auto select-none";

	// Before hydration, render both images and hide one via CSS to avoid mismatch
	if (!mounted) {
		return (
			<>
				<Image
					src={BannerDark}
					alt="Faire Auth"
					height={36}
					className={`${imgClass} hidden dark:block`}
					priority
				/>
				<Image
					src={BannerLight}
					alt="Faire Auth"
					height={36}
					className={`${imgClass} block dark:hidden`}
					priority
				/>
			</>
		);
	}

	const banner = resolvedTheme === "dark" ? BannerDark : BannerLight;

	return (
		<Image
			src={banner}
			alt="Faire Auth"
			height={36}
			className={imgClass}
			priority
		/>
	);
}
