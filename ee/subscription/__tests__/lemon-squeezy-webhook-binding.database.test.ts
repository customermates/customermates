import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  type LemonSqueezyCustomData,
  type LemonSqueezySubscriptionEventName,
  type LemonSqueezySubscriptionResource,
  type LemonSqueezySubscriptionStatus,
  lemonSqueezyPaymentSuccessEvent,
  lemonSqueezyStatusFormatted,
  lemonSqueezySubscriptionAttributes,
  lemonSqueezySubscriptionEvent,
  signedCheckoutCustomData,
} from "@/tests/helpers/lemonsqueezy-subscription";
import {
  localCheckoutOrigin,
  localLemonSqueezyEnvironment,
  localLemonSqueezyRequest,
  localLemonSqueezyStoreId,
  localLemonSqueezyVariants,
  localSubscriptionResource,
  newLocalSubscriptionIds,
  readLocalCheckouts,
  writeLocalSubscription,
} from "@/tests/e2e/local-lemonsqueezy-provider.mjs";

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers({ "content-type": "application/json" })),
  cookies: () =>
    Promise.resolve({ get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

import { POST as lemonSqueezyWebhook } from "@/app/api/webhooks/lemonsqueezy/route";
import { EmailService } from "@/features/email/email.service";
import { UNSIGNED_CHECKOUT_CLAIMS_END } from "@/ee/subscription/unsigned-checkout-claims";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const OPERATOR = "operator@example.invalid";
const WEBHOOK_AUTH_SECRET = "webhook-binding-database-test";

type Workspace = "signed" | "transition" | "liveTransition" | "forged" | "twice" | "late" | "deleted" | "portal";
type ProviderPlan = keyof typeof localLemonSqueezyVariants;
type ProviderSubscription = ReturnType<typeof newProviderSubscription>;

const WORKSPACES: Workspace[] = [
  "signed",
  "transition",
  "liveTransition",
  "forged",
  "twice",
  "late",
  "deleted",
  "portal",
];

function newProviderSubscription(
  companyId: string,
  options: { plan?: ProviderPlan; status?: LemonSqueezySubscriptionStatus; createdAt?: Date } = {},
) {
  const ids = newLocalSubscriptionIds();
  const plan = options.plan ?? "pro";
  const status = options.status ?? "active";
  const attributes = lemonSqueezySubscriptionAttributes({
    subscriptionId: ids.id,
    itemId: ids.itemId,
    storeId: Number(localLemonSqueezyStoreId),
    storeOrigin: localCheckoutOrigin,
    variantId: Number(localLemonSqueezyVariants[plan]),
    variantName: plan,
    quantity: 1,
    customer: { name: "Binding Payer", email: "payer@example.invalid" },
    createdAt: options.createdAt,
  });
  return {
    ...ids,
    companyId,
    quantity: 1,
    attributes: { ...attributes, status, status_formatted: lemonSqueezyStatusFormatted(status) },
  };
}

describeDatabase("which workspace a Lemon Squeezy subscription binds to, on PostgreSQL", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const providerDirectory = mkdtempSync(join(tmpdir(), "webhook-binding-"));
  const lemonSqueezy = localLemonSqueezyEnvironment(WEBHOOK_AUTH_SECRET);
  const companies = Object.fromEntries(WORKSPACES.map((workspace) => [workspace, randomUUID()])) as Record<
    Workspace,
    string
  >;
  const owner = { id: randomUUID(), companyId: companies.signed, roleId: randomUUID() };
  const previousEnvironment: Record<string, unknown> = {};
  let sent: MockInstance<EmailService["send"]>;

  function provider(subscription: ProviderSubscription) {
    writeLocalSubscription(providerDirectory, subscription);
    return subscription;
  }

  function signed(companyId: string) {
    return signedCheckoutCustomData(companyId, process.env.BETTER_AUTH_SECRET);
  }

  async function deliver(
    event: LemonSqueezySubscriptionEventName,
    subscription: ProviderSubscription,
    customData: LemonSqueezyCustomData | null,
    resource: object = localSubscriptionResource(subscription) as LemonSqueezySubscriptionResource,
  ) {
    return post(
      JSON.stringify(lemonSqueezySubscriptionEvent(event, resource as LemonSqueezySubscriptionResource, customData)),
    );
  }

  async function deliverPayment(subscription: ProviderSubscription, customData: LemonSqueezyCustomData | null) {
    return post(JSON.stringify(lemonSqueezyPaymentSuccessEvent(subscription.id, customData)));
  }

  async function post(body: string) {
    const response = await lemonSqueezyWebhook(
      new NextRequest("http://localhost:4000/api/webhooks/lemonsqueezy", {
        method: "POST",
        body,
        headers: {
          "content-type": "application/json",
          "x-signature": createHmac("sha256", lemonSqueezy.LEMONSQUEEZY_WEBHOOK_SECRET).update(body).digest("hex"),
        },
      }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  }

  async function stored(workspace: Workspace) {
    const { rows } = await client.query<{ status: string; plan: string; lemonSqueezyId: string | null }>(
      'SELECT status::text,plan::text,"lemonSqueezyId" FROM "Subscription" WHERE "companyId"=$1',
      [companies[workspace]],
    );
    return rows[0] ?? null;
  }

  async function bindDirectly(workspace: Workspace, subscriptionId: string, status: string) {
    await client.query(
      'UPDATE "Subscription" SET "lemonSqueezyId"=$2,status=$3::"SubscriptionStatus" WHERE "companyId"=$1',
      [companies[workspace], subscriptionId, status],
    );
  }

  function mails() {
    return sent.mock.calls.map(([args]) => ({
      to: args.to,
      subject: args.subject,
      props: (args.react as { props: Record<string, unknown> }).props,
    }));
  }

  beforeAll(async () => {
    await client.connect();
    const { env } = await import("@/env");
    const patched = { APP_MODE: "cloud", RESEND_OPERATOR_EMAIL: OPERATOR, ...lemonSqueezy };
    for (const key of Object.keys(patched)) previousEnvironment[key] = env[key as keyof typeof env];
    Object.assign(env, patched);
    process.env.LEMONSQUEEZY_API_KEY = lemonSqueezy.LEMONSQUEEZY_API_KEY;
    process.env.CRM_E2E_PROVIDER_DIRECTORY = providerDirectory;
    sent = vi.spyOn(EmailService.prototype, "send").mockResolvedValue(true);
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const local = localLemonSqueezyRequest(input, init);
      if (local) return local;
      throw new Error(`Unexpected outgoing request to ${String(input instanceof Request ? input.url : input)}`);
    });

    for (const workspace of WORKSPACES) {
      await client.query('INSERT INTO "Company" ("id","name","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)', [
        companies[workspace],
        `Binding ${workspace}`,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id","companyId","status","plan","updatedAt") VALUES ($1,$2,\'expired\',\'pro\',CURRENT_TIMESTAMP)',
        [randomUUID(), companies[workspace]],
      );
    }
    await client.query(
      'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$2,CURRENT_TIMESTAMP)',
      [owner.roleId, owner.companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id","email","firstName","lastName","country","companyId","roleId","status","updatedAt") VALUES ($1,$2,\'Binding\',\'Admin\',\'de\',$3,$4,\'active\',CURRENT_TIMESTAMP)',
      [owner.id, `binding-${owner.id}@example.invalid`, owner.companyId, owner.roleId],
    );
  });

  beforeEach(() => {
    sent.mockClear();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    const { env } = await import("@/env");
    Object.assign(env, previousEnvironment);
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.CRM_E2E_PROVIDER_DIRECTORY;
    await client.query('DELETE FROM "Company" WHERE "id"=ANY($1)', [Object.values(companies)]);
    await client.end();
    rmSync(providerDirectory, { recursive: true, force: true });
  });

  it("binds the subscription paid through the app's checkout, whose workspace claim is signed", async () => {
    const { getCreateCheckoutSessionInteractor } = await import("@/core/di");
    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    await runWithTenant(createMockUser(owner), () =>
      getCreateCheckoutSessionInteractor().invoke({ plan: "pro", cadence: "monthly" }),
    );
    const [checkout] = readLocalCheckouts(providerDirectory) as Array<{ custom: LemonSqueezyCustomData }>;
    expect(checkout.custom).toEqual({
      company_id: companies.signed,
      company_signature: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const paid = provider(newProviderSubscription(companies.signed));

    expect(await deliver("subscription_created", paid, checkout.custom)).toEqual({
      status: 200,
      body: { success: true },
    });

    expect(await stored("signed")).toEqual({ status: "active", plan: "pro", lemonSqueezyId: paid.id });
    expect(mails()).toEqual([]);
  });

  it("refuses an unsigned claim on a subscription created after the transition and tells the operator", async () => {
    const late = provider(
      newProviderSubscription(companies.transition, {
        createdAt: new Date(UNSIGNED_CHECKOUT_CLAIMS_END.getTime() + DAY_MS),
      }),
    );

    expect(await deliver("subscription_created", late, { company_id: companies.transition })).toEqual({
      status: 200,
      body: { refused: true },
    });

    expect(await stored("transition")).toMatchObject({ status: "expired", lemonSqueezyId: null });
    expect(mails()).toEqual([
      {
        to: OPERATOR,
        subject: "Unsigned workspace in a Lemon Squeezy subscription",
        props: expect.objectContaining({
          reason: "unsigned",
          subscriptionId: late.id,
          workspaceId: companies.transition,
          workspaceName: "Binding transition",
        }),
      },
    ]);
  });

  it("still binds an unsigned claim of an older checkout paid before the transition ended", async () => {
    const early = provider(
      newProviderSubscription(companies.transition, {
        createdAt: new Date(UNSIGNED_CHECKOUT_CLAIMS_END.getTime() - DAY_MS),
      }),
    );

    expect((await deliver("subscription_created", early, { company_id: companies.transition })).status).toBe(200);

    expect(await stored("transition")).toEqual({ status: "active", plan: "pro", lemonSqueezyId: early.id });
    expect(mails()).toEqual([]);
  });

  it("refuses an unsigned claim during the transition when the workspace already has a live binding", async () => {
    const live = provider(
      newProviderSubscription(companies.liveTransition, { createdAt: new Date(Date.now() - 40 * DAY_MS) }),
    );
    expect((await deliver("subscription_created", live, signed(companies.liveTransition))).status).toBe(200);
    const second = provider(
      newProviderSubscription(companies.liveTransition, {
        plan: "business",
        createdAt: new Date(UNSIGNED_CHECKOUT_CLAIMS_END.getTime() - DAY_MS),
      }),
    );

    expect((await deliver("subscription_created", second, { company_id: companies.liveTransition })).body).toEqual({
      refused: true,
    });

    expect(await stored("liveTransition")).toEqual({ status: "active", plan: "pro", lemonSqueezyId: live.id });
    expect(mails().map((mail) => mail.props.reason)).toEqual(["unsigned"]);
  });

  it("refuses a forged signature, binds nothing and tells the operator", async () => {
    const forged = provider(newProviderSubscription(companies.forged));

    for (const signature of [signed(companies.signed).company_signature, "f".repeat(64), "not-hex"]) {
      expect(
        (await deliver("subscription_created", forged, { company_id: companies.forged, company_signature: signature }))
          .body,
      ).toEqual({ refused: true });
    }

    expect(await stored("forged")).toMatchObject({ status: "expired", lemonSqueezyId: null });
    const bound = await client.query('SELECT 1 FROM "Subscription" WHERE "lemonSqueezyId"=$1', [forged.id]);
    expect(bound.rows).toEqual([]);
    expect(mails().map((mail) => [mail.to, mail.props.reason, mail.props.workspaceId])).toEqual([
      [OPERATOR, "forged", companies.forged],
      [OPERATOR, "forged", companies.forged],
      [OPERATOR, "forged", companies.forged],
    ]);
  });

  it("binds the newest of two paid subscriptions and asks the operator to cancel the older one", async () => {
    const first = provider(newProviderSubscription(companies.twice, { createdAt: new Date(Date.now() - 2 * DAY_MS) }));
    expect((await deliver("subscription_created", first, signed(companies.twice))).status).toBe(200);
    const newest = provider(newProviderSubscription(companies.twice, { plan: "business" }));

    expect((await deliver("subscription_created", newest, signed(companies.twice))).status).toBe(200);

    expect(await stored("twice")).toEqual({ status: "active", plan: "business", lemonSqueezyId: newest.id });
    expect(mails()).toEqual([
      {
        to: OPERATOR,
        subject: "Workspace moved to its newest subscription",
        props: expect.objectContaining({
          reason: "replaced",
          subscriptionId: newest.id,
          otherSubscriptionId: first.id,
          workspaceId: companies.twice,
          workspaceName: "Binding twice",
        }),
      },
    ]);

    sent.mockClear();
    expect((await deliver("subscription_updated", first, signed(companies.twice))).body).toEqual({ refused: true });
    expect((await deliver("subscription_updated", newest, signed(companies.twice))).status).toBe(200);

    expect(await stored("twice")).toEqual({ status: "active", plan: "business", lemonSqueezyId: newest.id });
    expect(
      mails().map((mail) => [mail.props.reason, mail.props.subscriptionId, mail.props.otherSubscriptionId]),
    ).toEqual([["duplicate", first.id, newest.id]]);

    sent.mockClear();
    const cancelled = provider({
      ...first,
      attributes: {
        ...first.attributes,
        status: "cancelled",
        status_formatted: lemonSqueezyStatusFormatted("cancelled"),
      },
    });
    expect(await deliver("subscription_updated", cancelled, signed(companies.twice))).toEqual({
      status: 200,
      body: { ignored: true },
    });
    expect(await stored("twice")).toEqual({ status: "active", plan: "business", lemonSqueezyId: newest.id });
    expect(mails()).toEqual([]);
  });

  it("never moves a workspace back to an older subscription after its newer one was cancelled", async () => {
    const older = provider(newProviderSubscription(companies.late, { createdAt: new Date(Date.now() - 3 * DAY_MS) }));
    expect((await deliver("subscription_created", older, signed(companies.late))).status).toBe(200);
    const newer = provider(
      newProviderSubscription(companies.late, { plan: "business", createdAt: new Date(Date.now() - DAY_MS) }),
    );
    expect((await deliver("subscription_created", newer, signed(companies.late))).status).toBe(200);
    const cancelled = provider({
      ...newer,
      attributes: {
        ...newer.attributes,
        status: "cancelled",
        status_formatted: lemonSqueezyStatusFormatted("cancelled"),
      },
    });
    expect((await deliver("subscription_cancelled", cancelled, signed(companies.late))).status).toBe(200);
    expect(await stored("late")).toEqual({ status: "cancelled", plan: "business", lemonSqueezyId: newer.id });
    sent.mockClear();

    const expired = provider({
      ...older,
      attributes: { ...older.attributes, status: "expired", status_formatted: lemonSqueezyStatusFormatted("expired") },
    });
    expect(await deliver("subscription_expired", expired, signed(companies.late))).toEqual({
      status: 200,
      body: { ignored: true },
    });

    expect(await stored("late")).toEqual({ status: "cancelled", plan: "business", lemonSqueezyId: newer.id });
    expect(mails()).toEqual([]);
  });

  it("keeps updating the workspace a subscription is bound to, across a portal upgrade and downgrade", async () => {
    const subscription = provider(newProviderSubscription(companies.portal, { plan: "starter" }));
    expect((await deliver("subscription_created", subscription, signed(companies.portal))).status).toBe(200);

    for (const plan of ["business", "pro"] as const) {
      const changed = provider({
        ...subscription,
        attributes: {
          ...subscription.attributes,
          variant_id: Number(localLemonSqueezyVariants[plan]),
          variant_name: plan,
        },
      });
      expect((await deliver("subscription_updated", changed, signed(companies.signed))).status).toBe(200);
      expect(await stored("portal")).toEqual({ status: "active", plan, lemonSqueezyId: subscription.id });
    }
    expect(await stored("signed")).toMatchObject({ plan: "pro", status: "active" });
    expect(mails()).toEqual([]);
  });

  it("acknowledges events of a subscription whose workspace was deleted and tells the operator only about payments", async () => {
    const subscription = provider(newProviderSubscription(companies.deleted));
    expect((await deliver("subscription_created", subscription, signed(companies.deleted))).status).toBe(200);
    await client.query('DELETE FROM "Company" WHERE "id"=$1', [companies.deleted]);
    const acknowledged = { status: 200, body: { ignored: true } };

    for (const event of ["subscription_updated", "subscription_cancelled", "subscription_expired"] as const)
      expect(await deliver(event, subscription, signed(companies.deleted))).toEqual(acknowledged);
    expect(await deliver("subscription_updated", subscription, { company_id: companies.deleted })).toEqual(
      acknowledged,
    );
    expect(mails()).toEqual([]);

    expect(await deliverPayment(subscription, signed(companies.deleted))).toEqual(acknowledged);
    expect(await deliver("subscription_created", subscription, signed(companies.deleted))).toEqual(acknowledged);
    expect(await deliver("subscription_updated", subscription, null)).toEqual({ status: 200, body: { refused: true } });

    expect(mails().map((mail) => [mail.props.reason, mail.props.eventName, mail.props.workspaceId])).toEqual([
      ["workspaceMissing", "subscription_payment_success", companies.deleted],
      ["workspaceMissing", "subscription_created", companies.deleted],
      ["unclaimed", "subscription_updated", null],
    ]);
    const bound = await client.query('SELECT "companyId" FROM "Subscription" WHERE "lemonSqueezyId"=$1', [
      subscription.id,
    ]);
    expect(bound.rows).toEqual([]);
  });

  it("acknowledges a payment of a subscription a live workspace holds without telling the operator", async () => {
    const subscription = provider(newProviderSubscription(companies.portal));
    await bindDirectly("portal", subscription.id, "active");
    const before = await stored("portal");

    expect(await deliverPayment(subscription, signed(companies.deleted))).toEqual({
      status: 200,
      body: { ignored: true },
    });

    expect(await stored("portal")).toEqual(before);
    expect(mails()).toEqual([]);
  });

  it("acknowledges an invoice event without binding anything or telling the operator", async () => {
    const subscription = provider(newProviderSubscription(companies.forged));

    const response = await deliver("subscription_payment_success", subscription, signed(companies.forged), {
      type: "subscription-invoices",
      id: subscription.id,
      attributes: { subscription_id: Number(subscription.id), status: "paid" },
    });

    expect(response).toEqual({ status: 200, body: { ignored: true } });
    expect(await stored("forged")).toMatchObject({ status: "expired", lemonSqueezyId: null });
    expect(mails()).toEqual([]);
  });

  it("writes a subscription only while the workspace still holds the binding a decision was made on", async () => {
    const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
    await bindDirectly("forged", "999999998", "active");

    const written = await new PrismaCompanyRepo().writeSubscriptionUnscoped({
      companyId: companies.forged,
      expectedLemonSqueezyId: null,
      lemonSqueezyId: "999999999",
      status: "active",
      plan: "business",
    });

    expect(written).toBe(false);
    expect(await stored("forged")).toEqual({ status: "active", plan: "pro", lemonSqueezyId: "999999998" });
  });
});
