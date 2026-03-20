"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import BannerLight from "../../assets/banner.png";
import BannerDark from "../../assets/banner-dark.png";

export function NavbarBanner() {
	const { resolvedTheme } = useTheme();
	const banner = resolvedTheme === "dark" ? BannerDark : BannerLight;

	return (
		<Image
			src={banner}
			alt="Faire Auth"
			height={28}
			className="h-7 w-auto select-none"
			priority
		/>
	);
}
