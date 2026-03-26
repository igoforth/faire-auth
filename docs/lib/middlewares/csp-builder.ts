import "server-only";

type CSPOptions = {
	isDev?: boolean;
	siteUrl?: string;
	defaultNonce?: string;
	defaultIsTrustedTypes?: boolean;
};

class CSPBuilder {
	private staticDirectives: Map<string, Set<string>> = new Map();
	private isSealed = false;

	constructor(private options: CSPOptions = {}) {
		this.options = {
			isDev: options.isDev ?? process.env.NODE_ENV === "development",
			siteUrl: options.siteUrl ?? process.env.NEXT_PUBLIC_URL,
			...(options.defaultNonce && { defaultNonce: options.defaultNonce }),
			defaultIsTrustedTypes: options.defaultIsTrustedTypes ?? false,
		};
	}

	seal(): this {
		this.isSealed = true;
		return this;
	}

	private addToDirective(
		directivesMap: Map<string, Set<string>>,
		directive: string,
		...values: string[]
	): void {
		if (!directivesMap.has(directive)) {
			directivesMap.set(directive, new Set());
		}
		const directiveSet = directivesMap.get(directive)!;
		values.forEach((value) => value.trim() && directiveSet.add(value));
	}

	addStaticDirective(directive: string, ...values: string[]): this {
		if (this.isSealed) {
			throw new Error(
				"Cannot modify static directives after seal() has been called",
			);
		}

		if (!this.staticDirectives.has(directive)) {
			this.staticDirectives.set(directive, new Set());
		}

		const directiveSet = this.staticDirectives.get(directive)!;
		values.forEach((value) => {
			if (value.trim()) directiveSet.add(value.trim());
		});

		return this;
	}

	defaultSrc(...sources: string[]): this {
		return this.addStaticDirective("default-src", ...sources);
	}
	scriptSrc(...sources: string[]): this {
		return this.addStaticDirective("script-src", ...sources);
	}
	scriptSrcElem(...sources: string[]): this {
		return this.addStaticDirective("script-src-elem", ...sources);
	}
	scriptSrcAttr(...sources: string[]): this {
		return this.addStaticDirective("script-src-attr", ...sources);
	}
	styleSrc(...sources: string[]): this {
		return this.addStaticDirective("style-src", ...sources);
	}
	styleSrcElem(...sources: string[]): this {
		return this.addStaticDirective("style-src-elem", ...sources);
	}
	styleSrcAttr(...sources: string[]): this {
		return this.addStaticDirective("style-src-attr", ...sources);
	}
	imgSrc(...sources: string[]): this {
		return this.addStaticDirective("img-src", ...sources);
	}
	connectSrc(...sources: string[]): this {
		return this.addStaticDirective("connect-src", ...sources);
	}
	fontSrc(...sources: string[]): this {
		return this.addStaticDirective("font-src", ...sources);
	}
	frameSrc(...sources: string[]): this {
		return this.addStaticDirective("frame-src", ...sources);
	}
	mediaSrc(...sources: string[]): this {
		return this.addStaticDirective("media-src", ...sources);
	}
	objectSrc(...sources: string[]): this {
		return this.addStaticDirective("object-src", ...sources);
	}
	baseUri(...sources: string[]): this {
		return this.addStaticDirective("base-uri", ...sources);
	}
	formAction(...sources: string[]): this {
		return this.addStaticDirective("form-action", ...sources);
	}
	frameAncestors(...sources: string[]): this {
		return this.addStaticDirective("frame-ancestors", ...sources);
	}
	blockAllMixedContent(): this {
		return this.addStaticDirective("block-all-mixed-content");
	}
	upgradeInsecureRequests(): this {
		return this.addStaticDirective("upgrade-insecure-requests");
	}
	reportUri(uri: string): this {
		return this.addStaticDirective("report-uri", uri);
	}
	reportTo(endpoint: string): this {
		return this.addStaticDirective("report-to", endpoint);
	}

	build(
		requestOptions: { nonce?: string; isTrustedTypes?: boolean } = {},
	): string {
		const requestDirectives = new Map();

		for (const [directive, values] of this.staticDirectives.entries())
			requestDirectives.set(
				directive,
				new Set(
					Array.from(values).filter((value) => !value.startsWith("'nonce-")),
				),
			);

		const nonce = requestOptions.nonce;
		const isTrustedTypes = requestOptions.isTrustedTypes;

		if (nonce) {
			this.addToDirective(requestDirectives, "script-src", `'nonce-${nonce}'`);
		}

		if (
			isTrustedTypes &&
			!requestDirectives.has("require-trusted-types-for")
		) {
			this.addToDirective(
				requestDirectives,
				"require-trusted-types-for",
				"'script'",
			);

			const trustedTypes = ["default", "dompurify", "nextjs#bundler"];
			this.addToDirective(
				requestDirectives,
				"trusted-types",
				trustedTypes.join(" "),
			);
		}

		return (Array.from(requestDirectives.entries()) as [string, Set<string>][])
			.sort(([a], [b]) => a.localeCompare(b))
			.map(
				([directive, values]) =>
					`${directive} ${Array.from(values)
						.filter((v) => v)
						.join(" ")}`,
			)
			.join(";")
			.replace(/\s+/g, " ")
			.trim()
			.concat(";");
	}

	static createDefault(options: CSPOptions = {}): CSPBuilder {
		const nonceString = options.defaultNonce
			? `'nonce-${options.defaultNonce}'`
			: "";
		const isTrustedTypes = options.defaultIsTrustedTypes;

		let bld = new CSPBuilder(options)
			.defaultSrc("'none'")
			.connectSrc(
				"'self'",
				"https://cloudflareinsights.com",
			)
			.scriptSrc(
				"'strict-dynamic'",
				nonceString,
				options.isDev ? "'unsafe-eval'" : "",
				"'unsafe-inline'",
				"https:",
			)
			.scriptSrcElem(
				"'self'",
				nonceString,
				"'unsafe-inline'",
				"https://ajax.cloudflare.com",
				"https://static.cloudflareinsights.com",
				"https://challenges.cloudflare.com",
			)
			.scriptSrcAttr("'none'")
			.frameSrc("'self'", "https://challenges.cloudflare.com")
			.imgSrc("'self'", "blob:", "data:")
			.mediaSrc("'self'", "blob:", "data:")
			.styleSrc("'self'", "'unsafe-inline'")
			.fontSrc("'self'")
			.objectSrc("'none'")
			.baseUri("'none'")
			.formAction("'self'")
			.frameAncestors("'none'")
			.blockAllMixedContent()
			.upgradeInsecureRequests();

		if (isTrustedTypes)
			bld = bld.addStaticDirective("require-trusted-types-for", "'script'");

		return bld;
	}
}

export { CSPBuilder, type CSPOptions };
