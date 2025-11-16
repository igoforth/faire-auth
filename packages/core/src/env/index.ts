export { getColorDepth } from "./color-depth";
export {
	ENV,
	env,
	getBooleanEnvVar,
	getEnvVar,
	isCI,
	isDevelopment,
	isProduction,
	isTest,
	nodeENV,
	type EnvObject,
} from "./env-impl";
export {
	createLogger,
	levels,
	logger,
	shouldPublishLog,
	TTY_COLORS,
	type InternalLogger,
	type Logger,
	type LogHandlerParams,
	type LogLevel,
} from "./logger";
