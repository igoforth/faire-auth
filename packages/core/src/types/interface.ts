import type {
	ContextRenderer,
	ContextVariableMap,
	ExecutionContext,
} from "hono";
import type { HonoRequest } from "hono/request";
import type { Env, FetchEventLike, Input, TypedResponse } from "hono/types";
import type { RedirectStatusCode, StatusCode } from "hono/utils/http-status";
import type { IsAny } from "hono/utils/types";
import type { Context as HonoContext } from "hono";
import type { JSONRespond } from "./json";

type Layout<T = Record<string, any>> = (props: T) => any;
type PropsForRenderer = [...Required<Parameters<Renderer>>] extends [
	unknown,
	infer Props,
]
	? Props
	: unknown;
interface DefaultRenderer {
	(content: string | Promise<string>): Response | Promise<Response>;
}
export type Renderer = ContextRenderer extends Function
	? ContextRenderer
	: DefaultRenderer;
type SetHeaders = HonoContext["header"];
type HonoSet<E extends Env> = HonoContext<E>["set"];
type HonoGet<E extends Env> = HonoContext<E>["get"];
type NewResponse = HonoContext["newResponse"];
type BodyRespond = HonoContext["body"];
type TextRespond = HonoContext["text"];
type HTMLRespond = HonoContext["html"];

export interface Context<
	E extends Env = any,
	P extends string = any,
	I extends Input = {},
> {
	env: E["Bindings"];
	finalized: boolean;
	error: Error | undefined;
	get req(): HonoRequest<P, I["out"]>;
	get event(): FetchEventLike;
	get executionCtx(): ExecutionContext;
	get res(): Response;
	set res(_res: Response | undefined);
	render: Renderer;
	setLayout: (
		layout: Layout<
			PropsForRenderer & {
				Layout: Layout;
			}
		>,
	) => Layout<
		PropsForRenderer & {
			Layout: Layout;
		}
	>;
	getLayout: () =>
		| Layout<
				PropsForRenderer & {
					Layout: Layout;
				}
		  >
		| undefined;
	setRenderer: (renderer: Renderer) => void;
	header: SetHeaders;
	status: (status: StatusCode) => void;
	set: HonoSet<E>;
	get: HonoGet<E>;
	get var(): Readonly<
		ContextVariableMap &
			(IsAny<E["Variables"]> extends true
				? Record<string, any>
				: E["Variables"])
	>;
	newResponse: NewResponse;
	body: BodyRespond;
	text: TextRespond;
	json: JSONRespond;
	html: HTMLRespond;
	redirect: <T extends RedirectStatusCode = 302>(
		location: string | URL,
		status?: T,
	) => Response & TypedResponse<undefined, T, "redirect">;
	notFound: () => Response | Promise<Response>;
}
