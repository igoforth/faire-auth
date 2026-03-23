import type { MetadataRoute } from "next";
import { source, changelogs, blogs } from "@/lib/source";

const baseUrl = "https://faire-auth.com";

export default function sitemap(): MetadataRoute.Sitemap {
	const docs = source.getPages().map((page) => ({
		url: `${baseUrl}/docs/${page.slugs.join("/")}`,
		lastModified: new Date(),
		priority: 0.8,
	}));

	const changelogPages = changelogs.getPages().map((page) => ({
		url: `${baseUrl}/changelogs/${page.slugs.join("/")}`,
		lastModified: new Date(),
		priority: 0.5,
	}));

	const blogPages = blogs.getPages().map((page) => ({
		url: `${baseUrl}/blog/${page.slugs.join("/")}`,
		lastModified: new Date(),
		priority: 0.6,
	}));

	return [
		{ url: baseUrl, lastModified: new Date(), priority: 1.0 },
		{ url: `${baseUrl}/docs`, lastModified: new Date(), priority: 0.9 },
		{ url: `${baseUrl}/changelogs`, lastModified: new Date(), priority: 0.5 },
		{ url: `${baseUrl}/blog`, lastModified: new Date(), priority: 0.6 },
		...docs,
		...changelogPages,
		...blogPages,
	];
}
