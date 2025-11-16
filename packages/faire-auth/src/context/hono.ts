import { getContext as honoGetContext } from "hono/context-storage";
import type { ContextVars } from "../types/hono";

export { contextStorage } from "hono/context-storage";

export const getContext = <V extends object>() =>
	honoGetContext<ContextVars<V>>();
