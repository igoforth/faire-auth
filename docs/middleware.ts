import { chainMiddleware } from "@/lib/middlewares/chain";
import { withCSP } from "@/lib/middlewares/csp";
import { withNonce } from "@/lib/middlewares/nonce";
import { createStateMiddleware } from "@/lib/middlewares/state";

const {
	withState,
	getState,
	setState,
	slipRequest,
	slipResponse,
	addHeaderToResponse,
} = createStateMiddleware();

export default chainMiddleware([
	withState,
	withNonce,
	withCSP,
]);

export {
	getState,
	setState,
	slipRequest,
	slipResponse,
	addHeaderToResponse,
};

export const config = {
	matcher: [
		{
			source:
				"/((?!api|_next/static|_next/image|favicon|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.avif|.*\\.map|.*\\.css|.*\\.svg|.*\\.ico|sitemap\\.xml|robots\\.txt).*)",
			missing: [
				{ type: "header", key: "next-router-prefetch" },
				{ type: "header", key: "purpose", value: "prefetch" },
			],
		},
	],
};
