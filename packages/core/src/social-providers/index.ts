import type { UnionToTuple } from "type-fest";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import type { LiteralStringUnion, Prettify } from "../types/helper";
import { apple } from "./apple";
import { atlassian } from "./atlassian";
import { cognito } from "./cognito";
import { discord } from "./discord";
import { dropbox } from "./dropbox";
import { facebook } from "./facebook";
import { figma } from "./figma";
import { github } from "./github";
import { gitlab } from "./gitlab";
import { google } from "./google";
import { huggingface } from "./huggingface";
import { kakao } from "./kakao";
import { kick } from "./kick";
import { line } from "./line";
import { linear } from "./linear";
import { linkedin } from "./linkedin";
import { microsoft } from "./microsoft-entra-id";
import { naver } from "./naver";
import { notion } from "./notion";
import { paypal } from "./paypal";
import { reddit } from "./reddit";
import { roblox } from "./roblox";
import { salesforce } from "./salesforce";
import { slack } from "./slack";
import { spotify } from "./spotify";
import { tiktok } from "./tiktok";
import { twitch } from "./twitch";
import { twitter } from "./twitter";
import { vk } from "./vk";
import { zoom } from "./zoom";

export const socialProviders = {
	apple,
	atlassian,
	cognito,
	discord,
	facebook,
	figma,
	github,
	microsoft,
	google,
	huggingface,
	slack,
	spotify,
	twitch,
	twitter,
	dropbox,
	kick,
	linear,
	linkedin,
	gitlab,
	tiktok,
	reddit,
	roblox,
	salesforce,
	vk,
	zoom,
	notion,
	kakao,
	naver,
	line,
	paypal,
};
// TODO: satisfies causes circular references
// satisfies {
// 	[key: string]: (
// 		// todo: fix any here
// 		config: any,
// 	) => OAuthProvider;
// };

export type StrictSocialProvider = keyof typeof socialProviders;
export type SocialProvider = LiteralStringUnion<StrictSocialProvider>;

export const socialProviderList = Object.keys(
	socialProviders,
) as UnionToTuple<StrictSocialProvider>;

export type SocialProviderList = typeof socialProviderList;

export type SocialProviders<Profile extends Record<string, any> = any> =
	Prettify<{
		[K in SocialProvider]?: K extends StrictSocialProvider
			? (typeof socialProviders)[K] extends (...args: infer A) => infer R
				? { enabled?: boolean } & Parameters<(...args: A) => R>[0]
				: never
			: { enabled?: boolean } & ProviderOptions<Profile>;
	}>;

export type OAuthProviders = (ReturnType<
	(typeof socialProviders)[keyof typeof socialProviders]
> extends infer X
	? X extends OAuthProvider<any, infer O>
		? O extends ProviderOptions<infer P>
			? OAuthProvider<P, O>
			: never
		: never
	: never)[];

export * from "./apple";
export * from "./atlassian";
export * from "./cognito";
export * from "./discord";
export * from "./dropbox";
export * from "./facebook";
export * from "./figma";
export * from "./github";
export * from "./gitlab";
export * from "./google";
export * from "./huggingface";
export * from "./kakao";
export * from "./kick";
export * from "./line";
export * from "./linear";
export * from "./linkedin";
export * from "./microsoft-entra-id";
export * from "./naver";
export * from "./notion";
export * from "./paypal";
export * from "./reddit";
export * from "./roblox";
export * from "./salesforce";
export * from "./slack";
export * from "./spotify";
export * from "./tiktok";
export * from "./twitch";
export * from "./twitter";
export * from "./vk";
export * from "./zoom";
