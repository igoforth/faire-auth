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

const message = `\n\n\x1b[36mFaire Auth\x1b[0m — Anonymous telemetry notice
\nWe collect minimal, completely anonymous usage telemetry to help improve Faire Auth.

You can disable it at any time:
  • In your auth config: \x1b[33mtelemetry: { enabled: false }\x1b[0m
  • Or via env: \x1b[33mFAIRE_AUTH_TELEMETRY=0\x1b[0m

You can also debug what would be sent by setting:
  • \x1b[33mFAIRE_AUTH_TELEMETRY_DEBUG=1\x1b[0m

Learn more in the docs: https://www.faire-auth.com/docs/reference/telemetry \n\n`;

/* ------------------------------------------------------------------ */
/* Helper utilities                                                     */
/* ------------------------------------------------------------------ */

let pathMod: typeof import("path") | undefined;
let osMod: typeof import("os") | undefined;
let fsPromisesMod: typeof import("fs/promises") | undefined;

async function importDeps() {
	if (!pathMod) pathMod = await import("path");
	if (!osMod) osMod = await import("os");
	if (!fsPromisesMod) fsPromisesMod = await import("fs/promises");
}

async function configFilePath() {
	await importDeps();
	const baseDir =
		typeof process !== "undefined" && process.platform === "win32"
			? process.env["APPDATA"] ||
				pathMod!.join(osMod!.homedir(), "AppData", "Roaming")
			: pathMod!.join(osMod!.homedir(), ".config");
	const dir = pathMod!.join(baseDir, "faire-auth");
	const file = pathMod!.join(dir, "telemetry.json");
	return { file, dir };
}

const shownNoticeInProcess = new Set<string>();

async function hasShownNoticeBefore(anonymousId: string) {
	try {
		const { file } = await configFilePath();
		await importDeps();
		const raw = await fsPromisesMod!.readFile(file, "utf-8");
		const json = JSON.parse(raw) as { seen?: string[] };
		return Array.isArray(json.seen) && json.seen.includes(anonymousId);
	} catch (err: unknown) {
		if (
			err &&
			typeof err === "object" &&
			"code" in err &&
			(err as NodeJS.ErrnoException).code === "ENOENT"
		) {
			return false;
		}
		return true;
	}
}

async function markNoticeShown(anonymousId: string) {
	try {
		await importDeps();
		const { file, dir } = await configFilePath();
		await fsPromisesMod!.mkdir(dir, { recursive: true });
		let json: { seen: string[] } = { seen: [] };
		try {
			const raw = await fsPromisesMod!.readFile(file, "utf-8");
			const parsed = JSON.parse(raw) as { seen?: string[] };
			json.seen = Array.isArray(parsed.seen) ? parsed.seen : [];
		} catch {}
		if (!json.seen.includes(anonymousId)) {
			json.seen.push(anonymousId);
		}
		await fsPromisesMod!.writeFile(
			file,
			JSON.stringify(json, null, 2),
			"utf-8",
		);
	} catch {}
}

async function maybeShowTelemetryNotice(anonymousId: string) {
	if (shownNoticeInProcess.has(anonymousId)) return;
	if (typeof process !== "undefined" && process.stdout && !process.stdout.isTTY)
		return;
	if (await hasShownNoticeBefore(anonymousId)) {
		shownNoticeInProcess.add(anonymousId);
		return;
	}
	try {
		console.log(message);
	} catch {}
	shownNoticeInProcess.add(anonymousId);
	await markNoticeShown(anonymousId);
}

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

	const disableNotice =
		options.telemetry?.disableNotice ||
		getBooleanEnvVar("FAIRE_AUTH_TELEMETRY_DISABLE_NOTICE", false);

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

			if (enabled && !disableNotice)
				await maybeShowTelemetryNotice(anonymousId);

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
