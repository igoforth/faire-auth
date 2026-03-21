"use client";
import { useState } from "react";
import { Button } from "./ui/button";

const CHARSET =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const generateRandomString = (length: number): string => {
	const maxValid = Math.floor(256 / CHARSET.length) * CHARSET.length;
	const buf = new Uint8Array(length * 2);
	let result = "";
	let bufIndex = buf.length;

	while (result.length < length) {
		if (bufIndex >= buf.length) {
			crypto.getRandomValues(buf);
			bufIndex = 0;
		}
		const rand = buf[bufIndex++]!;
		if (rand < maxValid) {
			result += CHARSET[rand % CHARSET.length];
		}
	}
	return result;
};

export const GenerateSecret = () => {
	const [generated, setGenerated] = useState(false);
	return (
		<div className="my-2">
			<Button
				variant="outline"
				size="sm"
				disabled={generated}
				onClick={() => {
					const elements = document.querySelectorAll("pre code span.line span");
					for (let i = 0; i < elements.length; i++) {
						if (elements[i].textContent === "FAIRE_AUTH_SECRET=") {
							elements[i].textContent =
								`FAIRE_AUTH_SECRET=${generateRandomString(32)}`;
							setGenerated(true);
							setTimeout(() => {
								elements[i].textContent = "FAIRE_AUTH_SECRET=";
								setGenerated(false);
							}, 5000);
						}
					}
				}}
			>
				{generated ? "Generated" : "Generate Secret"}
			</Button>
		</div>
	);
};
