import type { HonoRequest } from "hono/request";

import type { FaireAuthOptions } from "../types/options";
import { isTest } from "@faire-auth/core/env";

const isValidIP = (ip: string): boolean => {
	const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
	if (ipv4Regex.test(ip)) {
		const parts = ip.split(".").map(Number);
		return parts.every((part) => part >= 0 && part <= 255);
	}

	const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
	return ipv6Regex.test(ip);
};

export const getIp = (
	req: Headers | HonoRequest,
	options: Pick<FaireAuthOptions, "advanced">,
): null | string => {
	if (options.advanced?.ipAddress?.disableIpTracking === true) return null;
	const testIP = "127.0.0.1";
	if (isTest()) return testIP;

	const headers =
		"raw" in req && "headers" in req.raw ? req.raw.headers : (req as Headers);
	const defaultHeaders = ["x-forwarded-for"];
	const ipHeaders =
		options.advanced?.ipAddress?.ipAddressHeaders ?? defaultHeaders;

	for (const key of ipHeaders) {
		const value = "get" in headers ? headers.get(key) : headers[key];
		if (typeof value === "string") {
			const ip = value.split(",")[0]?.trim();
			if (ip != null && isValidIP(ip)) return ip;
		}
	}
	return null;
};
