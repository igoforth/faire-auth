import * as z from "zod";
import { Routes } from "@faire-auth/core/static";
import { req, res } from "@faire-auth/core/factory";
import { createEndpoint } from "../factory/endpoint";
import { createRoute } from "@faire-auth/core/factory";

const sanitize = (input: string): string =>
	input
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const html = (
	errorCode = "Unknown",
	errorDescription?: string,
) => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Error</title>
    <style>
        :root {
            --bg-color: #f8f9fa;
            --text-color: #212529;
            --accent-color: #000000;
            --error-color: #dc3545;
            --border-color: #e9ecef;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            line-height: 1.5;
        }
        .error-container {
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            padding: 2.5rem;
            text-align: center;
            max-width: 90%;
            width: 400px;
        }
        h1 {
            color: var(--error-color);
            font-size: 1.75rem;
            margin-bottom: 1rem;
            font-weight: 600;
        }
        p {
            margin-bottom: 1.5rem;
            color: #495057;
        }
        .btn {
            background-color: var(--accent-color);
            color: #ffffff;
            text-decoration: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            transition: all 0.3s ease;
            display: inline-block;
            font-weight: 500;
            border: 2px solid var(--accent-color);
        }
        .btn:hover {
            background-color: #131721;
        }
        .error-code {
            font-size: 0.875rem;
            color: #6c757d;
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid var(--border-color);
        }
        .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        .error-description {
          font-size: 0.95rem;
          color: #6c757d;
          margin: -1rem 0 1.5rem;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="icon">!</div>
        <h1>Faire Auth Error</h1>
        <p>We encountered an issue while processing your request. Please try again or contact the application owner if the problem persists.</p>
        ${errorDescription ? `<div class="error-description">${sanitize(errorDescription)}</div>` : ""}
        <a href="/" id="returnLink" class="btn">Return to Application</a>
        <div class="error-code">Error Code: <span id="errorCode">${sanitize(
					errorCode,
				)}</span></div>
    </div>
</body>
</html>`;

const errorQuerySchema = z.object({
	error: z.string().optional(),
	error_description: z.string().optional(),
});

export const errorRoute = createRoute({
	operationId: Routes.ERROR,
	hide: true,
	isAction: false,
	method: "get",
	path: "/error",
	description: "Displays an error page",
	request: req().qry(errorQuerySchema).bld(),
	responses: res(
		z.string().openapi({ description: "The HTML content of the error page" }),
		"A HTML error page",
		"text/html",
	)
		.zod<typeof errorQuerySchema>()
		.bld(),
});

export const error = createEndpoint(errorRoute, (_options) => async (ctx) => {
	const { error, error_description: _error_description } =
		ctx.req.valid("query");
	// TODO: include description if appropriate
	return ctx.html(html(error), 200);
});
