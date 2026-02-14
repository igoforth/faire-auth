import { betterFetch } from "@better-fetch/fetch";

import type { FaireAuthOptions } from "../types/options";
import type { TelemetryContext, TelemetryEvent } from "./types";
import { ENV, getBooleanEnvVar, isTest } from "@faire-auth/core/env";
import { logger } from "@faire-auth/core/env";
import { getTelemetryAuthConfig } from "./detectors/detect-auth-config";
import { detectDatabase } from "./detectors/detect-database";
import { detectFramework } from "./detectors/detect-framework";
import { detectPackageManager } from "./detectors/detect-project-info";
import { detectEnvironment, detectRuntime } from "./detectors/detect-runtime";
import { detectSystemInfo } from "./detectors/detect-system-info";
import { getProjectId } from "./project-id";

/* ------------------------------------------------------------------ */
/* Synchronous telemetry creation                                     */
/* ------------------------------------------------------------------ */

export function createTelemetry(
	options: FaireAuthOptions,
	context?: TelemetryContext,
) {
	const debugEnabled =
		options.telemetry?.debug ||
		getBooleanEnvVar("FAIRE_AUTH_TELEMETRY_DEBUG", false);

	const TELEMETRY_ENDPOINT = ENV.FAIRE_AUTH_TELEMETRY_ENDPOINT;
	const track = async (event: TelemetryEvent) => {
		try {
			if (context?.customTrack) {
				await context.customTrack(event);
			} else {
				if (debugEnabled) {
					await Promise.resolve(
						logger.info("telemetry event", JSON.stringify(event, null, 2)),
					);
				} else {
					await betterFetch(TELEMETRY_ENDPOINT, {
						method: "POST",
						body: event,
					});
				}
			}
		} catch {}
	};

	const isEnabled = () => {
		const telemetryEnabled =
			options.telemetry?.enabled !== undefined
				? options.telemetry.enabled
				: false;
		const envEnabled = getBooleanEnvVar("FAIRE_AUTH_TELEMETRY", false);
		return (
			(envEnabled || telemetryEnabled) && (context?.skipTestCheck || !isTest())
		);
	};

	/* -------------------------------------------------------------- */
	/* Async initialization                                           */
	/* -------------------------------------------------------------- */
	let initDone: Promise<void> | undefined;
	let anonymousId: string | undefined;
	let payload: any | undefined;
	const enabled = isEnabled();

	async function ensureInitialized() {
		if (initDone) return initDone;

		initDone = (async () => {
			anonymousId = await getProjectId(options.baseURL);

			payload = {
				config: getTelemetryAuthConfig(options),
				runtime: detectRuntime(),
				database: await detectDatabase(),
				framework: await detectFramework(),
				environment: detectEnvironment(),
				systemInfo: await detectSystemInfo(),
				packageManager: detectPackageManager(),
			};

			/* Send init event during initialization */
			if (enabled) await track({ type: "init", payload, anonymousId });
		})();

		return initDone;
	}

	return {
		initPromise: ensureInitialized(),
		async publish(event: TelemetryEvent) {
			if (!enabled) return;
			// await ensureInitialized()
			await track({
				type: event.type,
				payload: event.payload,
				anonymousId: anonymousId!,
			});
		},
	};
}
