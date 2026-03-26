import "server-only";

import type { NextFetchEvent, NextRequest } from "next/server";
import type { MiddlewareFactory, NextMiddleware } from "./chain";
import { slipRequest } from "@/middleware";

const withNonce: MiddlewareFactory =
	(next: NextMiddleware) =>
	async (request: NextRequest, evt: NextFetchEvent) => {
		if (slipRequest(request)) return next(request, evt);

		// TODO: Wait to opt all pages into dynamic rendering
		const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
		request.headers.set("x-nonce", nonce);
		// addHeaderToResponse(request, 'x-nonce', nonce)
		return next(request, evt);
	};

export { withNonce };
