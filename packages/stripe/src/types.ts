import type { ContextVars, InferOptionSchema } from "faire-auth";
import type { Context } from "@faire-auth/core/types";
import type Stripe from "stripe";
import type { subscriptions, user } from "./schema";
import type { Session, User } from "faire-auth/db";

export type StripePlan = {
	/**
	 * Monthly price id
	 */
	priceId?: string;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/
	 * manage-prices#lookup-keys
	 */
	lookupKey?: string;
	/**
	 * A yearly discount price id
	 *
	 * useful when you want to offer a discount for
	 * yearly subscription
	 */
	annualDiscountPriceId?: string;
	/**
	 * To use lookup key instead of price id
	 *
	 * https://docs.stripe.com/products-prices/
	 * manage-prices#lookup-keys
	 */
	annualDiscountLookupKey?: string;
	/**
	 * Plan name
	 */
	name: string;
	/**
	 * Limits for the plan
	 */
	limits?: Record<string, number>;
	/**
	 * Plan group name
	 *
	 * useful when you want to group plans or
	 * when a user can subscribe to multiple plans.
	 */
	group?: string;
	/**
	 * Free trial days
	 */
	freeTrial?: {
		/**
		 * Number of days
		 */
		days: number;
		/**
		 * A function that will be called when the trial
		 * starts.
		 *
		 * @param subscription
		 * @returns
		 */
		onTrialStart?: (subscription: Subscription) => Promise<void>;
		/**
		 * A function that will be called when the trial
		 * ends
		 *
		 * @param subscription - Subscription
		 * @returns
		 */
		onTrialEnd?: <V extends object>(
			data: {
				subscription: Subscription;
			},
			ctx: Context<ContextVars<V>>,
		) => Promise<void>;
		/**
		 * A function that will be called when the trial
		 * expired.
		 * @param subscription - Subscription
		 * @returns
		 */
		onTrialExpired?: <V extends object>(
			subscription: Subscription,
			ctx: Context<ContextVars<V>>,
		) => Promise<void>;
	};
};

export interface Subscription {
	/**
	 * Database identifier
	 */
	id: string;
	/**
	 * The plan name
	 */
	plan: string;
	/**
	 * Stripe customer id
	 */
	stripeCustomerId?: string;
	/**
	 * Stripe subscription id
	 */
	stripeSubscriptionId?: string;
	/**
	 * Trial start date
	 */
	trialStart?: Date;
	/**
	 * Trial end date
	 */
	trialEnd?: Date;
	/**
	 * Price Id for the subscription
	 */
	priceId?: string;
	/**
	 * To what reference id the subscription belongs to
	 * @example
	 * - userId for a user
	 * - workspace id for a saas platform
	 * - website id for a hosting platform
	 *
	 * @default - userId
	 */
	referenceId: string;
	/**
	 * Subscription status
	 */
	status:
		| "active"
		| "canceled"
		| "incomplete"
		| "incomplete_expired"
		| "past_due"
		| "paused"
		| "trialing"
		| "unpaid";
	/**
	 * The billing cycle start date
	 */
	periodStart?: Date;
	/**
	 * The billing cycle end date
	 */
	periodEnd?: Date;
	/**
	 * Whether this subscription will (if status=active)
	 * or did (if status=canceled) cancel at the end of the current billing period.
	 */
	cancelAtPeriodEnd?: boolean;
	/**
	 * If the subscription is scheduled to be canceled,
	 * this is the time at which the cancellation will take effect.
	 */
	cancelAt?: Date;
	/**
	 * If the subscription has been canceled, this is the time when it was canceled.
	 *
	 * Note: If the subscription was canceled with `cancel_at_period_end`,
	 * this reflects the cancellation request time, not when the subscription actually ends.
	 */
	canceledAt?: Date;
	/**
	 * If the subscription has ended, the date the subscription ended.
	 */
	endedAt?: Date;
	/**
	 * A field to group subscriptions so you can have multiple subscriptions
	 * for one reference id
	 */
	groupId?: string;
	/**
	 * Number of seats for the subscription (useful for team plans)
	 */
	seats?: number;
}

export interface SubscriptionOptions {
	enabled: boolean;
	/**
	 * Subscription Configuration
	 */
	/**
	 * List of plan
	 */
	plans: StripePlan[] | (() => StripePlan[] | Promise<StripePlan[]>);
	/**
	 * Require email verification before a user is allowed to upgrade
	 * their subscriptions
	 *
	 * @default false
	 */
	requireEmailVerification?: boolean;
	/**
	 * A callback to run after a user has subscribed to a package
	 * @param event - Stripe Event
	 * @param subscription - Subscription Data
	 * @returns
	 */
	onSubscriptionComplete?: <V extends object>(
		data: {
			event: Stripe.Event;
			stripeSubscription: Stripe.Subscription;
			subscription: Subscription;
			plan: StripePlan;
		},
		ctx: Context<ContextVars<V>>,
	) => Promise<void>;
	/**
	 * A callback to run after a user is about to cancel their subscription
	 * @returns
	 */
	onSubscriptionUpdate?: (data: {
		event: Stripe.Event;
		subscription: Subscription;
	}) => Promise<void>;
	/**
	 * A callback to run after a user is about to cancel their subscription
	 * @returns
	 */
	onSubscriptionCancel?: (data: {
		event?: Stripe.Event | undefined;
		subscription: Subscription;
		stripeSubscription: Stripe.Subscription;
		cancellationDetails?: Stripe.Subscription.CancellationDetails | null;
	}) => Promise<void>;
	/**
	 * A function to check if the reference id is valid
	 * and belongs to the user
	 *
	 * @param data - data containing user, session and referenceId
	 * @param ctx - the context object
	 * @returns
	 */
	authorizeReference?: <V extends object>(
		data: {
			user: User;
			session: Session;
			referenceId: string;
			action:
				| "upgrade-subscription"
				| "list-subscription"
				| "cancel-subscription"
				| "restore-subscription"
				| "billing-portal";
		},
		ctx: Context<ContextVars<V>>,
	) => Promise<boolean>;
	/**
	 * A callback to run after a user has deleted their subscription
	 * @returns
	 */
	onSubscriptionDeleted?: (data: {
		event: Stripe.Event;
		stripeSubscription: Stripe.Subscription;
		subscription: Subscription;
	}) => Promise<void>;
	/**
	 * parameters for session create params
	 *
	 * @param data - data containing user, session and plan
	 * @param ctx - the context object
	 */
	getCheckoutSessionParams?: <V extends object>(
		data: {
			user: User;
			session: Session;
			plan: StripePlan;
			subscription: Subscription;
		},
		ctx: Context<ContextVars<V>>,
	) =>
		| Promise<{
				params?: Stripe.Checkout.SessionCreateParams;
				options?: Stripe.RequestOptions;
		  }>
		| {
				params?: Stripe.Checkout.SessionCreateParams;
				options?: Stripe.RequestOptions;
		  };
	/**
	 * Enable organization subscription
	 */
	organization?: {
		enabled: boolean;
	};
}

export interface StripeOptions {
	/**
	 * Stripe Client
	 */
	stripeClient: Stripe;
	/**
	 * Stripe Webhook Secret
	 *
	 * @description Stripe webhook secret key
	 */
	stripeWebhookSecret: string;
	/**
	 * Enable customer creation when a user signs up
	 */
	createCustomerOnSignUp?: boolean;
	/**
	 * A callback to run after a customer has been created
	 * @param customer - Customer Data
	 * @param stripeCustomer - Stripe Customer Data
	 * @returns
	 */
	onCustomerCreate?: <V extends object>(
		data: {
			stripeCustomer: Stripe.Customer;
			user: User;
		},
		ctx: Context<ContextVars<V>>,
	) => Promise<void>;
	/**
	 * A custom function to get the customer create
	 * params
	 * @param data - data containing user and session
	 * @returns
	 */
	getCustomerCreateParams?: <V extends object>(
		data: {
			user: User;
			session: Session;
		},
		ctx: Context<ContextVars<V>>,
	) => Promise<{}>;
	/**
	 * Subscriptions
	 */
	subscription?:
		| {
				enabled: false;
		  }
		| ({
				enabled: true;
		  } & SubscriptionOptions);
	/**
	 * A callback to run after a stripe event is received
	 * @param event - Stripe Event
	 * @returns
	 */
	onEvent?: (event: Stripe.Event) => Promise<void>;
	/**
	 * Schema for the stripe plugin
	 */
	schema?: InferOptionSchema<typeof subscriptions & typeof user>;
}

export interface InputSubscription extends Omit<Subscription, "id"> {}
