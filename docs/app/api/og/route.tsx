import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const ogSchema = z.object({
	heading: z.string(),
	mode: z.string(),
	type: z.string(),
});
export async function GET(req: Request) {
	try {
		const fontDir = join(process.cwd(), "assets");
		const inter = await readFile(join(fontDir, "Inter.ttf"));
		const interSemiBold = await readFile(join(fontDir, "InterSemiBold.ttf"));
		const cormorant = await readFile(
			join(fontDir, "CormorantGaramond-SemiBoldItalic.ttf"),
		);
		const url = new URL(req.url);
		const urlParamsValues = Object.fromEntries(url.searchParams);
		const validParams = ogSchema.parse(urlParamsValues);
		const { heading, type } = validParams;
		const trueHeading =
			heading.length > 140 ? `${heading.substring(0, 140)}...` : heading;

		const paint = "#ece8e5";

		const fontSize = trueHeading.length > 100 ? "30px" : "60px";
		return new ImageResponse(
			<div
				tw="flex w-full relative flex-col p-12"
				style={{
					color: paint,
					background: "#040504",
				}}
			>
				<div
					tw={`relative flex flex-col w-full h-full border border-[${paint}]/20 p-10 rounded-lg`}
				>
					<div tw="flex flex-col flex-1 py-10">
						<div tw="flex items-center gap-3 mb-6">
							<div
								tw="flex rounded-full w-3 h-3"
								style={{ backgroundColor: "#e33a31" }}
							/>
							<div
								tw="flex rounded-full w-3 h-3"
								style={{ backgroundColor: "#ffdf16" }}
							/>
							<div
								tw="flex rounded-full w-3 h-3"
								style={{ backgroundColor: "#0067a7" }}
							/>
						</div>
						<div
							style={{ fontFamily: "Inter", fontWeight: 400 }}
							tw="relative flex mt-6 text-xl uppercase gap-2 items-center"
						>
							{type === "documentation" ? (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="1.2em"
									height="1.2em"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										fillRule="evenodd"
										d="M4.172 3.172C3 4.343 3 6.229 3 10v4c0 3.771 0 5.657 1.172 6.828S7.229 22 11 22h2c3.771 0 5.657 0 6.828-1.172S21 17.771 21 14v-4c0-3.771 0-5.657-1.172-6.828S16.771 2 13 2h-2C7.229 2 5.343 2 4.172 3.172M8 9.25a.75.75 0 0 0 0 1.5h8a.75.75 0 0 0 0-1.5zm0 4a.75.75 0 0 0 0 1.5h5a.75.75 0 0 0 0-1.5z"
										clipRule="evenodd"
									></path>
								</svg>
							) : null}
							{type}
						</div>
						<div
							tw="flex max-w-[70%] mt-5 tracking-tighter text-[30px]"
							style={{
								fontWeight: 600,
								marginLeft: "-3px",
								fontSize,
								fontFamily: "InterSemiBold",
								alignItems: "flex-end",
								lineHeight: 1,
							}}
						>
							{trueHeading.split(/(Faire)/g).map((part, i) =>
								part === "Faire" ? (
									<span
										key={i}
										style={{
											fontFamily: "CormorantGaramond",
											fontStyle: "italic",
											fontSize: "1.2em",
											lineHeight: "0.75",
											marginRight: "0.1em",
											marginBottom: "0.065em",
										}}
									>
										Faire
									</span>
								) : (
									<span key={i} style={{ lineHeight: 1 }}>
										{part}
									</span>
								),
							)}
						</div>
					</div>
					<div tw="flex items-center w-full justify-between">
						<div
							tw="flex text-xl"
							style={{
								alignItems: "flex-end",
								lineHeight: 1,
							}}
						>
							<span
								style={{
									fontFamily: "CormorantGaramond",
									fontWeight: 600,
									fontStyle: "italic",
									fontSize: "1.2em",
									lineHeight: "0.75",
									marginRight: "8px",
									marginBottom: "0.065em",
								}}
							>
								Faire
							</span>
							<span
								style={{
									fontFamily: "InterSemiBold",
									fontWeight: 600,
									lineHeight: 1,
								}}
							>
								Auth
							</span>
						</div>
						<div tw="flex gap-2 items-center text-xl">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.2em"
								height="1.2em"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
								></path>
							</svg>
							<span
								style={{ fontFamily: "Inter" }}
								tw="flex ml-2"
							>
								github.com/igoforth/faire-auth
							</span>
						</div>
					</div>
				</div>
			</div>,
			{
				width: 1200,
				height: 630,
				fonts: [
					{
						name: "Inter",
						data: inter,
						weight: 400,
						style: "normal",
					},
					{
						name: "InterSemiBold",
						data: interSemiBold,
						weight: 600,
						style: "normal",
					},
					{
						name: "CormorantGaramond",
						data: cormorant,
						weight: 600,
						style: "italic",
					},
				],
			},
		);
	} catch (err) {
		console.log({ err });
		return new Response("Failed to generate the og image", { status: 500 });
	}
}
