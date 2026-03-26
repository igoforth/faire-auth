import "server-only";

import type { NextRequest } from "next/server";
import type { MiddlewareFactory } from "./chain";

export interface RequestState {
	slipRequest?: boolean;
	slipResponse?: boolean;
	metrics?: {
		startTime: number;
		operations: string[];
	};
	responseHeaders?: Headers;
}

export const createStateMiddleware = () => {
	const state = new WeakMap<NextRequest, RequestState>();

	const withState: MiddlewareFactory = (next) => async (request, evt) => {
		const responseHeaders = new Headers();
		state.set(request, {
			slipRequest: false,
			slipResponse: false,
			metrics: {
				startTime: performance.now(),
				operations: [],
			},
			responseHeaders,
		});

		try {
			const response = await next(request, evt);

			if (!(response instanceof Response)) return response;

			const requestState = state.get(request);
			if (!requestState) return response;

			if (requestState.metrics) {
				const duration = performance.now() - requestState.metrics.startTime;
				addHeaderToResponse(request, "X-Duration", `${duration}ms`);
				addHeaderToResponse(
					request,
					"X-Operations",
					requestState.metrics.operations.join(","),
				);
			}

			// Add headers to response
			if (requestState.responseHeaders)
				for (const [key, value] of requestState.responseHeaders.entries())
					response.headers.set(key, value);

			return response;
		} finally {
			state.delete(request);
		}
	};

	const getState = (request: NextRequest): RequestState | undefined =>
		state.get(request);
	const setState = (request: NextRequest, updates: Partial<RequestState>) => {
		const current = state.get(request) ?? {};
		state.set(request, { ...current, ...updates });
	};
	const slipRequest = (request: NextRequest): boolean =>
		request && state.get(request)?.slipRequest === true;
	const slipResponse = (request: NextRequest): boolean =>
		request && state.get(request)?.slipResponse === true;
	const addHeaderToResponse = (
		request: NextRequest,
		name: string,
		value: string,
	): void => {
		const current = state.get(request) ?? {};
		if (current.responseHeaders) current.responseHeaders.set(name, value);
		else current.responseHeaders = new Headers();
	};

	return {
		withState,
		getState,
		setState,
		slipRequest,
		slipResponse,
		addHeaderToResponse,
	};
};
