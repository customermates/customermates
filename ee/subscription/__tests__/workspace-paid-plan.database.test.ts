import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defaultKeyHasher } from "@better-auth/api-key";
import { serializeSignedCookie } from "better-call";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  localLemonSqueezyEnvironment,
  localLemonSqueezyRequest,
  localLemonSqueezyVariants,
  newLocalSubscriptionIds,
  readLocalCheckouts,
  readLocalSubscription,
  writeLocalSubscription,
} from "@/tests/e2e/local-lemonsqueezy-provider.mjs";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
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

import { GET as me } from "@/app/api/v1/users/me/route";
import { POST as lemonSqueezyWebhook } from "@/app/api/webhooks/lemonsqueezy/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_AUTH_SECRET = "workspace-paid-plan-database-test";

type Workspace = "first" | "paid" | "unpaid";

type ProviderSubscription = {
  id: string;
  itemId: number;
  companyId: string;
  quantity: number;
  quantityUpdates?: number[];
  attributes: Record<string, unknown>;
};

describeDatabase("paying for an extra workspace of one login on PostgreSQL", { timeout: 180_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const providerDirectory = mkdtempSync(join(tmpdir(), "workspace-paid-plan-"));
  const lemonSqueezy = localLemonSqueezyEnvironment(WEBHOOK_AUTH_SECRET);
  const authUserId = randomUUID();
  const email = `paid-${randomUUID()}@example.invalid`;
  const colleagueEmail = `colleague-${randomUUID()}@example.invalid`;
  const pendingEmail = `pending-${randomUUID()}@example.invalid`;
  const companies: Record<Workspace, string> = { first: randomUUID(), paid: randomUUID(), unpaid: randomUUID() };
  const roles: Record<Workspace, string> = { first: randomUUID(), paid: randomUUID(), unpaid: randomUUID() };
  const members: Record<Workspace, string> = { first: randomUUID(), paid: randomUUID(), unpaid: randomUUID() };
  const colleagueId = randomUUID();
  const pendingId = randomUUID();
  const firstTrialEnd = new Date(Math.floor((Date.now() + 5 * DAY_MS) / 1000) * 1000);
  const keys: { first: string; paid?: string } = { first: randomUUID().replaceAll("-", "").repeat(2) };
  const previousEnvironment: Record<string, unknown> = {};
  let cookie = "";
  let subscription: ProviderSubscription;

  function asSession() {
    requestContext.headers = new Headers({ cookie, "content-type": "application/json" });
  }

  async function whoAmI(key: string) {
    requestContext.headers = new Headers({ "content-type": "application/json", "x-api-key": key });
    const response = await me();
    const body = (await response.json()) as { id?: string };
    return { status: response.status, userId: response.status === 200 ? (body.id ?? null) : null };
  }

  async function storedSubscription(workspace: Workspace) {
    const { rows } = await client.query<{
      status: string;
      plan: string;
      lemonSqueezyId: string | null;
      quantity: number | null;
      trialEndDate: Date | null;
      currentPeriodEnd: Date | null;
    }>(
      'SELECT status::text,plan::text,"lemonSqueezyId",quantity,"trialEndDate","currentPeriodEnd" FROM "Subscription" WHERE "companyId"=$1',
      [companies[workspace]],
    );
    return rows[0];
  }

  async function memberStatuses() {
    const { rows } = await client.query<{ id: string; status: string }>(
      'SELECT id,status::text FROM "User" WHERE "companyId"=ANY($1)',
      [Object.values(companies)],
    );
    return Object.fromEntries(rows.map((row) => [row.id, row.status]));
  }

  function webhook(event: string, body: ProviderSubscription, secret = lemonSqueezy.LEMONSQUEEZY_WEBHOOK_SECRET) {
    const raw = JSON.stringify({
      meta: { event_name: event, custom_data: { company_id: body.companyId } },
      data: { type: "subscriptions", id: body.id, attributes: body.attributes },
    });
    return lemonSqueezyWebhook(
      new NextRequest("http://localhost:4000/api/webhooks/lemonsqueezy", {
        method: "POST",
        body: raw,
        headers: {
          "content-type": "application/json",
          "x-signature": createHmac("sha256", secret).update(raw).digest("hex"),
        },
      }),
    );
  }

  function providerSubscription() {
    return readLocalSubscription(providerDirectory, subscription.id) as ProviderSubscription;
  }

  function changeProvider(attributes: Record<string, unknown>) {
    subscription = { ...providerSubscription(), attributes: { ...providerSubscription().attributes, ...attributes } };
    writeLocalSubscription(providerDirectory, subscription);
    return subscription;
  }

  beforeAll(async () => {
    await client.connect();
    const { env } = await import("@/env");
    const patched = { APP_MODE: "cloud", ...lemonSqueezy };
    for (const key of Object.keys(patched)) previousEnvironment[key] = env[key as keyof typeof env];
    Object.assign(env, patched);
    process.env.LEMONSQUEEZY_API_KEY = lemonSqueezy.LEMONSQUEEZY_API_KEY;
    process.env.CRM_E2E_PROVIDER_DIRECTORY = providerDirectory;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const local = localLemonSqueezyRequest(input, init);
      if (local) return local;
      throw new Error(`Unexpected outgoing request to ${String(input instanceof Request ? input.url : input)}`);
    });

    const subscriptions: Record<Workspace, [string, Date | null, Date]> = {
      first: ["trial", firstTrialEnd, new Date()],
      paid: ["expired", null, new Date()],
      unpaid: ["expired", null, new Date(Date.now() - 30 * DAY_MS)],
    };
    for (const workspace of Object.keys(companies) as Workspace[]) {
      const [status, trialEndDate, updatedAt] = subscriptions[workspace];
      await client.query(
        'INSERT INTO "Company" ("id","name","createdByAuthUserId","updatedAt") VALUES ($1,$2,$3,CURRENT_TIMESTAMP)',
        [companies[workspace], `Paid plan ${workspace}`, authUserId],
      );
      await client.query(
        'INSERT INTO "Subscription" ("id","companyId","status","plan","trialEndDate","updatedAt") VALUES ($1,$2,$3::"SubscriptionStatus",\'pro\',$4,$5)',
        [randomUUID(), companies[workspace], status, trialEndDate, updatedAt],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$2,CURRENT_TIMESTAMP)',
        [roles[workspace], companies[workspace]],
      );
    }
    for (const [id, companyId, roleId, memberEmail, status] of [
      [members.first, companies.first, roles.first, email, "active"],
      [members.paid, companies.paid, roles.paid, email, "active"],
      [members.unpaid, companies.unpaid, roles.unpaid, email, "active"],
      [colleagueId, companies.paid, roles.paid, colleagueEmail, "active"],
      [pendingId, companies.paid, null, pendingEmail, "pendingAuthorization"],
    ] as const) {
      await client.query(
        'INSERT INTO "User" ("id","email","firstName","lastName","country","companyId","roleId","status","lastActiveAt","onboardingWizardCompletedAt","updatedAt") VALUES ($1,$2,\'Paid\',\'Member\',\'de\',$3,$4,$5::"Status",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [id, memberEmail, companyId, roleId, status],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id","name","email","emailVerified","companyId","updatedAt") VALUES ($1,\'Paid Member\',$2,TRUE,$3,CURRENT_TIMESTAMP)',
      [authUserId, email, companies.paid],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const workspace of ["first", "paid"] as const) {
      const owner = createMockUser({
        id: members[workspace],
        companyId: companies[workspace],
        roleId: roles[workspace],
      });
      await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
    }

    await client.query(
      'INSERT INTO "Apikey" ("id","name","key","referenceId","companyId","configId","enabled","rateLimitEnabled","requestCount","createdAt","updatedAt") VALUES ($1,\'First\',$2,$3,$4,\'default\',TRUE,FALSE,0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
      [randomUUID(), await defaultKeyHasher(keys.first), authUserId, companies.first],
    );
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id","token","userId","expiresAt","activeCompanyId","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), token, authUserId, new Date(Date.now() + 60 * 60 * 1000), companies.paid],
    );
    const { auth } = await import("@/core/auth/better-auth");
    cookie = (await serializeSignedCookie("app.session_token", token, (await auth.$context).secret)).split(";")[0];
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    const { env } = await import("@/env");
    Object.assign(env, previousEnvironment);
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.CRM_E2E_PROVIDER_DIRECTORY;
    await client.query('DELETE FROM "Apikey" WHERE "referenceId"=$1', [authUserId]);
    await client.query('DELETE FROM "AuthUser" WHERE "id"=$1', [authUserId]);
    await client.query('DELETE FROM "Company" WHERE "id"=ANY($1)', [Object.values(companies)]);
    await client.end();
    rmSync(providerDirectory, { recursive: true, force: true });
  });

  it("starts the checkout of the extra workspace with its own company id and only its active members as seats", async () => {
    const { getCreateCheckoutSessionInteractor } = await import("@/core/di");
    const { isRedirect } = await import("@/features/auth/auth-outcome");
    const { env } = await import("@/env");
    asSession();

    const result = await getCreateCheckoutSessionInteractor().invoke({ plan: "pro", cadence: "monthly" });

    const checkouts = readLocalCheckouts(providerDirectory) as Array<Record<string, unknown>>;
    expect(checkouts).toHaveLength(1);
    expect(isRedirect(result) ? result.redirect : null).toBe(checkouts[0].url);
    expect(checkouts[0]).toMatchObject({
      variantId: localLemonSqueezyVariants.pro,
      custom: { company_id: companies.paid },
      variantQuantities: [{ variant_id: Number(localLemonSqueezyVariants.pro), quantity: 2 }],
      redirectUrl: `${env.BASE_URL}/settings/billing`,
      skipTrial: true,
    });
    expect(await storedSubscription("paid")).toMatchObject({ status: "expired", lemonSqueezyId: null });
  });

  it("refuses a forged webhook and activates only the paid workspace on the signed one", async () => {
    const ids = newLocalSubscriptionIds();
    subscription = {
      ...ids,
      companyId: companies.paid,
      quantity: 2,
      attributes: {
        status: "active",
        variant_id: Number(localLemonSqueezyVariants.pro),
        renews_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
        ends_at: null,
        trial_ends_at: null,
        urls: { customer_portal: "https://customermates.lemonsqueezy.com/billing" },
      },
    };
    writeLocalSubscription(providerDirectory, subscription);

    expect((await webhook("subscription_created", subscription, "forged")).status).toBe(401);
    expect(await storedSubscription("paid")).toMatchObject({ status: "expired", lemonSqueezyId: null });

    const response = await webhook("subscription_created", subscription);

    expect(response.status).toBe(200);
    expect(await storedSubscription("paid")).toEqual({
      status: "active",
      plan: "pro",
      lemonSqueezyId: subscription.id,
      quantity: 2,
      trialEndDate: null,
      currentPeriodEnd: new Date(subscription.attributes.renews_at as string),
    });
    expect(await storedSubscription("first")).toEqual({
      status: "trial",
      plan: "pro",
      lemonSqueezyId: null,
      quantity: null,
      trialEndDate: firstTrialEnd,
      currentPeriodEnd: null,
    });
    expect(await storedSubscription("unpaid")).toMatchObject({ status: "expired", lemonSqueezyId: null });
  });

  it("lets the paid workspace create an API key that reaches only that workspace", async () => {
    const { getCreateApiKeyInteractor } = await import("@/core/di");
    asSession();

    const created = await getCreateApiKeyInteractor().invoke({ name: "Paid workspace" });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    keys.paid = created.data.key;
    const bound = await client.query<{ companyId: string }>('SELECT "companyId" FROM "Apikey" WHERE "id"=$1', [
      created.data.id,
    ]);
    expect(bound.rows).toEqual([{ companyId: companies.paid }]);
    expect(await whoAmI(keys.paid)).toEqual({ status: 200, userId: members.paid });
    expect(await whoAmI(keys.first)).toEqual({ status: 200, userId: members.first });
  });

  it("trusts the provider over a stale webhook payload for the paid workspace", async () => {
    const stale = {
      ...subscription,
      attributes: {
        ...subscription.attributes,
        status: "expired",
        ends_at: new Date(Date.now() - DAY_MS).toISOString(),
      },
    };

    expect((await webhook("subscription_updated", stale)).status).toBe(200);

    expect(await storedSubscription("paid")).toMatchObject({ status: "active", lemonSqueezyId: subscription.id });
  });

  it("updates the seats of the paid workspace's subscription when a member is approved or deactivated", async () => {
    const { getAdminUpdateUserDetailsInteractor } = await import("@/core/di");
    asSession();

    const approved = await getAdminUpdateUserDetailsInteractor().invoke({
      userId: pendingId,
      roleId: roles.paid,
      status: "active",
    });
    expect(approved.ok).toBe(true);
    expect(providerSubscription()).toMatchObject({ quantity: 3, quantityUpdates: [3] });

    const deactivated = await getAdminUpdateUserDetailsInteractor().invoke({ userId: pendingId, status: "inactive" });
    expect(deactivated.ok).toBe(true);
    expect(providerSubscription()).toMatchObject({ quantity: 2, quantityUpdates: [3, 2] });
    expect(readLocalCheckouts(providerDirectory)).toHaveLength(1);
  });

  it("keeps the lapsed workspace's API key through the grace, then deactivates only its members", async () => {
    const { getCreateApiKeyInteractor, getDeactivateUsersAfterSubscriptionGracePeriodInteractor, getUserRepo } =
      await import("@/core/di");
    const { CustomErrorCode } = await import("@/core/validation/validation.types");
    const { interactorFailureCodes } = await import("@/core/validation/validation.utils");
    const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
    const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
    const { EmailService } = await import("@/features/email/email.service");
    const lapsedAt = new Date(Date.now() - 60_000).toISOString();

    const lapsed = await webhook(
      "subscription_expired",
      changeProvider({ status: "expired", renews_at: null, ends_at: lapsedAt }),
    );

    expect(lapsed.status).toBe(200);
    expect(await storedSubscription("paid")).toMatchObject({
      status: "expired",
      lemonSqueezyId: subscription.id,
      currentPeriodEnd: new Date(lapsedAt),
    });
    expect(await whoAmI(keys.paid as string)).toEqual({ status: 200, userId: members.paid });
    asSession();
    const refusedKey = await getCreateApiKeyInteractor().invoke({ name: "During the grace" });
    expect(refusedKey.ok).toBe(false);
    if (!refusedKey.ok)
      expect(interactorFailureCodes(refusedKey.error)).toEqual([CustomErrorCode.workspacePlanRequired]);

    await client.query('UPDATE "Subscription" SET "updatedAt"=$2 WHERE "companyId"=$1', [
      companies.paid,
      new Date(Date.now() - 4 * DAY_MS),
    ]);
    const ours = new Set(Object.values(companies));
    const due = (await runWithoutTenant(() => getUserRepo().findUsersPastSubscriptionGracePeriod())).filter((user) =>
      ours.has(user.companyId),
    );
    expect(due.map((user) => user.id).sort()).toEqual([members.paid, colleagueId].sort());
    vi.spyOn(PrismaUserRepo.prototype, "findUsersPastSubscriptionGracePeriod").mockResolvedValue(due);
    const sent = vi.spyOn(EmailService.prototype, "send").mockResolvedValue(true);

    await getDeactivateUsersAfterSubscriptionGracePeriodInteractor().invoke();

    expect(await memberStatuses()).toEqual({
      [members.first]: "active",
      [members.paid]: "inactive",
      [members.unpaid]: "active",
      [colleagueId]: "inactive",
      [pendingId]: "inactive",
    });
    expect(sent.mock.calls.map(([args]) => args.to).sort()).toEqual([colleagueEmail, email].sort());
    expect(await whoAmI(keys.paid as string)).toEqual({ status: 403, userId: null });
    expect(await whoAmI(keys.first)).toEqual({ status: 200, userId: members.first });
    expect(await storedSubscription("first")).toMatchObject({ status: "trial", trialEndDate: firstTrialEnd });
  });
});
