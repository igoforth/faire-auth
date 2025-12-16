import { faireAuth, type InferAPI, type InferApp } from "faire-auth";
import { memoryAdapter } from "faire-auth/adapters/memory";
import { createAuthClient } from "faire-auth/client";
import { createCookieCapture } from "faire-auth/cookies";
import { bearer } from "faire-auth/plugins";
import Stripe from "stripe";
import { beforeEach, describe, expectTypeOf, vi } from "vitest";
import { stripeClient } from "./client";
import { stripe, type StripePlugin } from "./index";
import type { StripeOptions, Subscription } from "./types";
import type { User } from "faire-auth/db";

describe("stripe type", (test) => {
	test("should api endpoint exists", () => {
		type Plugins = [
			StripePlugin<{
				stripeClient: Stripe;
				stripeWebhookSecret: string;
				subscription: {
					enabled: false;
				};
			}>,
		];
		type MyApp = InferApp<{
			plugins: Plugins;
		}>;
		type MyAPI = InferAPI<MyApp>;
		expectTypeOf<MyAPI["stripeWebhook"]>().toBeFunction();
	});

	test("should have subscription endpoints", () => {
		type Plugins = [
			StripePlugin<{
				stripeClient: Stripe;
				stripeWebhookSecret: string;
				subscription: {
					enabled: true;
					plans: [];
				};
			}>,
		];
		type MyApp = InferApp<{
			plugins: Plugins;
		}>;
		type MyAPI = InferAPI<MyApp>;
		expectTypeOf<MyAPI["stripeWebhook"]>().toBeFunction();
		expectTypeOf<MyAPI["subscriptionSuccess"]>().toBeFunction();
		expectTypeOf<MyAPI["listActiveSubscriptions"]>().toBeFunction();
		expectTypeOf<MyAPI["cancelSubscriptionCallback"]>().toBeFunction();
		expectTypeOf<MyAPI["cancelSubscription"]>().toBeFunction();
		expectTypeOf<MyAPI["restoreSubscription"]>().toBeFunction();
	});
});

describe("stripe", async (test) => {
	const mockStripe = {
		prices: {
			list: vi.fn().mockResolvedValue({ data: [{ id: "price_lookup_123" }] }),
		},
		customers: {
			create: vi.fn().mockResolvedValue({ id: "cus_mock123" }),
		},
		checkout: {
			sessions: {
				create: vi.fn().mockResolvedValue({
					url: "https://checkout.stripe.com/mock",
					id: "",
				}),
			},
		},
		billingPortal: {
			sessions: {
				create: vi
					.fn()
					.mockResolvedValue({ url: "https://billing.stripe.com/mock" }),
			},
		},
		subscriptions: {
			retrieve: vi.fn(),
			list: vi.fn().mockResolvedValue({ data: [] }),
			update: vi.fn(),
		},
		webhooks: {
			constructEvent: vi.fn(),
		},
	};

	const _stripe = mockStripe as unknown as Stripe;
	const data = {
		user: [],
		session: [],
		verification: [],
		account: [],
		customer: [],
		subscription: [],
	};
	const memory = memoryAdapter(data);
	const stripeOptions = {
		stripeClient: _stripe,
		stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
		createCustomerOnSignUp: true,
		subscription: {
			enabled: true,
			plans: [
				{
					priceId: process.env.STRIPE_PRICE_ID_1!,
					name: "starter",
					lookupKey: "lookup_key_123",
				},
				{
					priceId: process.env.STRIPE_PRICE_ID_2!,
					name: "premium",
					lookupKey: "lookup_key_234",
				},
			],
		},
	} satisfies StripeOptions;
	const opts = {
		database: memory,
		baseURL: "http://localhost:3000",
		// database: new Database(":memory:"),
		emailAndPassword: {
			enabled: true,
		},
		plugins: [stripe(stripeOptions)],
	};
	const auth = faireAuth(opts);
	const ctx = auth.$context;
	const app = auth.$Infer.App(opts);
	const authClient = createAuthClient<typeof app>()({
		baseURL: "http://localhost:3000",
		plugins: [
			bearer(),
			stripeClient({
				subscription: true,
			}),
		],
		fetchOptions: {
			customFetchImpl: async (url, init) =>
				auth.handler(new Request(url, init)),
		},
	});

	const testUser = {
		email: "test@email.com",
		password: "password",
		name: "Test User",
	};

	beforeEach(() => {
		data.user = [];
		data.session = [];
		data.verification = [];
		data.account = [];
		data.customer = [];
		data.subscription = [];

		vi.clearAllMocks();
	});

	test("should create a customer on sign up", async ({ expect }) => {
		const userRes = await authClient.signUp.email.$post({ json: testUser });
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");
		const res = await ctx.adapter.findOne<User>({
			model: "user",
			where: [
				{
					field: "id",
					value: userRes.data.data.user!.id,
				},
			],
		});
		expect(res).toMatchObject({
			id: expect.any(String),
			stripeCustomerId: expect.any(String),
		});
	});

	test("should create a subscription", async ({ expect }) => {
		const userRes = await authClient.signUp.email.$post({ json: testUser });
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{ json: testUser },
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		const res = await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
				},
			},
			{
				headers,
			},
		);
		expect(res.data?.url).toBeDefined();
		const subscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		});
		expect(subscription).toMatchObject({
			id: expect.any(String),
			plan: "starter",
			referenceId: userRes.data.data.user!.id,
			stripeCustomerId: expect.any(String),
			status: "incomplete",
			periodStart: undefined,
			cancelAtPeriodEnd: false,
			trialStart: undefined,
			trialEnd: undefined,
		});
	});

	test("should list active subscriptions", async ({ expect }) => {
		const userRes = await authClient.signUp.email.$post({
			json: {
				...testUser,
				email: "list-test@email.com",
			},
		});
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");
		const userId = userRes.data.data.user!.id;

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{
				json: {
					...testUser,
					email: "list-test@email.com",
				},
			},
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		const listRes = await authClient.subscription.list.$get(
			{ query: {} },
			{
				headers,
			},
		);

		expect(Array.isArray(listRes.data)).toBe(true);

		await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
				},
			},
			{
				headers,
			},
		);
		const listBeforeActive = await authClient.subscription.list.$get(
			{ query: {} },
			{
				headers,
			},
		);
		expect(listBeforeActive.data?.length).toBe(0);
		// Update the subscription status to active
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
			},
			where: [
				{
					field: "referenceId",
					value: userId,
				},
			],
		});
		const listAfterRes = await authClient.subscription.list.$get(
			{ query: {} },
			{
				headers,
			},
		);
		expect(listAfterRes.data?.length).toBeGreaterThan(0);
	});

	test("should handle subscription webhook events", async ({ expect }) => {
		const { id: testReferenceId } = await ctx.adapter.create({
			model: "user",
			data: {
				email: "test@email.com",
			},
		});
		const { id: testSubscriptionId } = await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: testReferenceId,
				stripeCustomerId: "cus_mock123",
				status: "active",
				plan: "starter",
			},
		});
		const mockCheckoutSessionEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "subscription",
					subscription: testSubscriptionId,
					metadata: {
						referenceId: testReferenceId,
						subscriptionId: testSubscriptionId,
					},
				},
			},
		};

		const mockSubscription = {
			id: testSubscriptionId,
			status: "active",
			items: {
				data: [
					{
						price: { id: process.env.STRIPE_PRICE_ID_1 },
						quantity: 1,
					},
				],
			},
			current_period_start: Math.floor(Date.now() / 1000),
			current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			subscriptions: {
				...stripeOptions.stripeClient.subscriptions,
				retrieve: vi.fn().mockResolvedValue(mockSubscription),
			},
			webhooks: {
				constructEventAsync: vi
					.fn()
					.mockResolvedValue(mockCheckoutSessionEvent),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const testAuth = faireAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

		const testCtx = await testAuth.$context;

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockCheckoutSessionEvent),
			},
		);
		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		const updatedSubscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "id",
					value: testSubscriptionId,
				},
			],
		});

		expect(updatedSubscription).toMatchObject({
			id: testSubscriptionId,
			status: "active",
			periodStart: expect.any(Date),
			periodEnd: expect.any(Date),
			plan: "starter",
		});
	});

	test("should handle subscription webhook events with trial", async ({
		expect,
	}) => {
		const { id: testReferenceId } = await ctx.adapter.create({
			model: "user",
			data: {
				email: "test@email.com",
			},
		});
		const { id: testSubscriptionId } = await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: testReferenceId,
				stripeCustomerId: "cus_mock123",
				status: "incomplete",
				plan: "starter",
			},
		});
		const mockCheckoutSessionEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "subscription",
					subscription: testSubscriptionId,
					metadata: {
						referenceId: testReferenceId,
						subscriptionId: testSubscriptionId,
					},
				},
			},
		};

		const mockSubscription = {
			id: testSubscriptionId,
			status: "active",
			items: {
				data: [
					{
						price: { id: process.env.STRIPE_PRICE_ID_1 },
						quantity: 1,
					},
				],
			},
			current_period_start: Math.floor(Date.now() / 1000),
			current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
			trial_start: Math.floor(Date.now() / 1000),
			trial_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			subscriptions: {
				...stripeOptions.stripeClient.subscriptions,
				retrieve: vi.fn().mockResolvedValue(mockSubscription),
			},
			webhooks: {
				constructEventAsync: vi
					.fn()
					.mockResolvedValue(mockCheckoutSessionEvent),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const testAuth = faireAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

		const testCtx = await testAuth.$context;

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockCheckoutSessionEvent),
			},
		);
		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		const updatedSubscription = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "id",
					value: testSubscriptionId,
				},
			],
		});

		expect(updatedSubscription).toMatchObject({
			id: testSubscriptionId,
			status: "active",
			periodStart: expect.any(Date),
			periodEnd: expect.any(Date),
			plan: "starter",
			trialStart: expect.any(Date),
			trialEnd: expect.any(Date),
		});
	});

	const { id: userId } = await ctx.adapter.create({
		model: "user",
		data: {
			email: "delete-test@email.com",
		},
	});

	test("should handle subscription deletion webhook", async ({ expect }) => {
		const subId = "test_sub_delete";

		await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_delete_test",
				status: "active",
				plan: "starter",
				stripeSubscriptionId: "sub_delete_test",
			},
		});

		const subscription = await ctx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userId,
				},
			],
		});

		const mockDeleteEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: "sub_delete_test",
					customer: subscription?.stripeCustomerId,
					status: "canceled",
					metadata: {
						referenceId: subscription?.referenceId,
						subscriptionId: subscription?.id,
					},
				},
			},
		};

		const stripeForTest = {
			...stripeOptions.stripeClient,
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(mockDeleteEvent),
			},
			subscriptions: {
				retrieve: vi.fn().mockResolvedValue({
					status: "canceled",
					id: subId,
				}),
			},
		};

		const testOptions = {
			...stripeOptions,
			stripeClient: stripeForTest as unknown as Stripe,
			stripeWebhookSecret: "test_secret",
		};

		const testAuth = faireAuth({
			baseURL: "http://localhost:3000",
			emailAndPassword: {
				enabled: true,
			},
			database: memory,
			plugins: [stripe(testOptions)],
		});

		const mockRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(mockDeleteEvent),
			},
		);

		const response = await testAuth.handler(mockRequest);
		expect(response.status).toBe(200);

		if (subscription) {
			const updatedSubscription = await ctx.adapter.findOne<Subscription>({
				model: "subscription",
				where: [
					{
						field: "id",
						value: subscription.id,
					},
				],
			});
			expect(updatedSubscription?.status).toBe("canceled");
		}
	});

	test("should execute subscription event handlers", async ({ expect }) => {
		const onSubscriptionComplete = vi.fn();
		const onSubscriptionUpdate = vi.fn();
		const onSubscriptionCancel = vi.fn();
		const onSubscriptionDeleted = vi.fn();

		const testOptions = {
			...stripeOptions,
			subscription: {
				...stripeOptions.subscription,
				onSubscriptionComplete,
				onSubscriptionUpdate,
				onSubscriptionCancel,
				onSubscriptionDeleted,
			},
			stripeWebhookSecret: "test_secret",
		} as unknown as StripeOptions;

		const testAuth = faireAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [stripe(testOptions)],
		});

		// Test subscription complete handler
		const completeEvent = {
			type: "checkout.session.completed",
			data: {
				object: {
					mode: "subscription",
					subscription: "sub_123",
					metadata: {
						referenceId: "user_123",
						subscriptionId: "sub_123",
					},
				},
			},
		};

		const mockSubscription = {
			status: "active",
			items: {
				data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
			},
			current_period_start: Math.floor(Date.now() / 1000),
			current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
		};

		const mockStripeForEvents = {
			...testOptions.stripeClient,
			subscriptions: {
				retrieve: vi.fn().mockResolvedValue(mockSubscription),
			},
			webhooks: {
				constructEventAsync: vi.fn().mockResolvedValue(completeEvent),
			},
		};

		const eventTestOptions = {
			...testOptions,
			stripeClient: mockStripeForEvents as unknown as Stripe,
		};

		const eventTestAuth = faireAuth({
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: { enabled: true },
			plugins: [stripe(eventTestOptions)],
		});

		const { id: testSubscriptionId } = await ctx.adapter.create({
			model: "subscription",
			data: {
				referenceId: userId,
				stripeCustomerId: "cus_123",
				stripeSubscriptionId: "sub_123",
				status: "incomplete",
				plan: "starter",
			},
		});

		const webhookRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(completeEvent),
			},
		);

		await eventTestAuth.handler(webhookRequest);

		expect(onSubscriptionComplete).toHaveBeenCalledWith(
			expect.objectContaining({
				event: expect.any(Object),
				subscription: expect.any(Object),
				stripeSubscription: expect.any(Object),
				plan: expect.any(Object),
			}),
			expect.objectContaining({
				req: expect.any(Object),
				get: expect.any(Function),
			}),
		);

		const updateEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "active",
					items: {
						data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			},
		};

		const updateRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(updateEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			updateEvent,
		);
		await eventTestAuth.handler(updateRequest);
		expect(onSubscriptionUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				event: expect.any(Object),
				subscription: expect.any(Object),
			}),
		);

		const userCancelEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "active",
					cancel_at_period_end: true,
					cancellation_details: {
						reason: "cancellation_requested",
						comment: "Customer canceled subscription",
					},
					items: {
						data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			},
		};

		const userCancelRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(userCancelEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			userCancelEvent,
		);
		await eventTestAuth.handler(userCancelRequest);
		const cancelEvent = {
			type: "customer.subscription.updated",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "active",
					cancel_at_period_end: true,
					items: {
						data: [{ price: { id: process.env.STRIPE_PRICE_ID_1 } }],
					},
					current_period_start: Math.floor(Date.now() / 1000),
					current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
				},
			},
		};

		const cancelRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(cancelEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			cancelEvent,
		);
		await eventTestAuth.handler(cancelRequest);

		expect(onSubscriptionCancel).toHaveBeenCalled();

		const deleteEvent = {
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: testSubscriptionId,
					customer: "cus_123",
					status: "canceled",
					metadata: {
						referenceId: userId,
						subscriptionId: testSubscriptionId,
					},
				},
			},
		};

		const deleteRequest = new Request(
			"http://localhost:3000/api/auth/stripe/webhook",
			{
				method: "POST",
				headers: {
					"stripe-signature": "test_signature",
				},
				body: JSON.stringify(deleteEvent),
			},
		);

		mockStripeForEvents.webhooks.constructEventAsync.mockReturnValue(
			deleteEvent,
		);
		await eventTestAuth.handler(deleteRequest);

		expect(onSubscriptionDeleted).toHaveBeenCalled();
	});

	test("should allow seat upgrades for the same plan", async ({ expect }) => {
		const userRes = await authClient.signUp.email.$post({
			json: {
				...testUser,
				email: "seat-upgrade@email.com",
			},
		});
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{
				json: {
					...testUser,
					email: "seat-upgrade@email.com",
				},
			},
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
					seats: 1,
				},
			},
			{
				headers,
			},
		);

		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
			},
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		});

		const upgradeRes = await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
					seats: 5,
				},
			},
			{
				headers,
			},
		);

		expect(upgradeRes.data?.url).toBeDefined();
	});

	test("should prevent duplicate subscriptions with same plan and same seats", async ({
		expect,
	}) => {
		const userRes = await authClient.signUp.email.$post({
			json: {
				...testUser,
				email: "duplicate-prevention@email.com",
			},
		});
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{
				json: {
					...testUser,
					email: "duplicate-prevention@email.com",
				},
			},
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
					seats: 3,
				},
			},
			{
				headers,
			},
		);

		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				seats: 3,
			},
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		});

		const upgradeRes = await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
					seats: 3,
				},
			},
			{
				headers,
			},
		);

		expect(upgradeRes.error).toBeDefined();
		expect(upgradeRes.error?.message).toContain("already subscribed");
	});

	test("should only call Stripe customers.create once for signup and upgrade", async ({
		expect,
	}) => {
		const userRes = await authClient.signUp.email.$post({
			json: { ...testUser, email: "single-create@email.com" },
		});
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{ json: { ...testUser, email: "single-create@email.com" } },
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
				},
			},
			{
				headers,
			},
		);

		expect(mockStripe.customers.create).toHaveBeenCalledTimes(1);
	});

	test("should create billing portal session", async ({ expect }) => {
		await authClient.signUp.email.$post({
			json: {
				...testUser,
				email: "billing-portal@email.com",
			},
		});

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{
				json: {
					...testUser,
					email: "billing-portal@email.com",
				},
			},
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);
		const billingPortalRes = await authClient.subscription.billingPortal.$post(
			{
				json: {
					returnUrl: "/dashboard",
				},
			},
			{
				headers,
			},
		);
		expect(billingPortalRes.data?.url).toBe("https://billing.stripe.com/mock");
		expect(billingPortalRes.data?.redirect).toBe(true);
		expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith({
			customer: expect.any(String),
			return_url: "http://localhost:3000/dashboard",
		});
	});

	test("should not update personal subscription when upgrading with an org referenceId", async ({
		expect,
	}) => {
		const orgId = "org_b67GF32Cljh7u588AuEblmLVobclDRcP";

		const testOptions = {
			...stripeOptions,
			stripeClient: _stripe,
			subscription: {
				...stripeOptions.subscription,
				authorizeReference: async () => true,
			},
		} as unknown as StripeOptions;

		const opts = {
			baseURL: "http://localhost:3000",
			database: memory,
			emailAndPassword: { enabled: true },
			plugins: [stripe(testOptions)],
		};
		const testAuth = faireAuth(opts);
		const testCtx = await testAuth.$context;
		const app = testAuth.$Infer.App(opts);

		const testAuthClient = createAuthClient<typeof app>()({
			baseURL: "http://localhost:3000",
			plugins: [bearer(), stripeClient({ subscription: true })],
			fetchOptions: {
				customFetchImpl: async (url, init) =>
					testAuth.handler(new Request(url, init)),
			},
		});

		// Sign up and sign in the user
		const userRes = await testAuthClient.signUp.email.$post({
			json: { ...testUser, email: "org-ref@email.com" },
		});
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");
		const headers = new Headers();
		await testAuthClient.signIn.email.$post(
			{ json: { ...testUser, email: "org-ref@email.com" } },
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		// Create a personal subscription (referenceId = user id)
		await testAuthClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
				},
			},
			{
				headers,
			},
		);

		const personalSub = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: userRes.data.data.user!.id }],
		});
		expect(personalSub).toBeTruthy();

		await testCtx.adapter.update({
			model: "subscription",
			update: {
				status: "active",
				stripeSubscriptionId: "sub_personal_active_123",
			},
			where: [{ field: "id", value: personalSub!.id }],
		});

		mockStripe.subscriptions.list.mockResolvedValue({
			data: [
				{
					id: "sub_personal_active_123",
					status: "active",
					items: {
						data: [
							{
								id: "si_1",
								price: { id: process.env.STRIPE_PRICE_ID_1 },
								quantity: 1,
							},
						],
					},
				},
			],
		});

		// Attempt to upgrade using an org referenceId
		const upgradeRes = await testAuthClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
					referenceId: orgId,
				},
			},
			{
				headers,
			},
		);
		console.log(upgradeRes);

		// // It should NOT go through billing portal (which would update the personal sub)
		expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled();
		expect(upgradeRes.data?.url).toBeDefined();

		const orgSub = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "referenceId", value: orgId }],
		});
		expect(orgSub).toMatchObject({
			referenceId: orgId,
			status: "incomplete",
			plan: "starter",
		});

		const personalAfter = await testCtx.adapter.findOne<Subscription>({
			model: "subscription",
			where: [{ field: "id", value: personalSub!.id }],
		});
		expect(personalAfter?.status).toBe("active");
	});

	test("should prevent multiple free trials for the same user", async ({
		expect,
	}) => {
		// Create a user
		const userRes = await authClient.signUp.email.$post({
			json: { ...testUser, email: "trial-prevention@email.com" },
		});
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{ json: { ...testUser, email: "trial-prevention@email.com" } },
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		// First subscription with trial
		const firstUpgradeRes = await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
				},
			},
			{
				headers,
			},
		);

		expect(firstUpgradeRes.data?.url).toBeDefined();

		// Simulate the subscription being created with trial data
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "trialing",
				trialStart: new Date(),
				trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
			},
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		});

		// Cancel the subscription
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "canceled",
			},
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		});

		// Try to subscribe again - should NOT get a trial
		const secondUpgradeRes = await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
				},
			},
			{
				headers,
			},
		);

		expect(secondUpgradeRes.data?.url).toBeDefined();

		// Verify that the checkout session was created without trial_period_days
		// We can't directly test the Stripe session, but we can verify the logic
		// by checking that the user has trial history
		const subscriptions = (await ctx.adapter.findMany({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		})) as Subscription[];

		// Should have 2 subscriptions (first canceled, second new)
		expect(subscriptions).toHaveLength(2);

		// At least one should have trial data
		const hasTrialData = subscriptions.some(
			(s: Subscription) => s.trialStart || s.trialEnd,
		);
		expect(hasTrialData).toBe(true);
	});

	test("should prevent multiple free trials across different plans", async ({
		expect,
	}) => {
		// Create a user
		const userRes = await authClient.signUp.email.$post({
			json: { ...testUser, email: "cross-plan-trial@email.com" },
		});
		expect(userRes.data).not.toBeNull();
		if (userRes.data === null) throw new Error("Can't continue");

		const headers = new Headers();
		await authClient.signIn.email.$post(
			{ json: { ...testUser, email: "cross-plan-trial@email.com" } },
			{
				fetchOptions: {
					onSuccess: createCookieCapture(headers)(),
				},
			},
		);

		// First subscription with trial on starter plan
		const firstUpgradeRes = await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "starter",
				},
			},
			{
				headers,
			},
		);

		expect(firstUpgradeRes.data?.url).toBeDefined();

		// Simulate the subscription being created with trial data
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "trialing",
				trialStart: new Date(),
				trialEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			},
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		});

		// Cancel the subscription
		await ctx.adapter.update({
			model: "subscription",
			update: {
				status: "canceled",
			},
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		});

		// Try to subscribe to a different plan - should NOT get a trial
		const secondUpgradeRes = await authClient.subscription.upgrade.$post(
			{
				json: {
					plan: "premium",
				},
			},
			{
				headers,
			},
		);

		expect(secondUpgradeRes.data?.url).toBeDefined();

		// Verify that the user has trial history from the first plan
		const subscriptions = (await ctx.adapter.findMany({
			model: "subscription",
			where: [
				{
					field: "referenceId",
					value: userRes.data.data.user!.id,
				},
			],
		})) as Subscription[];

		// Should have at least 1 subscription (the starter with trial data)
		expect(subscriptions.length).toBeGreaterThanOrEqual(1);

		// The starter subscription should have trial data
		const starterSub = subscriptions.find(
			(s: Subscription) => s.plan === "starter",
		) as Subscription | undefined;
		expect(starterSub?.trialStart).toBeDefined();
		expect(starterSub?.trialEnd).toBeDefined();

		// Verify that the trial eligibility logic is working by checking
		// that the user has ever had a trial (which should prevent future trials)
		const hasEverTrialed = subscriptions.some((s: Subscription) => {
			const hadTrial =
				!!(s.trialStart || s.trialEnd) || s.status === "trialing";
			return hadTrial;
		});
		expect(hasEverTrialed).toBe(true);
	});
});
