import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import {
  type LemonSqueezySubscriptionEventName,
  type LemonSqueezySubscriptionResource,
  type LemonSqueezySubscriptionStatus,
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

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const MINUTE_MS = 60 * 1000;
const WEBHOOK_AUTH_SECRET = "checkout-pending-database-test";

type Workspace = "first" | "other";
type Member = "owner" | "colleague" | "otherOwner";

describeDatabase("a pending checkout of a workspace on PostgreSQL", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const providerDirectory = mkdtempSync(join(tmpdir(), "checkout-pending-"));
  const lemonSqueezy = localLemonSqueezyEnvironment(WEBHOOK_AUTH_SECRET);
  const companies: Record<Workspace, string> = { first: randomUUID(), other: randomUUID() };
  const roles: Record<Workspace, string> = { first: randomUUID(), other: randomUUID() };
  const members: Record<Member, { id: string; companyId: string; roleId: string }> = {
    owner: { id: randomUUID(), companyId: companies.first, roleId: roles.first },
    colleague: { id: randomUUID(), companyId: companies.first, roleId: roles.first },
    otherOwner: { id: randomUUID(), companyId: companies.other, roleId: roles.other },
  };
  const previousEnvironment: Record<string, unknown> = {};

  async function as<T>(member: Member, work: () => Promise<T>): Promise<T> {
    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    return runWithTenant(createMockUser(members[member]), work);
  }

  async function startCheckout(member: Member) {
    const { getCreateCheckoutSessionInteractor } = await import("@/core/di");
    return as(member, () => getCreateCheckoutSessionInteractor().invoke({ plan: "pro", cadence: "monthly" }));
  }

  async function checkoutState(member: Member) {
    const { getGetSubscriptionInteractor } = await import("@/core/di");
    return (await as(member, () => getGetSubscriptionInteractor().invoke())).data.checkout;
  }

  async function abandon(member: Member) {
    const { getAbandonCheckoutInteractor } = await import("@/core/di");
    return as(member, () => getAbandonCheckoutInteractor().invoke());
  }

  async function startedAt(workspace: Workspace) {
    const { rows } = await client.query<{ checkoutStartedAt: Date | null }>(
      'SELECT "checkoutStartedAt" FROM "Subscription" WHERE "companyId"=$1',
      [companies[workspace]],
    );
    return rows[0].checkoutStartedAt;
  }

  async function setStartedAt(workspace: Workspace, value: Date | null) {
    await client.query('UPDATE "Subscription" SET "checkoutStartedAt"=$2 WHERE "companyId"=$1', [
      companies[workspace],
      value,
    ]);
  }

  function checkoutsOf(workspace: Workspace) {
    return (
      readLocalCheckouts(providerDirectory) as Array<{
        custom: { company_id?: string } | null;
        expiresAt: string | null;
      }>
    ).filter((checkout) => checkout.custom?.company_id === companies[workspace]);
  }

  function providerSubscription(workspace: Workspace, status: LemonSqueezySubscriptionStatus) {
    const ids = newLocalSubscriptionIds();
    const attributes = lemonSqueezySubscriptionAttributes({
      subscriptionId: ids.id,
      itemId: ids.itemId,
      storeId: Number(localLemonSqueezyStoreId),
      storeOrigin: localCheckoutOrigin,
      variantId: Number(localLemonSqueezyVariants.pro),
      variantName: "Pro",
      quantity: 2,
      customer: { name: "Pending Payer", email: "payer@example.invalid" },
    });
    const subscription = {
      ...ids,
      companyId: companies[workspace],
      quantity: 2,
      attributes: { ...attributes, status, status_formatted: lemonSqueezyStatusFormatted(status) },
    };
    writeLocalSubscription(providerDirectory, subscription);
    return subscription;
  }

  async function deliver(
    event: LemonSqueezySubscriptionEventName,
    subscription: ReturnType<typeof providerSubscription>,
  ) {
    const resource = localSubscriptionResource(subscription) as LemonSqueezySubscriptionResource;
    const customData = signedCheckoutCustomData(subscription.companyId, process.env.BETTER_AUTH_SECRET);
    const body = JSON.stringify(lemonSqueezySubscriptionEvent(event, resource, customData));
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
    return response.status;
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

    for (const workspace of Object.keys(companies) as Workspace[]) {
      await client.query('INSERT INTO "Company" ("id","name","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)', [
        companies[workspace],
        `Pending checkout ${workspace}`,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id","companyId","status","plan","updatedAt") VALUES ($1,$2,\'expired\',\'pro\',CURRENT_TIMESTAMP)',
        [randomUUID(), companies[workspace]],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$2,CURRENT_TIMESTAMP)',
        [roles[workspace], companies[workspace]],
      );
    }
    for (const member of Object.values(members)) {
      await client.query(
        'INSERT INTO "User" ("id","email","firstName","lastName","country","companyId","roleId","status","updatedAt") VALUES ($1,$2,\'Pending\',\'Admin\',\'de\',$3,$4,\'active\',CURRENT_TIMESTAMP)',
        [member.id, `pending-${member.id}@example.invalid`, member.companyId, member.roleId],
      );
    }
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const { env } = await import("@/env");
    Object.assign(env, previousEnvironment);
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.CRM_E2E_PROVIDER_DIRECTORY;
    await client.query('DELETE FROM "Company" WHERE "id"=ANY($1)', [Object.values(companies)]);
    await client.end();
    rmSync(providerDirectory, { recursive: true, force: true });
  });

  it("records when the checkout started and opens one checkout at the provider", async () => {
    const before = Date.now();

    const result = await startCheckout("owner");

    expect(result).toMatchObject({ redirect: expect.stringContaining(`${localCheckoutOrigin}/checkout/custom/`) });
    expect(checkoutsOf("first")).toHaveLength(1);
    const recorded = await startedAt("first");
    expect(recorded?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(recorded?.getTime()).toBeLessThanOrEqual(Date.now());
    expect(checkoutsOf("first")[0].expiresAt).toBe(
      new Date((recorded?.getTime() ?? 0) + 24 * 60 * MINUTE_MS).toISOString(),
    );
    expect(await checkoutState("owner")).toBe("pending");
  });

  it("shows the pending payment to every admin and refuses them a second checkout", async () => {
    const recorded = await startedAt("first");

    expect(await checkoutState("colleague")).toBe("pending");
    expect(await startCheckout("colleague")).toEqual({ ok: true, data: { checkout: "pending" } });
    expect(await startCheckout("owner")).toEqual({ ok: true, data: { checkout: "pending" } });

    expect(checkoutsOf("first")).toHaveLength(1);
    expect(await startedAt("first")).toEqual(recorded);
  });

  it("keeps another workspace's checkout apart", async () => {
    expect(await checkoutState("otherOwner")).toBe("none");

    expect(await startCheckout("otherOwner")).toMatchObject({ redirect: expect.any(String) });

    expect(checkoutsOf("other")).toHaveLength(1);
    expect(checkoutsOf("first")).toHaveLength(1);
    expect(await checkoutState("owner")).toBe("pending");
  });

  it("brings the plans back after fifteen minutes and then allows a new checkout", async () => {
    await setStartedAt("first", new Date(Date.now() - 16 * MINUTE_MS));
    expect(await checkoutState("colleague")).toBe("overdue");
    const before = Date.now();

    expect(await startCheckout("colleague")).toMatchObject({ redirect: expect.any(String) });

    expect(checkoutsOf("first")).toHaveLength(2);
    expect((await startedAt("first"))?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(await checkoutState("owner")).toBe("pending");
  });

  it("clears the pending payment at once when an admin did not finish paying", async () => {
    expect(await abandon("owner")).toEqual({ ok: true, data: null });

    expect(await startedAt("first")).toBeNull();
    expect(await checkoutState("colleague")).toBe("none");
    expect(await startedAt("other")).not.toBeNull();
  });

  it("opens exactly one checkout when two admins start at the same moment", async () => {
    const results = await Promise.all([startCheckout("owner"), startCheckout("colleague")]);

    expect(results.filter((result) => "redirect" in result)).toHaveLength(1);
    expect(results.filter((result) => "ok" in result && result.ok)).toEqual([
      { ok: true, data: { checkout: "pending" } },
    ]);
    expect(checkoutsOf("first")).toHaveLength(3);
  });

  it("gives the earlier start back when the provider refuses the checkout", async () => {
    const overdue = new Date(Math.floor((Date.now() - 20 * MINUTE_MS) / 1000) * 1000);
    await setStartedAt("first", overdue);
    const { env } = await import("@/env");
    const storeId = env.LEMONSQUEEZY_STORE_ID;
    Object.assign(env, { LEMONSQUEEZY_STORE_ID: "1" });

    try {
      await expect(startCheckout("owner")).rejects.toThrow();
    } finally {
      Object.assign(env, { LEMONSQUEEZY_STORE_ID: storeId });
    }

    expect(await startedAt("first")).toEqual(overdue);
    expect(checkoutsOf("first")).toHaveLength(3);
  });

  it("settles the pending payment when the webhook binds the paid subscription", async () => {
    await setStartedAt("first", new Date(Date.now() - MINUTE_MS));
    const paid = providerSubscription("first", "active");

    expect(await deliver("subscription_created", paid)).toBe(200);

    expect(await startedAt("first")).toBeNull();
    expect(await checkoutState("owner")).toBe("none");
  });

  it("answers that the workspace is paid instead of opening another checkout from a stale page", async () => {
    const opened = checkoutsOf("first").length;

    expect(await startCheckout("colleague")).toEqual({ ok: true, data: { checkout: "active" } });

    expect(checkoutsOf("first")).toHaveLength(opened);
    expect(await startedAt("first")).toBeNull();
  });

  it("keeps a new checkout pending while the workspace's lapsed subscription reports it expired, and settles it on renewal", async () => {
    const lapsed = providerSubscription("other", "expired");
    expect(await deliver("subscription_created", lapsed)).toBe(200);
    await setStartedAt("other", new Date(Date.now() - MINUTE_MS));

    expect(await deliver("subscription_updated", lapsed)).toBe(200);
    expect(await checkoutState("otherOwner")).toBe("pending");

    writeLocalSubscription(providerDirectory, {
      ...lapsed,
      attributes: { ...lapsed.attributes, status: "active", status_formatted: lemonSqueezyStatusFormatted("active") },
    });
    expect(await deliver("subscription_updated", lapsed)).toBe(200);
    expect(await checkoutState("otherOwner")).toBe("none");
  });
});
