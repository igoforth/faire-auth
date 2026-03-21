"use client";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { kFormatter } from "@/lib/utils";
export default function Stats({
	npmDownloads,
	githubStars,
}: {
	npmDownloads: number;
	githubStars: number;
}) {
	return (
		<div className="relative">
			<div className="md:mx-auto w-full">
				<div className="border border-b-0 rounded-none overflow-hidden border-l-0 border-r-0">
					<div className="flex md:flex-row flex-col w-full dark:[box-shadow:0_-20px_80px_-20px_#dfbf9f1f_inset]">
						<div className="w-full text-center border-r pt-5">
							<div className="relative p-3 ">
								<span className="text-[70px] tracking-tighter font-bold font-mono bg-gradient-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									{kFormatter(npmDownloads)}
								</span>
							</div>
							<div className="flex items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://www.npmjs.com/package/faire-auth"
									rel="noopener noreferrer"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0 border-t-[1px] border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="1.5em"
											height="1.5em"
											viewBox="0 0 128 128"
										>
											<path
												fill="#000"
												d="M0 7.062C0 3.225 3.225 0 7.062 0h113.88c3.838 0 7.063 3.225 7.063 7.062v113.88c0 3.838-3.225 7.063-7.063 7.063H7.062c-3.837 0-7.062-3.225-7.062-7.063zm23.69 97.518h40.395l.05-58.532h19.494l-.05 58.581h19.543l.05-78.075l-78.075-.1l-.1 78.126z"
											></path>
											<path
												fill="#fff"
												d="M25.105 65.52V26.512H40.96c8.72 0 26.274.034 39.008.075l23.153.075v77.866H83.645v-58.54H64.057v58.54H25.105z"
											></path>
										</svg>

										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Downloads
										</span>
										<ArrowUpRight className="w-6 h-6 opacity-20 ml-2 group-hover:opacity-300 duration-300 text-black group-hover:duration-700 dark:text-white" />
									</Button>
								</Link>
							</div>
						</div>

						<div className="w-full text-center pt-5">
							<div className="relative p-3">
								<span className="text-[70px] tracking-tighter font-bold font-mono bg-gradient-to-b dark:from-stone-200 dark:via-stone-400 dark:to-stone-700 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] from-stone-800 via-stone-600 to-stone-400">
									{kFormatter(githubStars)}
								</span>
							</div>
							<div className="flex -p-8 items-end w-full gap-2 mt-4 text-gray-400">
								<Link
									className="w-full"
									href="https://github.com/igoforth/faire-auth"
									rel="noopener noreferrer"
									target="_blank"
								>
									<Button
										variant="outline"
										className="group duration-500 cursor-pointer text-gray-400 flex items-center gap-2 text-md hover:bg-transparent border-l-input/50 border-r-input/50 md:border-r-0 md:border-l-0 border-t-[1px] border-t-input py-7 w-full hover:text-black dark:hover:text-white"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											width="24"
											height="24"
											viewBox="0 0 24 24"
										>
											<g fill="none">
												<path d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z" />
												<path
													fill="currentColor"
													d="M6.315 6.176c-.25-.638-.24-1.367-.129-2.034a6.8 6.8 0 0 1 2.12 1.07c.28.214.647.283.989.18A9.3 9.3 0 0 1 12 5c.961 0 1.874.14 2.703.391c.342.104.709.034.988-.18a6.8 6.8 0 0 1 2.119-1.07c.111.667.12 1.396-.128 2.033c-.15.384-.075.826.208 1.14C18.614 8.117 19 9.04 19 10c0 2.114-1.97 4.187-5.134 4.818c-.792.158-1.101 1.155-.495 1.726c.389.366.629.882.629 1.456v3a1 1 0 0 0 2 0v-3c0-.57-.12-1.112-.334-1.603C18.683 15.35 21 12.993 21 10c0-1.347-.484-2.585-1.287-3.622c.21-.82.191-1.646.111-2.28c-.071-.568-.17-1.312-.57-1.756c-.595-.659-1.58-.271-2.28-.032a9 9 0 0 0-2.125 1.045A11.4 11.4 0 0 0 12 3c-.994 0-1.953.125-2.851.356a9 9 0 0 0-2.125-1.045c-.7-.24-1.686-.628-2.281.031c-.408.452-.493 1.137-.566 1.719l-.005.038c-.08.635-.098 1.462.112 2.283C3.484 7.418 3 8.654 3 10c0 2.992 2.317 5.35 5.334 6.397A4 4 0 0 0 8 17.98l-.168.034c-.717.099-1.176.01-1.488-.122c-.76-.322-1.152-1.133-1.63-1.753c-.298-.385-.732-.866-1.398-1.088a1 1 0 0 0-.632 1.898c.558.186.944 1.142 1.298 1.566c.373.448.869.916 1.58 1.218c.682.29 1.483.393 2.438.276V21a1 1 0 0 0 2 0v-3c0-.574.24-1.09.629-1.456c.607-.572.297-1.568-.495-1.726C6.969 14.187 5 12.114 5 10c0-.958.385-1.881 1.108-2.684c.283-.314.357-.756.207-1.14"
												/>
											</g>
										</svg>

										<span className="uppercase font-mono group-hover:text-black duration-300 dark:group-hover:text-white">
											Stars
										</span>
										<ArrowUpRight className="w-6 h-6 opacity-20 ml-2 group-hover:opacity-300 duration-300 text-black group-hover:duration-700 dark:text-white" />
									</Button>
								</Link>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
