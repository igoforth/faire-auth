"use client";

import type React from "react";
import { useState, useRef, useEffect } from "react";
import { Image } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/lib/use-theme";
import type { StaticImageData } from "next/image";

interface LogoAssets {
	darkPng: StaticImageData;
	whitePng: StaticImageData;
}

interface ContextMenuProps {
	logo: React.ReactNode;
	logoAssets: LogoAssets;
}

export default function LogoContextMenu({
	logo,
	logoAssets,
}: ContextMenuProps) {
	const [showMenu, setShowMenu] = useState<boolean>(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const logoRef = useRef<HTMLDivElement>(null);
	const { theme } = useTheme();

	const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		e.stopPropagation();
		const rect = logoRef.current?.getBoundingClientRect();
		if (rect) {
			setShowMenu(true);
		}
	};

	const downloadPng = (
		e: React.MouseEvent,
		pngData: StaticImageData,
		fileName: string,
	) => {
		e.preventDefault();
		e.stopPropagation();
		const link = document.createElement("a");
		link.href = pngData.src;
		link.download = fileName;

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		toast.success(`Downloading the asset...`);

		setShowMenu(false);
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				setShowMenu(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, []);

	const getAsset = <T,>(darkAsset: T, lightAsset: T): T => {
		return theme === "dark" ? darkAsset : lightAsset;
	};

	return (
		<div className="relative h-full">
			<div
				ref={logoRef}
				onContextMenu={handleContextMenu}
				className="cursor-pointer h-full"
			>
				{logo}
			</div>

			{showMenu && (
				<div
					ref={menuRef}
					className="fixed mx-10 z-50 bg-white dark:bg-black border border-gray-200 dark:border-border p-1 rounded-sm shadow-xl w-56 overflow-hidden animate-fd-dialog-in duration-500"
				>
					<div className="">
						<div className="flex p-0 gap-1 flex-col text-xs">
							<button
								onClick={(e) =>
									downloadPng(
										e,
										getAsset(logoAssets.darkPng, logoAssets.whitePng),
										`faire-auth-banner-${theme}.png`,
									)
								}
								className="flex items-center gap-3 w-full p-2 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 rounded-md transition-colors cursor-pointer"
							>
								<div className="flex items-center">
									<span className="text-gray-400 dark:text-zinc-400/30">[</span>
									<Image className="h-[13.8px] w-[13.8px] mx-[3px]" />
									<span className="text-gray-400 dark:text-zinc-400/30">]</span>
								</div>
								<span>Download Banner PNG</span>
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
