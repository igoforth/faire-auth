import { APIError } from "@faire-auth/core/error";
import { emailSchema } from "@faire-auth/core/factory";
import type { Context, TypedResponse } from "hono";
import * as z from "zod";
import { generateRandomString } from "../crypto";
import type { ContextVars } from "../types/hono";
import type { FaireAuthOptions } from "../types/options";

export const generateState = async <V extends object>(
	ctx: Context<
		ContextVars<V>,
		string,
		{
			out: {
				json: {
					callbackURL?: string | undefined;
					errorCallbackURL?: string | undefined;
					newUserCallbackURL?: string | undefined;
					requestSignUp?: boolean | undefined;
				};
			};
		}
	>,
	link?: { email: string; userId: string },
	options?: Pick<FaireAuthOptions, "baseURL">,
) => {
	let { callbackURL, errorCallbackURL, newUserCallbackURL, requestSignUp } =
		ctx.req.valid("json");

	callbackURL = callbackURL ?? options?.baseURL;
	if (callbackURL == null)
		throw new APIError("BAD_REQUEST", {
			message: "callbackURL or baseURL is required",
		});

	const context = ctx.get("context");
	const codeVerifier = generateRandomString(128);
	const state = generateRandomString(32);
	const data = JSON.stringify({
		callbackURL,
		codeVerifier,
		...(errorCallbackURL && { errorURL: errorCallbackURL }),
		...(newUserCallbackURL && { newUserURL: newUserCallbackURL }),
		/**
		 * This is the actual expiry time of the state
		 */
		expiresAt: Date.now() + 10 * 60 * 1000,
		...(link && { link }),
		...(requestSignUp && { requestSignUp }),
	});
	const expiresAt = new Date();
	expiresAt.setMinutes(expiresAt.getMinutes() + 10);
	const verification = await context.internalAdapter.createVerificationValue({
		value: data,
		identifier: state,
		expiresAt,
	});
	if (verification == null) {
		context.logger.error(
			"Unable to create verification. Make sure the database adapter is properly working and there is a verification table in the database",
		);
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Unable to create verification",
		});
	}
	return { state: verification.identifier, codeVerifier };
};

const parsingSchema = z.object({
	callbackURL: z.string(),
	codeVerifier: z.string(),
	errorURL: z.string().optional(),
	newUserURL: z.string().optional(),
	expiresAt: z.number(),
	link: z.object({ email: emailSchema, userId: z.coerce.string() }).optional(),
	requestSignUp: z.boolean().optional(),
});

export const parseState = async <V extends object>(
	ctx: Context<
		ContextVars<V>,
		string,
		{
			out: {
				query: { state?: string | undefined };
				json: { state?: string | undefined };
			};
		}
	>,
	options: Pick<FaireAuthOptions, "onAPIError">,
): Promise<
	| { type: "success"; data: z.output<typeof parsingSchema> }
	| {
			type: "redirect";
			response: Response & TypedResponse<undefined, 302, "redirect">;
	  }
> => {
	let state: string;
	try {
		state = ctx.req.valid("json").state as string;
	} catch {
		state = ctx.req.valid("query").state as string;
	}

	const context = ctx.get("context");
	const data = await context.internalAdapter.findVerificationValue(state);
	if (data == null) {
		context.logger.error("State Mismatch. Verification not found", {
			state,
		});
		const errorURL = options.onAPIError?.errorURL ?? `${context.baseURL}/error`;
		return {
			type: "redirect",
			response: ctx.redirect(
				`${errorURL}?error=please_restart_the_process`,
				302,
			),
		};
	}

	const parsedData = parsingSchema.parse(JSON.parse(data.value));
	parsedData.errorURL ??= `${context.baseURL}/error`;

	if (parsedData.expiresAt < Date.now()) {
		await context.internalAdapter.deleteVerificationValue(data.id);
		const errorURL = options.onAPIError?.errorURL ?? `${context.baseURL}/error`;
		return {
			type: "redirect",
			response: ctx.redirect(
				`${errorURL}?error=please_restart_the_process`,
				302,
			),
		};
	}
	await context.internalAdapter.deleteVerificationValue(data.id);
	return { type: "success", data: parsedData };
};
