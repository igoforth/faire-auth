import {
	callbackURLSchema,
	createRoute,
	redirectUrlSchema,
	req,
	res,
} from "@faire-auth/core/factory";
import { False, True } from "@faire-auth/core/static";
import type { FaireAuthOptions, FaireAuthPlugin } from "faire-auth";
import { logger } from "faire-auth";
import type { Session, User } from "faire-auth/db";
import {
	getSessionFromCtx,
	originCheck,
	sessionMiddleware,
} from "faire-auth/middleware";
import { createEndpoint, createMiddleware } from "faire-auth/plugins";
import Stripe, { type Stripe as StripeType } from "stripe";
import * as z from "zod";
import {
	onCheckoutSessionCompleted,
	onSubscriptionDeleted,
	onSubscriptionUpdated,
} from "./hooks";
import { getSchema } from "./schema";
import type {
	InputSubscription,
	StripeOptions,
	StripePlan,
	Subscription,
	SubscriptionOptions,
} from "./types";
import { getPlanByName, getPlanByPriceInfo, getPlans } from "./utils";
import { toSuccess } from "@faire-auth/core/utils";

const STRIPE_ERROR_CODES = {
	SUBSCRIPTION_NOT_FOUND: "Subscription not found",
	SUBSCRIPTION_PLAN_NOT_FOUND: "Subscription plan not found",
	ALREADY_SUBSCRIBED_PLAN: "You're already subscribed to this plan",
	UNABLE_TO_CREATE_CUSTOMER: "Unable to create customer",
	FAILED_TO_FETCH_PLANS: "Failed to fetch plans",
	EMAIL_VERIFICATION_REQUIRED:
		"Email verification is required before you can subscribe to a plan",
	SUBSCRIPTION_NOT_ACTIVE: "Subscription is not active",
	SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION:
		"Subscription is not scheduled for cancellation",
} as const;

const getUrl = (options: FaireAuthOptions, url: string) => {
	if (url.startsWith("http")) {
		return url;
	}
	return `${options.baseURL}${url.startsWith("/") ? url : `/${url}`}`;
};

async function resolvePriceIdFromLookupKey(
	stripeClient: Stripe,
	lookupKey: string,
): Promise<string | undefined> {
	if (!lookupKey) return undefined;
	const prices = await stripeClient.prices.list({
		lookup_keys: [lookupKey],
		active: true,
		limit: 1,
	});
	return prices.data[0]?.id;
}

export const stripe = <O extends StripeOptions>(options: O) => {
	const client = options.stripeClient;

	const referenceMiddleware = (
		action:
			| "upgrade-subscription"
			| "list-subscription"
			| "cancel-subscription"
			| "restore-subscription"
			| "billing-portal",
	) =>
		createMiddleware<
			{ session?: { session: Session; user: User } },
			| "/subscription/upgrade"
			| "/subscription/cancel"
			| "/subscription/list"
			| "/subscription/restore"
			| "/subscription/billing-portal",
			{
				out: {
					json: { referenceId?: string };
					query: { referenceId?: string };
				};
			}
		>()(async (ctx, next) => {
			const session = ctx.get("session");
			if (!session) return ctx.json({ success: False }, 401);

			if (!options.subscription?.enabled) {
				logger.error(
					`Subscription actions are not enabled in your stripe plugin config.`,
				);
				return ctx.json({ success: False }, 400);
			}

			let body: { referenceId?: string } = {};
			let bodyHasId = false;
			try {
				body = await ctx.req.raw.clone().json();
			} catch {}
			if (body.referenceId) bodyHasId = true;
			else body.referenceId = ctx.req.query("referenceId") ?? session.user.id;

			if (bodyHasId && !options.subscription?.authorizeReference) {
				logger.error(
					`Passing referenceId into a subscription action isn't allowed if subscription.authorizeReference isn't defined in your stripe plugin config.`,
				);
				return ctx.json(
					{
						success: False,
						message:
							"Reference id is not allowed. Read server logs for more details.",
					},
					400,
				);
			}
			const isAuthorized = bodyHasId
				? await options.subscription?.authorizeReference?.(
						{
							user: session.user,
							session: session.session,
							referenceId: body.referenceId,
							action,
						},
						ctx,
					)
				: true;
			if (!isAuthorized) return ctx.json({ success: False }, 401);

			return await next();
		});

	const subscriptionEndpoints = {
		/**
		 * ### Endpoint
		 *
		 * POST `/subscription/upgrade`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.upgradeSubscription`
		 *
		 * **client:**
		 * `authClient.subscription.upgrade`
		 *
		 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/stripe#api-method-subscription-upgrade)
		 */
		upgradeSubscription: createEndpoint(
			createRoute({
				operationId: "upgradeSubscription",
				method: "post",
				path: "/subscription/upgrade",
				middleware: [
					sessionMiddleware<{
						session: { user: { stripeCustomerId?: string } };
					}>(),
					originCheck(async (ctx) => {
						const { successURL, cancelURL } = await ctx.req.raw.clone().json();
						return [successURL as string, cancelURL as string];
					}),
					referenceMiddleware("upgrade-subscription"),
				],
				request: req()
					.bdy(
						z.object({
							/**
							 * The name of the plan to subscribe
							 */
							plan: z.string().meta({
								description: 'The name of the plan to upgrade to. Eg: "pro"',
							}),
							/**
							 * If annual plan should be applied.
							 */
							annual: z
								.boolean()
								.meta({
									description: "Whether to upgrade to an annual plan. Eg: true",
								})
								.optional(),
							/**
							 * Reference id of the subscription to upgrade
							 * This is used to identify the subscription to upgrade
							 * If not provided, the user's id will be used
							 */
							referenceId: z
								.string()
								.meta({
									description:
										'Reference id of the subscription to upgrade. Eg: "123"',
								})
								.optional(),
							/**
							 * This is to allow a specific subscription to be upgrade.
							 * If subscription id is provided, and subscription isn't found,
							 * it'll throw an error.
							 */
							subscriptionId: z
								.string()
								.meta({
									description:
										'The id of the subscription to upgrade. Eg: "sub_123"',
								})
								.optional(),
							/**
							 * Any additional data you want to store in your database
							 * subscriptions
							 */
							metadata: z.record(z.string(), z.any()).optional(),
							/**
							 * If a subscription
							 */
							seats: z
								.number()
								.meta({
									description:
										"Number of seats to upgrade to (if applicable). Eg: 1",
								})
								.optional(),
							/**
							 * Success URL to redirect back after successful subscription
							 */
							successUrl: z
								.string()
								.meta({
									description:
										'Callback URL to redirect back after successful subscription. Eg: "https://example.com/success"',
								})
								.default("/"),
							/**
							 * Cancel URL
							 */
							cancelUrl: z
								.string()
								.meta({
									description:
										'If set, checkout shows a back button and customers will be directed here if they cancel payment. Eg: "https://example.com/pricing"',
								})
								.default("/"),
							/**
							 * Return URL
							 */
							returnUrl: z
								.string()
								.meta({
									description:
										'URL to take customers to when they click on the billing portal’s link to return to your website. Eg: "https://example.com/dashboard"',
								})
								.optional(),
							/**
							 * Disable Redirect
							 */
							disableRedirect: z
								.boolean()
								.meta({
									description:
										"Disable redirect after successful subscription. Eg: true",
								})
								.default(false),
						}),
					)
					.bld(),
				responses: res(
					z.intersection(
						redirectUrlSchema,
						z.record(z.string(), z.any()) as unknown as z.ZodType<
							Partial<StripeType.Checkout.Session>,
							Partial<StripeType.Checkout.Session>
						>,
					),
				)
					.err(400)
					.err(401)
					.err(500)
					.bld(),
			}),
			(authOptions) => async (ctx) => {
				if (!options.subscription?.enabled) {
					logger.error(
						`Subscription actions are not enabled in your stripe plugin config.`,
					);
					return ctx.json({ success: False }, 400);
				}

				const { user, session } = ctx.get("session");
				if (
					!user.emailVerified &&
					options.subscription?.enabled &&
					options.subscription.requireEmailVerification
				)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED,
						},
						400,
					);

				const {
					referenceId = user.id,
					plan: requestPlan,
					subscriptionId,
					metadata,
					seats,
					returnUrl,
					cancelUrl,
					disableRedirect,
					successUrl,
					annual,
				} = ctx.req.valid("json");

				const plan = await getPlanByName(options, requestPlan);
				if (!plan)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_PLAN_NOT_FOUND,
						},
						400,
					);

				const subscriptionToUpdate = subscriptionId
					? await ctx.get("context").adapter.findOne<Subscription>({
							model: "subscription",
							where: [
								{
									field: "id",
									value: subscriptionId,
									connector: "OR",
								},
								{
									field: "stripeSubscriptionId",
									value: subscriptionId,
									connector: "OR",
								},
							],
						})
					: referenceId
						? await ctx.get("context").adapter.findOne<Subscription>({
								model: "subscription",
								where: [{ field: "referenceId", value: referenceId }],
							})
						: null;

				if (subscriptionId && !subscriptionToUpdate)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						},
						400,
					);

				let customerId =
					subscriptionToUpdate?.stripeCustomerId || user.stripeCustomerId;

				if (!customerId) {
					try {
						// Try to find existing Stripe customer by email
						const existingCustomers = await client.customers.list({
							email: user.email,
							limit: 1,
						});

						let stripeCustomer = existingCustomers.data[0];

						if (!stripeCustomer) {
							stripeCustomer = await client.customers.create({
								email: user.email,
								...(user.name && { name: user.name }),
								metadata: {
									...metadata,
									userId: user.id,
								},
							});
						}

						// Update local DB with Stripe customer ID
						await ctx.get("context").adapter.update({
							model: "user",
							update: {
								stripeCustomerId: stripeCustomer.id,
							},
							where: [
								{
									field: "id",
									value: user.id,
								},
							],
						});

						customerId = stripeCustomer.id;
					} catch (e: any) {
						ctx.get("context").logger.error(e);
						return ctx.json(
							{
								success: False,
								message: STRIPE_ERROR_CODES.UNABLE_TO_CREATE_CUSTOMER,
							},
							400,
						);
					}
				}

				const activeSubscriptions = await client.subscriptions
					.list({
						customer: customerId,
					})
					.then((res) =>
						res.data.filter(
							(sub) => sub.status === "active" || sub.status === "trialing",
						),
					);

				const activeSubscription = activeSubscriptions.find((sub) =>
					subscriptionToUpdate?.stripeSubscriptionId || subscriptionId
						? sub.id === subscriptionToUpdate?.stripeSubscriptionId ||
							sub.id === subscriptionId
						: false,
				);

				const subscriptions = subscriptionToUpdate
					? [subscriptionToUpdate]
					: await ctx.get("context").adapter.findMany<Subscription>({
							model: "subscription",
							where: [
								{
									field: "referenceId",
									value: referenceId || user.id,
								},
							],
						});

				const activeOrTrialingSubscription = subscriptions.find(
					(sub) => sub.status === "active" || sub.status === "trialing",
				);

				// Also find any incomplete subscription that we can reuse
				const incompleteSubscription = subscriptions.find(
					(sub) => sub.status === "incomplete",
				);

				if (
					activeOrTrialingSubscription &&
					activeOrTrialingSubscription.status === "active" &&
					activeOrTrialingSubscription.plan === requestPlan &&
					activeOrTrialingSubscription.seats === (seats || 1)
				)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.ALREADY_SUBSCRIBED_PLAN,
						},
						400,
					);

				if (activeSubscription && customerId) {
					const res = await client.billingPortal.sessions
						.create({
							customer: customerId,
							return_url: getUrl(authOptions, returnUrl || "/"),
							flow_data: {
								type: "subscription_update_confirm",
								after_completion: {
									type: "redirect",
									redirect: {
										return_url: getUrl(authOptions, returnUrl || "/"),
									},
								},
								subscription_update_confirm: {
									subscription: activeSubscription.id,
									items: [
										{
											id: activeSubscription.items.data[0]?.id as string,
											quantity: seats || 1,
											price: annual
												? plan.annualDiscountPriceId!
												: plan.priceId!,
										},
									],
								},
							},
						})
						.catch(async (e: Stripe.errors.StripeAPIError) =>
							ctx.json(
								{ success: False, message: e.message, code: e.code },
								400,
							),
						);
					if (res instanceof Response) return res;
					return ctx.json(
						{
							url: res.url,
							redirect: True,
						},
						200,
					);
				}

				let subscription: Subscription | undefined =
					activeOrTrialingSubscription || incompleteSubscription;

				if (incompleteSubscription && !activeOrTrialingSubscription) {
					const updated = await ctx
						.get("context")
						.adapter.update<InputSubscription>({
							model: "subscription",
							update: {
								plan: plan.name.toLowerCase(),
								seats: seats || 1,
								updatedAt: new Date(),
							},
							where: [
								{
									field: "id",
									value: incompleteSubscription.id,
								},
							],
						});
					subscription = (updated as Subscription) || incompleteSubscription;
				}

				if (!subscription) {
					subscription = await ctx
						.get("context")
						.adapter.create<InputSubscription, Subscription>({
							model: "subscription",
							data: {
								plan: plan.name.toLowerCase(),
								stripeCustomerId: customerId,
								status: "incomplete",
								referenceId,
								seats: seats || 1,
							},
						});
				}

				if (!subscription) {
					ctx.get("context").logger.error("Subscription ID not found");
					return ctx.json({ success: False }, 500);
				}

				const params = await options.subscription?.getCheckoutSessionParams?.(
					{
						user,
						session,
						plan,
						subscription,
					},
					ctx,
				);

				const hasEverTrialed = subscriptions.some((s) => {
					// Check if user has ever had a trial for any plan (not just the same plan)
					// This prevents users from getting multiple trials by switching plans
					const hadTrial =
						!!(s.trialStart || s.trialEnd) || s.status === "trialing";
					return hadTrial;
				});

				const freeTrial =
					!hasEverTrialed && plan.freeTrial
						? { trial_period_days: plan.freeTrial.days }
						: undefined;

				let priceIdToUse: string | undefined = undefined;
				if (annual) {
					priceIdToUse = plan.annualDiscountPriceId;
					if (!priceIdToUse && plan.annualDiscountLookupKey) {
						priceIdToUse = await resolvePriceIdFromLookupKey(
							client,
							plan.annualDiscountLookupKey,
						);
					}
				} else {
					priceIdToUse = plan.priceId;
					if (!priceIdToUse && plan.lookupKey) {
						priceIdToUse = await resolvePriceIdFromLookupKey(
							client,
							plan.lookupKey,
						);
					}
				}
				const checkoutSession = await client.checkout.sessions
					.create(
						{
							...(customerId
								? {
										customer: customerId,
										customer_update: {
											name: "auto",
											address: "auto",
										},
									}
								: {
										customer_email: user.email,
									}),
							success_url: getUrl(
								authOptions,
								`${
									ctx.get("context").baseURL
								}/subscription/success?callbackURL=${encodeURIComponent(
									successUrl,
								)}&subscriptionId=${encodeURIComponent(subscription.id)}`,
							),
							cancel_url: getUrl(authOptions, cancelUrl),
							line_items: [
								{
									price: priceIdToUse!,
									quantity: seats || 1,
								},
							],
							subscription_data: {
								...freeTrial,
							},
							mode: "subscription",
							client_reference_id: referenceId,
							...params?.params,
							metadata: {
								userId: user.id,
								subscriptionId: subscription.id,
								referenceId,
								...params?.params?.metadata,
							},
						},
						params?.options,
					)
					.catch(async (e: Stripe.errors.StripeAPIError) =>
						ctx.json({ success: False, message: e.message, code: e.code }, 400),
					);
				if (checkoutSession instanceof Response) return checkoutSession;
				return ctx.json(
					{
						...checkoutSession,
						redirect: !disableRedirect,
					},
					200,
				);
			},
		),
		cancelSubscriptionCallback: createEndpoint(
			createRoute({
				operationId: "cancelSubscriptionCallback",
				method: "get",
				path: "/subscription/cancel/callback",
				middleware: [originCheck((ctx) => ctx.req.query("callbackURL")!)],
				request: req()
					.qry(
						z.object({
							callbackURL: callbackURLSchema(true),
							subscriptionId: z.string().optional(),
						}),
					)
					.bld(),
				responses: res().rdr().bld(),
			}),
			(authOptions) => async (ctx) => {
				if (!options.subscription?.enabled) {
					logger.error(
						`Subscription actions are not enabled in your stripe plugin config.`,
					);
					return ctx.json({ success: False }, 400);
				}

				const { callbackURL, subscriptionId } = ctx.req.valid("query");
				if (!callbackURL || !subscriptionId)
					return ctx.redirect(getUrl(authOptions, callbackURL || "/"), 302);

				const session = await getSessionFromCtx<
					{ stripeCustomerId: string } & User
				>(ctx);
				if (session instanceof Response)
					return ctx.redirect(getUrl(authOptions, callbackURL || "/"), 302);

				if (session.user?.stripeCustomerId) {
					try {
						const subscription = await ctx
							.get("context")
							.adapter.findOne<Subscription>({
								model: "subscription",
								where: [
									{
										field: "id",
										value: subscriptionId,
									},
								],
							});
						if (
							!subscription ||
							subscription.cancelAtPeriodEnd ||
							subscription.status === "canceled"
						)
							return ctx.redirect(getUrl(authOptions, callbackURL), 302);

						const stripeSubscription = await client.subscriptions.list({
							customer: session.user.stripeCustomerId,
							status: "active",
						});
						const currentSubscription = stripeSubscription.data.find(
							(sub) => sub.id === subscription.stripeSubscriptionId,
						);
						if (currentSubscription?.cancel_at_period_end === true) {
							await ctx.get("context").adapter.update({
								model: "subscription",
								update: {
									status: currentSubscription?.status,
									cancelAtPeriodEnd: true,
								},
								where: [
									{
										field: "id",
										value: subscription.id,
									},
								],
							});
							await options.subscription?.onSubscriptionCancel?.({
								subscription,
								cancellationDetails: currentSubscription.cancellation_details,
								stripeSubscription: currentSubscription,
								event: undefined,
							});
						}
					} catch (error) {
						ctx
							.get("context")
							.logger.error(
								"Error checking subscription status from Stripe",
								error,
							);
					}
				}
				return ctx.redirect(getUrl(authOptions, callbackURL), 302);
			},
		),
		/**
		 * ### Endpoint
		 *
		 * POST `/subscription/cancel`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.cancelSubscription`
		 *
		 * **client:**
		 * `authClient.subscription.cancel`
		 *
		 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/stripe#api-method-subscription-cancel)
		 */
		cancelSubscription: createEndpoint(
			createRoute({
				operationId: "cancelSubscription",
				method: "post",
				path: "/subscription/cancel",
				middleware: [
					sessionMiddleware(),
					originCheck((ctx) =>
						ctx.req.raw
							.clone()
							.json()
							.then((v) => v.returnUrl),
					),
					referenceMiddleware("cancel-subscription"),
				],
				request: req()
					.bdy(
						z.object({
							referenceId: z
								.string()
								.meta({
									description:
										"Reference id of the subscription to cancel. Eg: '123'",
								})
								.optional(),
							subscriptionId: z
								.string()
								.meta({
									description:
										"The id of the subscription to cancel. Eg: 'sub_123'",
								})
								.optional(),
							returnUrl: z.string().meta({
								description:
									'URL to take customers to when they click on the billing portal’s link to return to your website. Eg: "https://example.com/dashboard"',
							}),
						}),
					)
					.bld(),
				responses: res(
					z.object({
						url: z.string(),
						redirect: z.literal(true),
					}),
				)
					.err(400)
					.err(401)
					.bld(),
			}),
			(authOptions) => async (ctx) => {
				const session = ctx.get("session");
				const {
					referenceId = session.user.id,
					subscriptionId,
					returnUrl,
				} = ctx.req.valid("json");

				const subscription = subscriptionId
					? await ctx.get("context").adapter.findOne<Subscription>({
							model: "subscription",
							where: [
								{
									field: "id",
									value: subscriptionId,
								},
							],
						})
					: await ctx
							.get("context")
							.adapter.findMany<Subscription>({
								model: "subscription",
								where: [{ field: "referenceId", value: referenceId }],
							})
							.then((subs) =>
								subs.find(
									(sub) => sub.status === "active" || sub.status === "trialing",
								),
							);

				if (!subscription || !subscription.stripeCustomerId)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						},
						400,
					);

				const activeSubscriptions = await client.subscriptions
					.list({
						customer: subscription.stripeCustomerId,
					})
					.then((res) =>
						res.data.filter(
							(sub) => sub.status === "active" || sub.status === "trialing",
						),
					);
				if (!activeSubscriptions.length) {
					/**
					 * If the subscription is not found, we need to delete the subscription
					 * from the database. This is a rare case and should not happen.
					 */
					await ctx.get("context").adapter.deleteMany({
						model: "subscription",
						where: [
							{
								field: "referenceId",
								value: referenceId,
							},
						],
					});
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						},
						400,
					);
				}
				const activeSubscription = activeSubscriptions.find(
					(sub) => sub.id === subscription.stripeSubscriptionId,
				);
				if (!activeSubscription)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						},
						400,
					);
				const res = await client.billingPortal.sessions
					.create({
						customer: subscription.stripeCustomerId,
						return_url: getUrl(
							authOptions,
							`${
								ctx.get("context").baseURL
							}/subscription/cancel/callback?callbackURL=${encodeURIComponent(
								returnUrl || "/",
							)}&subscriptionId=${encodeURIComponent(subscription.id)}`,
						),
						flow_data: {
							type: "subscription_cancel",
							subscription_cancel: {
								subscription: activeSubscription.id,
							},
						},
					})
					.catch(async (e: Stripe.errors.StripeAPIError) => {
						if (e.message.includes("already set to be cancel")) {
							/**
							 * incase we missed the event from stripe, we set it manually
							 * this is a rare case and should not happen
							 */
							if (!subscription.cancelAtPeriodEnd) {
								await ctx.get("context").adapter.update({
									model: "subscription",
									update: {
										cancelAtPeriodEnd: true,
									},
									where: [
										{
											field: "referenceId",
											value: referenceId,
										},
									],
								});
							}
						}
						return ctx.json(
							{ success: False, message: e.message, code: e.code },
							400,
						);
					});
				if (res instanceof Response) return res;
				return ctx.json(
					{
						url: res.url,
						redirect: true,
					},
					200,
				);
			},
		),
		restoreSubscription: createEndpoint(
			createRoute({
				operationId: "restoreSubscription",
				method: "post",
				path: "/subscription/restore",
				middleware: [
					sessionMiddleware(),
					referenceMiddleware("restore-subscription"),
				],
				request: req()
					.bdy(
						z.object({
							referenceId: z
								.string()
								.meta({
									description:
										"Reference id of the subscription to restore. Eg: '123'",
								})
								.optional(),
							subscriptionId: z
								.string()
								.meta({
									description:
										"The id of the subscription to restore. Eg: 'sub_123'",
								})
								.optional(),
						}),
					)
					.bld(),
				responses: res(
					z.looseObject({}) as unknown as z.ZodType<StripeType.Subscription>,
				)
					.err(400)
					.err(401)
					.bld(),
			}),
			(authOptions) => async (ctx) => {
				const session = ctx.get("session");
				const { referenceId = session.user.id, subscriptionId } =
					ctx.req.valid("json");

				const subscription = subscriptionId
					? await ctx.get("context").adapter.findOne<Subscription>({
							model: "subscription",
							where: [
								{
									field: "id",
									value: subscriptionId,
								},
							],
						})
					: await ctx
							.get("context")
							.adapter.findMany<Subscription>({
								model: "subscription",
								where: [
									{
										field: "referenceId",
										value: referenceId,
									},
								],
							})
							.then((subs) =>
								subs.find(
									(sub) => sub.status === "active" || sub.status === "trialing",
								),
							);
				if (!subscription || !subscription.stripeCustomerId)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						},
						400,
					);
				if (
					subscription.status != "active" &&
					subscription.status != "trialing"
				)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_ACTIVE,
						},
						400,
					);
				if (!subscription.cancelAtPeriodEnd)
					return ctx.json(
						{
							success: False,
							message:
								STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_SCHEDULED_FOR_CANCELLATION,
						},
						400,
					);

				const activeSubscription = await client.subscriptions
					.list({
						customer: subscription.stripeCustomerId,
					})
					.then(
						(res) =>
							res.data.filter(
								(sub) => sub.status === "active" || sub.status === "trialing",
							)[0],
					);
				if (!activeSubscription)
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.SUBSCRIPTION_NOT_FOUND,
						},
						400,
					);

				try {
					const newSub = await client.subscriptions.update(
						activeSubscription.id,
						{
							cancel_at_period_end: false,
						},
					);

					await ctx.get("context").adapter.update({
						model: "subscription",
						update: {
							cancelAtPeriodEnd: false,
							updatedAt: new Date(),
						},
						where: [
							{
								field: "id",
								value: subscription.id,
							},
						],
					});

					return ctx.json(newSub, 200);
				} catch (error) {
					ctx
						.get("context")
						.logger.error("Error restoring subscription", error);
					return ctx.json(
						{
							success: False,
							message: STRIPE_ERROR_CODES.UNABLE_TO_CREATE_CUSTOMER,
						},
						400,
					);
				}
			},
		),
		/**
		 * ### Endpoint
		 *
		 * GET `/subscription/list`
		 *
		 * ### API Methods
		 *
		 * **server:**
		 * `auth.api.listActiveSubscriptions`
		 *
		 * **client:**
		 * `authClient.subscription.list`
		 *
		 * @see [Read our docs to learn more.](https://faire-auth.com/docs/plugins/stripe#api-method-subscription-list)
		 */
		listActiveSubscriptions: createEndpoint(
			createRoute({
				operationId: "listActiveSubscriptions",
				method: "get",
				path: "/subscription/list",
				middleware: [
					sessionMiddleware(),
					referenceMiddleware("list-subscription"),
				],
				request: req()
					.qry(
						z.object({
							referenceId: z
								.string()
								.meta({
									description:
										"Reference id of the subscription to list. Eg: '123'",
								})
								.optional(),
						}),
					)
					.bld(),
				responses: res(
					z.array(z.looseObject({})) as unknown as z.ZodType<Subscription[]>,
				)
					.err(400)
					.err(401)
					.bld(),
			}),
			(_authOptions) => async (ctx) => {
				if (!options.subscription?.enabled) {
					logger.error(
						`Subscription actions are not enabled in your stripe plugin config.`,
					);
					return ctx.json({ success: False }, 400);
				}

				const session = ctx.get("session");
				const { referenceId = session.user.id } = ctx.req.valid("query");

				const subscriptions = await ctx
					.get("context")
					.adapter.findMany<Subscription>({
						model: "subscription",
						where: [
							{
								field: "referenceId",
								value: referenceId,
							},
						],
					});
				if (!subscriptions.length) return ctx.json([], 200);

				const plans = await getPlans(
					options.subscription as O["subscription"] & SubscriptionOptions,
				);
				if (!plans) return ctx.json([], 200);

				const subs = subscriptions
					.map((sub) => {
						const plan = plans.find(
							(p) => p.name.toLowerCase() === sub.plan.toLowerCase(),
						);
						return {
							...sub,
							limits: plan?.limits,
							priceId: plan?.priceId,
						};
					})
					.filter(
						(sub) => sub.status === "active" || sub.status === "trialing",
					);
				return ctx.json(subs, 200);
			},
		),
		subscriptionSuccess: createEndpoint(
			createRoute({
				operationId: "subscriptionSuccess",
				method: "get",
				path: "/subscription/success",
				middleware: [originCheck((ctx) => ctx.req.query("callbackURL")!)],
				request: req()
					.qry(
						z.object({
							callbackURL: callbackURLSchema(true),
							subscriptionId: z.string().optional(),
						}),
					)
					.bld(),
				responses: res().rdr().bld(),
			}),

			(authOptions) => async (ctx) => {
				const { callbackURL, subscriptionId } = ctx.req.valid("query");
				if (!callbackURL || !subscriptionId)
					return ctx.redirect(getUrl(authOptions, callbackURL || "/"), 302);

				const session = await getSessionFromCtx<
					{ stripeCustomerId?: string } & User
				>(ctx);
				if (session instanceof Response)
					return ctx.redirect(getUrl(authOptions, callbackURL || "/"), 302);

				const subscription = await ctx
					.get("context")
					.adapter.findOne<Subscription>({
						model: "subscription",
						where: [
							{
								field: "id",
								value: subscriptionId,
							},
						],
					});

				if (
					subscription?.status === "active" ||
					subscription?.status === "trialing"
				)
					return ctx.redirect(getUrl(authOptions, callbackURL), 302);

				const customerId =
					subscription?.stripeCustomerId || session.user.stripeCustomerId;

				if (customerId) {
					try {
						const stripeSubscription = await client.subscriptions
							.list({
								customer: customerId,
								status: "active",
							})
							.then((res) => res.data[0]);

						if (stripeSubscription) {
							const firstItem = stripeSubscription.items.data[0];
							if (firstItem) {
								const plan = await getPlanByPriceInfo(
									options,
									firstItem.price.id,
									firstItem.price.lookup_key,
								);

								if (plan && subscription) {
									await ctx.get("context").adapter.update({
										model: "subscription",
										update: {
											status: stripeSubscription.status,
											seats: firstItem.quantity || 1,
											plan: plan.name.toLowerCase(),
											periodEnd: new Date(firstItem.current_period_end * 1000),
											periodStart: new Date(
												firstItem.current_period_start * 1000,
											),
											stripeSubscriptionId: stripeSubscription.id,
											...(stripeSubscription.trial_start &&
											stripeSubscription.trial_end
												? {
														trialStart: new Date(
															stripeSubscription.trial_start * 1000,
														),
														trialEnd: new Date(
															stripeSubscription.trial_end * 1000,
														),
													}
												: {}),
										},
										where: [
											{
												field: "id",
												value: subscription.id,
											},
										],
									});
								}
							}
						}
					} catch (error) {
						ctx
							.get("context")
							.logger.error("Error fetching subscription from Stripe", error);
					}
				}
				return ctx.redirect(getUrl(authOptions, callbackURL), 302);
			},
		),
		createBillingPortal: createEndpoint(
			createRoute({
				operationId: "createBillingPortal",
				method: "post",
				path: "/subscription/billing-portal",
				middleware: [
					sessionMiddleware<{
						session: { user: { stripeCustomerId?: string } };
					}>(),
					originCheck((ctx) =>
						ctx.req.raw
							.clone()
							.json()
							.then((v) => v.returnUrl),
					),
					referenceMiddleware("billing-portal"),
				],
				request: req()
					.bdy(
						z.object({
							locale: z
								.custom<StripeType.Checkout.Session.Locale>((localization) => {
									return typeof localization === "string";
								})
								.optional(),
							referenceId: z.string().optional(),
							returnUrl: z.string().default("/"),
						}),
					)
					.bld(),
				responses: res(z.object({ url: z.string(), redirect: z.literal(true) }))
					.err(400)
					.err(401)
					.bld(),
			}),
			(authOptions) => async (ctx) => {
				const session = ctx.get("session");
				const {
					referenceId = session.user.id,
					locale,
					returnUrl,
				} = ctx.req.valid("json");
				let customerId = session.user.stripeCustomerId;

				if (!customerId) {
					const subscription = await ctx
						.get("context")
						.adapter.findMany<Subscription>({
							model: "subscription",
							where: [
								{
									field: "referenceId",
									value: referenceId,
								},
							],
						})
						.then((subs) =>
							subs.find(
								(sub) => sub.status === "active" || sub.status === "trialing",
							),
						);

					customerId = subscription?.stripeCustomerId;
				}

				if (!customerId)
					return ctx.json(
						{
							success: False,
							message: "No Stripe customer found for this user",
						},
						400,
					);

				try {
					const { url } = await client.billingPortal.sessions.create({
						customer: customerId,
						return_url: getUrl(authOptions, returnUrl),
						...(locale && { locale }),
					});

					return ctx.json(
						{
							url,
							redirect: true,
						},
						200,
					);
				} catch (error: any) {
					ctx
						.get("context")
						.logger.error("Error creating billing portal session", error);
					return ctx.json({ success: False, message: error.message }, 400);
				}
			},
		),
	} as const;

	return {
		id: "stripe",
		routes: {
			stripeWebhook: createEndpoint(
				createRoute({
					operationId: "stripeWebhook",
					method: "post",
					path: "/stripe/webhook",
					isAction: false,
					// cloneRequest: true,
					// //don't parse the body
					// disableBody: true,
					responses: res(z.object({ success: z.literal(true) }))
						.err(400)
						.err(500)
						.bld(),
				}),
				(_authOptions) => async (ctx) => {
					if (!ctx.req.raw?.body) return ctx.json({ success: False }, 500);

					const buf = await ctx.req.text();
					const sig = ctx.req.header("stripe-signature") as string;
					const webhookSecret = options.stripeWebhookSecret;
					let event: Stripe.Event;
					try {
						if (!sig || !webhookSecret)
							return ctx.json(
								{ success: False, message: "Stripe webhook secret not found" },
								400,
							);

						event = await client.webhooks.constructEventAsync(
							buf,
							sig,
							webhookSecret,
						);
					} catch (err: any) {
						ctx.get("context").logger.error(`${err.message}`);
						return ctx.json(
							{ success: False, message: `Webhook Error: ${err.message}` },
							400,
						);
					}
					try {
						switch (event.type) {
							case "checkout.session.completed":
								await onCheckoutSessionCompleted(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "customer.subscription.updated":
								await onSubscriptionUpdated(ctx, options, event);
								await options.onEvent?.(event);
								break;
							case "customer.subscription.deleted":
								await onSubscriptionDeleted(ctx, options, event);
								await options.onEvent?.(event);
								break;
							default:
								await options.onEvent?.(event);
								break;
						}
					} catch (e: any) {
						ctx
							.get("context")
							.logger.error(`Stripe webhook failed. Error: ${e.message}`);
						return ctx.json(
							{
								success: False,
								message: "Webhook error: See server logs for more information.",
							},
							400,
						);
					}
					return ctx.json({ success: True }, 200);
				},
			),
			...((options.subscription?.enabled
				? subscriptionEndpoints
				: {}) as O["subscription"] extends {
				enabled: boolean;
			}
				? typeof subscriptionEndpoints
				: {}),
		},
		init(ctx) {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								async after(user, ctx) {
									if (ctx && options.createCustomerOnSignUp) {
										const stripeCustomer = await client.customers.create({
											email: user.email,
											...(user.name && { name: user.name }),
											metadata: {
												userId: user.id,
											},
										});
										const updatedUser = await ctx
											.get("context")
											.internalAdapter.updateUser(user.id, {
												stripeCustomerId: stripeCustomer.id,
											});
										if (!updatedUser)
											logger.error("#FAIRE_AUTH: Failed to create customer");
										else if (options.onCustomerCreate)
											await options.onCustomerCreate(
												{
													stripeCustomer,
													user,
												},
												// @ts-expect-error Doesn't have ContextVars
												ctx,
											);
									}
								},
							},
						},
					},
				},
			};
		},
		schema: getSchema(options),
	} satisfies FaireAuthPlugin;
};

export type StripePlugin<O extends StripeOptions> = ReturnType<
	typeof stripe<O>
>;

export type { StripePlan, Subscription };
