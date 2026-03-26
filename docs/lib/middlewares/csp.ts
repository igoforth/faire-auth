import "server-only";

import type { NextFetchEvent, NextRequest } from "next/server";
import type { MiddlewareFactory, NextMiddleware } from "./chain";
import { addHeaderToResponse, slipRequest } from "@/middleware";
import { CSPBuilder } from "./csp-builder";

const builder = CSPBuilder.createDefault({
	isDev: process.env.NODE_ENV === "development",
	siteUrl: process.env.NEXT_PUBLIC_URL,
});

const withCSP: MiddlewareFactory =
	(next: NextMiddleware) =>
	async (request: NextRequest, evt: NextFetchEvent) => {
		if (slipRequest(request)) return next(request, evt);

		const nonce = request.headers.get("x-nonce");
		const cspHeader = builder.build({
			...(nonce ? { nonce } : {}),
		});

		addHeaderToResponse(request, "Content-Security-Policy", cspHeader);
		addHeaderToResponse(
			request,
			"Cross-Origin-Opener-Policy",
			"same-origin",
		);
		addHeaderToResponse(request, "Cross-Origin-Resource-Policy", "same-site");
		addHeaderToResponse(
			request,
			"Cross-Origin-Embedder-Policy",
			"unsafe-none",
		);

		return next(request, evt);
	};

export { withCSP };
