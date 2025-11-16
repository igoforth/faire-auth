/// <reference path="../overrides.d.ts" />

export { getCurrentAdapter } from "./context/transaction";
export * from "./auth";
export * from "./utils";
export type * from "./types";
export type { InferApp, InferAPI, InferClient } from "./api";
export type { OpenAPIHono } from "@faire-auth/core/factory";
export {
	APIError,
	FaireAuthError,
	MissingDependencyError,
} from "@faire-auth/core/error";
export type * from "zod";
// @ts-expect-error we need to export core to make sure type annotations works with v4/core
export type * from "zod/v4/core";
// //@ts-expect-error: we need to export helper types even when they conflict with better-call types to avoid "The inferred type of 'auth' cannot be named without a reference to..."
// export type * from "./types/helper";
// export this as we are referencing OAuth2Tokens in the `refresh-token` api as return type

// telemetry exports for CLI and consumers
export { createTelemetry } from "./telemetry";
export { getTelemetryAuthConfig } from "./telemetry/detectors/detect-auth-config";
export type { TelemetryEvent } from "./telemetry/types";
