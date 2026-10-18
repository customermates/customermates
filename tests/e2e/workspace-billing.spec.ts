import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";
import type { Client as Database } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { lemonSqueezyTimestamp } from "../helpers/lemonsqueezy-subscription";
import { mintApiKey } from "./api-key";
import { collectPageErrors, expect, test } from "./fixtures";
import {
  changeProviderSubscription,
  checkoutsFor,
  deliverSubscriptionWebhook,
  deliverWebhookBody,
  postSignedWebhook,
  providerSubscription,
  signedCustomData,
  startProviderSubscription,
  stubCheckoutPage,
  subscriptionWebhookBody,
} from "./lemonsqueezy";
import { localE2eEnvironment } from "./local-environment";
import { localLemonSqueezyStoreId, localLemonSqueezyVariants } from "./local-lemonsqueezy-provider.mjs";
import { secondUser } from "./second-user";
import { addBrowserWorkspace } from "./workspace";
import { mcpWorkspaceName } from "./workspace-credentials";
import { choosePlan, createApiKeyInSettings, createWorkspaceFromSettings, finishOnboarding } from "./workspace-setup";
import {
  addAdministrator,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  setActiveWorkspace,
  switchFromBlockedPage,
} from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "Plans, checkout and the trial exist in the cloud only");

const DAY_MS = 24 * 60 * 60 * 1000;

type StoredSubscription = {
  status: string;
  plan: string;
  lemonSqueezyId: string | null;
  lemonSqueezyVariantId: string | null;
  quantity: number | null;
  trialEndDate: Date | null;
  currentPeriodEnd: Date | null;
};

async function subscriptionOf(database: Database, companyId: string): Promise<StoredSubscription> {
  const { rows } = await database.query<StoredSubscription>(
    'SELECT status::text,plan::text,"lemonSqueezyId","lemonSqueezyVariantId",quantity,"trialEndDate","currentPeriodEnd" FROM "Subscription" WHERE "companyId"=$1',
    [companyId],
  );
  if (rows.length !== 1) throw new Error("The workspace subscription is missing");
  return rows[0];
}

async function boundWorkspaces(database: Database, subscriptionId: string) {
  const { rows } = await database.query<{ companyId: string }>(
    'SELECT "companyId" FROM "Subscription" WHERE "lemonSqueezyId"=$1',
    [subscriptionId],
  );
  return rows.map((row) => row.companyId);
}

async function paidConversions(database: Database, companyId: string) {
  const { rows } = await database.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM "ConversionEvent" WHERE "companyId"=$1 AND type=\'paid\'',
    [companyId],
  );
  return rows[0].count;
}

async function loginEmailOf(database: Database, authUserId: string) {
  const { rows } = await database.query<{ email: string }>('SELECT email FROM "AuthUser" WHERE id=$1', [authUserId]);
  return rows[0].email;
}

async function expectBilling(page: Page, plan: string, status: string, seats: number) {
  await page.goto("/en/settings/billing");
  await expect(page).toHaveURL(/\/en\/settings\/billing$/);
  const planField = page.getByRole("textbox", { name: englishMessages.Subscription.plan, exact: true });
  await expect(planField).toContainText(plan);
  await expect(planField).toContainText(status);
  await expect(page.getByRole("textbox", { name: englishMessages.Subscription.quantity, exact: true })).toHaveText(
    String(seats),
  );
}

async function workspaceNamed(database: Database, name: string) {
  const { rows } = await database.query<{ companyId: string; userId: string }>(
    'SELECT c.id AS "companyId",u.id AS "userId" FROM "Company" c JOIN "User" u ON u."companyId"=c.id WHERE c.name=$1',
    [name],
  );
  if (rows.length !== 1) throw new Error(`Expected one workspace named ${name}`);
  return rows[0];
}

async function whoAmI(request: APIRequestContext, key: string) {
  const response = await request.get("/api/v1/users/me", { headers: { "x-api-key": key } });
  const body = (await response.json()) as { id?: string; error?: { issues?: Array<{ customCode?: string }> } };
  return {
    status: response.status(),
    id: response.ok() ? (body.id ?? null) : null,
    code: body.error?.issues?.[0]?.customCode ?? null,
  };
}

async function mcpInitialize(request: APIRequestContext, key: string) {
  const response = await request.post("/api/v1/mcp", {
    headers: { "x-api-key": key, accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "workspace-billing", version: "1" },
      },
    },
  });
  const text = await response.text();
  return {
    status: response.status(),
    error: response.status() === 403 ? (JSON.parse(text) as { error: string }).error : null,
  };
}

async function approveMember(page: Page, name: string, status: "Active" | "Inactive") {
  await page.goto("/en/settings/members");
  await clickHydrated(page.locator('[data-slot="data-row-open"]').filter({ hasText: name }));
  const member = page.getByRole("dialog", { name: "User", exact: true });
  if (status === "Active") {
    await member.locator("#member-modal-role").click();
    await page.getByRole("option", { name: "Admin", exact: true }).click();
  }
  await member.locator("#member-modal-status").click();
  await page.getByRole("option", { name: status, exact: true }).click();
  await member.getByRole("button", { name: "Save", exact: true }).click();
  await expect(member).not.toBeVisible();
}

test("paying Business for an extra workspace activates only it in the real event order, replayed, then its onboarding, API key and MCP work", async ({
  page,
  browser,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(300_000);
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  await database.query(
    "UPDATE \"Subscription\" SET status='trial',\"trialEndDate\"=date_trunc('second',NOW()+interval '3 days') WHERE \"companyId\"=$1",
    [workspace.companyId],
  );
  const firstBefore = await subscriptionOf(database, workspace.companyId);
  const firstKey = await mintApiKey(database, workspace, "Browser bookkeeping");
  const checkoutPages = await stubCheckoutPage(page);

  await createWorkspaceFromSettings(page, "Steuern 2026");
  const steuern = await workspaceNamed(database, "Steuern 2026");
  expect(await subscriptionOf(database, steuern.companyId)).toEqual({
    status: "expired",
    plan: "pro",
    lemonSqueezyId: null,
    lemonSqueezyVariantId: null,
    quantity: null,
    trialEndDate: null,
    currentPeriodEnd: null,
  });
  await expect(page.getByText(englishMessages.Workspaces.firstPlan.subtitle, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ws-billing-first-plan.png"), fullPage: true });

  const earlyKey = await mintApiKey(
    database,
    { authUserId: workspace.authUserId, companyId: steuern.companyId },
    "Too early",
  );
  expect(await whoAmI(request, earlyKey.key)).toEqual({ status: 403, id: null, code: "workspacePlanRequired" });
  expect(await mcpInitialize(request, earlyKey.key)).toEqual({ status: 403, error: "plan_required" });

  await choosePlan(page, "Business");
  await expect.poll(() => checkoutsFor(steuern.companyId).length).toBe(1);
  const [checkout] = checkoutsFor(steuern.companyId);
  await expect(page).toHaveURL(checkout.url);
  expect(checkoutPages).toEqual([checkout.url]);
  expect(checkout).toMatchObject({
    storeId: localLemonSqueezyStoreId,
    variantId: localLemonSqueezyVariants.business,
    custom: signedCustomData(steuern.companyId),
    variantQuantities: [{ variant_id: Number(localLemonSqueezyVariants.business), quantity: 1 }],
    enabledVariants: [Number(localLemonSqueezyVariants.business)],
    productName: "Steuern 2026",
    redirectUrl: `${baseUrl}/settings/billing`,
    skipTrial: true,
  });
  expect(checkoutsFor(workspace.companyId)).toEqual([]);

  const paid = startProviderSubscription(steuern.companyId, "business", 1, {
    name: "Browser Administrator",
    email: await loginEmailOf(database, workspace.authUserId),
  });
  await page.goto(checkout.redirectUrl as string);
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Choose a plan for Steuern 2026", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#settings-billing-payment-pending")).toBeVisible();
  await expect(page.locator("#settings-billing-plan-picker")).toHaveCount(0);
  expect((await subscriptionOf(database, steuern.companyId)).status).toBe("expired");

  const created = subscriptionWebhookBody("subscription_created", paid, checkout.custom);
  expect(JSON.parse(created)).toMatchObject({
    data: {
      type: "subscriptions",
      id: paid.id,
      attributes: {
        status: "active",
        ends_at: null,
        cancelled: false,
        test_mode: true,
        card_brand: "visa",
        variant_id: Number(localLemonSqueezyVariants.business),
        product_name: "Customermates Subscription",
        variant_name: "Business",
        trial_ends_at: null,
        card_last_four: "4242",
        status_formatted: "Active",
        payment_processor: "stripe",
        first_subscription_item: { quantity: 1, subscription_id: Number(paid.id), is_usage_based: false },
        pause: null,
      },
    },
    meta: {
      test_mode: true,
      event_name: "subscription_created",
      webhook_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      custom_data: { company_id: steuern.companyId, company_signature: expect.stringMatching(/^[0-9a-f]{64}$/) },
    },
  });
  const renewsAt = new Date(paid.attributes.renews_at as string);
  const oneMonthLater = new Date(paid.attributes.created_at);
  oneMonthLater.setUTCMonth(oneMonthLater.getUTCMonth() + 1);
  expect(renewsAt).toEqual(oneMonthLater);
  expect(paid.attributes.renews_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000000Z$/);

  const forged = await postSignedWebhook(request, created, "not-the-secret");
  expect(forged.status()).toBe(401);
  expect((await subscriptionOf(database, steuern.companyId)).status).toBe("expired");

  await deliverWebhookBody(request, created);
  const activated = await subscriptionOf(database, steuern.companyId);
  expect(activated).toEqual({
    status: "active",
    plan: "business",
    lemonSqueezyId: paid.id,
    lemonSqueezyVariantId: localLemonSqueezyVariants.business,
    quantity: 1,
    trialEndDate: null,
    currentPeriodEnd: renewsAt,
  });
  const updated = await deliverSubscriptionWebhook(
    request,
    "subscription_updated",
    changeProviderSubscription(paid.id, {}),
  );
  expect(JSON.parse(updated).meta.webhook_id).not.toBe(JSON.parse(created).meta.webhook_id);
  expect(await subscriptionOf(database, steuern.companyId)).toEqual(activated);
  for (const replay of [created, updated]) {
    await deliverWebhookBody(request, replay);
    expect(await subscriptionOf(database, steuern.companyId)).toEqual(activated);
  }
  expect(await boundWorkspaces(database, paid.id)).toEqual([steuern.companyId]);
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);

  await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
  await page.screenshot({ path: testInfo.outputPath("ws-billing-onboarding.png"), fullPage: true });
  await finishOnboarding(page);
  await expectCurrentWorkspace(page, "Steuern 2026");
  await page.screenshot({ path: testInfo.outputPath("ws-billing-dashboard.png"), fullPage: true });
  await page.goto("/en/subscription-expired");
  await expect(page).toHaveURL(/\/en\/settings\/billing$/);
  await expectBilling(page, "Business", "Active", 1);
  await expect(
    page.getByRole("textbox", { name: englishMessages.Subscription.currentPeriodEnd, exact: true }),
  ).toContainText(String(renewsAt.getUTCFullYear()));
  await expect(page.locator("#settings-billing-plan-picker")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("ws-billing-business.png"), fullPage: true });

  const key = await createApiKeyInSettings(page, "Steuern 2026", "Steuern sync");
  const bound = await database.query<{ companyId: string }>(
    'SELECT "companyId" FROM "Apikey" WHERE "referenceId"=$1 AND name=$2',
    [workspace.authUserId, "Steuern sync"],
  );
  expect(bound.rows).toEqual([{ companyId: steuern.companyId }]);
  expect(await whoAmI(request, key)).toEqual({ status: 200, id: steuern.userId, code: null });
  expect(await mcpWorkspaceName(key)).toEqual({ id: steuern.companyId, name: "Steuern 2026" });
  expect(await whoAmI(request, earlyKey.key)).toEqual({ status: 200, id: steuern.userId, code: null });
  expect(await mcpInitialize(request, earlyKey.key)).toEqual({ status: 200, error: null });
  expect(await whoAmI(request, firstKey.key)).toEqual({ status: 200, id: workspace.userId, code: null });
  expect(await mcpWorkspaceName(firstKey.key)).toEqual({ id: workspace.companyId, name: "Browser workspace" });

  await page.goto("/en/settings/billing");
  await clickHydrated(page.locator("#settings-billing-manage"));
  await expect(page).toHaveURL(paid.attributes.urls.customer_portal);
  expect(checkoutPages.at(-1)).toBe(paid.attributes.urls.customer_portal);

  const coAdmin = await secondUser(browser, database, steuern.companyId, testInfo);
  try {
    const coAdminPages = await stubCheckoutPage(coAdmin.page);
    await coAdmin.page.goto("/en/settings/billing");
    await clickHydrated(coAdmin.page.locator("#settings-billing-manage"));
    await expect(coAdmin.page).toHaveURL(paid.attributes.urls.update_payment_method);
    expect(coAdminPages).toEqual([paid.attributes.urls.update_payment_method]);
    expect(coAdmin.errors).toEqual([]);
  } finally {
    await coAdmin.close();
  }

  await page.goto("/en/settings/workspaces");
  await expect(page.locator(`li[data-workspace-id="${steuern.companyId}"]`)).toContainText("Business");
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toContainText(/Trial/);
  await page.screenshot({ path: testInfo.outputPath("ws-billing-workspaces.png"), fullPage: true });

  await createWorkspaceFromSettings(page, "Archiv");
  const archiv = await workspaceNamed(database, "Archiv");
  expect(await subscriptionOf(database, archiv.companyId)).toMatchObject({ status: "expired", trialEndDate: null });
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);
  expect(await subscriptionOf(database, steuern.companyId)).toEqual(activated);

  await switchFromBlockedPage(page, workspace.companyId);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  await expectBilling(page, "Pro", "Trial", 1);
  await page.goto("/en/settings/api-keys");
  await expect(page.getByText("Browser bookkeeping", { exact: true })).toBeVisible();
  await expect(page.getByText("Steuern sync", { exact: true })).toHaveCount(0);
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);
  expect(errors).toEqual([]);
});

test("a reversed and replayed delivery of the subscription events activates the workspace once", async ({
  page,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const firstBefore = await subscriptionOf(database, workspace.companyId);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await database.query(
    'UPDATE "Subscription" SET status=\'expired\',"trialEndDate"=NULL,"currentPeriodEnd"=NULL WHERE "companyId"=$1',
    [second.companyId],
  );
  await database.query(
    'INSERT INTO "AdAttribution" (id,"companyId","userId",provider,"identifierKind","identifierValue","clickedAt","capturedAt","consentedAt","consentNoticeVersion","expiresAt") VALUES ($1,$2,$3,\'google\',\'gclid\',$4,NOW(),NOW(),NOW(),\'2026-10-01\',NOW()+interval \'30 days\')',
    [randomUUID(), second.companyId, second.userId, `e2e-${randomUUID()}`],
  );
  await setActiveWorkspace(database, workspace, second.companyId);
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(page.locator("#settings-billing-plan-picker")).toBeVisible();

  const paid = startProviderSubscription(second.companyId, "business", 1, {
    name: "Browser Administrator",
    email: await loginEmailOf(database, workspace.authUserId),
  });
  const created = subscriptionWebhookBody("subscription_created", paid);
  const updated = subscriptionWebhookBody("subscription_updated", paid);
  await deliverWebhookBody(request, updated);
  const activated = await subscriptionOf(database, second.companyId);
  expect(activated).toEqual({
    status: "active",
    plan: "business",
    lemonSqueezyId: paid.id,
    lemonSqueezyVariantId: localLemonSqueezyVariants.business,
    quantity: 1,
    trialEndDate: null,
    currentPeriodEnd: new Date(paid.attributes.renews_at as string),
  });
  for (const delivery of [created, updated, created]) {
    await deliverWebhookBody(request, delivery);
    expect(await subscriptionOf(database, second.companyId)).toEqual(activated);
  }
  expect(await paidConversions(database, second.companyId)).toBe(1);
  expect(await boundWorkspaces(database, paid.id)).toEqual([second.companyId]);
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);

  await page.reload();
  await expect(page).toHaveURL(/\/en\/settings\/billing$/);
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  await expectBilling(page, "Business", "Active", 1);
  await page.screenshot({ path: testInfo.outputPath(`ws-billing-reversed-${testInfo.project.name}.png`) });
  expect(errors).toEqual([]);
});

test("a signed event naming another or an unknown workspace activates neither and keeps the paid one in sync", async ({
  page,
  request,
  database,
  workspace,
}) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  await database.query(
    "UPDATE \"Subscription\" SET status='trial',\"trialEndDate\"=date_trunc('second',NOW()+interval '3 days') WHERE \"companyId\"=$1",
    [workspace.companyId],
  );
  const firstBefore = await subscriptionOf(database, workspace.companyId);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await database.query(
    'UPDATE "Subscription" SET status=\'expired\',"trialEndDate"=NULL,"currentPeriodEnd"=NULL WHERE "companyId"=$1',
    [second.companyId],
  );
  const paid = startProviderSubscription(second.companyId, "business", 1);
  await deliverSubscriptionWebhook(request, "subscription_created", paid);
  expect(await subscriptionOf(database, second.companyId)).toMatchObject({ status: "active", plan: "business" });

  const renewed = changeProviderSubscription(paid.id, {
    renews_at: lemonSqueezyTimestamp(new Date(Date.now() + 45 * DAY_MS)),
  });
  const foreign = await postSignedWebhook(
    request,
    subscriptionWebhookBody("subscription_updated", renewed, signedCustomData(workspace.companyId)),
  );
  expect(foreign.status(), await foreign.text()).toBe(200);
  expect(await subscriptionOf(database, second.companyId)).toMatchObject({
    status: "active",
    plan: "business",
    lemonSqueezyId: paid.id,
    currentPeriodEnd: new Date(renewed.attributes.renews_at as string),
  });
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);
  expect(await boundWorkspaces(database, paid.id)).toEqual([second.companyId]);

  const stray = startProviderSubscription(randomUUID(), "business", 1);
  for (const event of ["subscription_updated", "subscription_created"] as const) {
    const unknown = await postSignedWebhook(request, subscriptionWebhookBody(event, stray));
    expect(unknown.status()).toBe(200);
    expect(await unknown.json()).toEqual({ ignored: true });
  }
  expect(await boundWorkspaces(database, stray.id)).toEqual([]);
  const missing = await request.post("/api/webhooks/lemonsqueezy", {
    data: subscriptionWebhookBody("subscription_created", stray, signedCustomData(workspace.companyId)),
    headers: { "content-type": "application/json" },
  });
  expect(missing.status()).toBe(401);
  expect(await boundWorkspaces(database, stray.id)).toEqual([]);
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);

  await expectBilling(page, "Pro", "Trial", 1);
  await page.goto("/en/settings/workspaces");
  await expect(page.locator(`li[data-workspace-id="${second.companyId}"]`)).toContainText("Business");
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toContainText(/Trial/);
  expect(errors).toEqual([]);
});

test("each paid workspace bills its own seats when members are approved or deactivated", async ({
  page,
  request,
  database,
  workspace,
}) => {
  test.setTimeout(240_000);
  const errors = collectPageErrors(page);
  const first = startProviderSubscription(workspace.companyId, "starter", 1);
  await deliverSubscriptionWebhook(request, "subscription_created", first);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  await database.query(
    'UPDATE "Subscription" SET status=\'expired\',"trialEndDate"=NULL,"currentPeriodEnd"=NULL WHERE "companyId"=$1',
    [second.companyId],
  );
  await addAdministrator(database, second.companyId, `jonas-${randomUUID()}@example.test`);
  const pendingId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","updatedAt") VALUES ($1,$2,$3,\'Mara\',\'Lind\',\'pendingAuthorization\',true,NOW(),NOW())',
    [pendingId, second.companyId, `mara-${pendingId}@example.test`],
  );
  await setActiveWorkspace(database, workspace, second.companyId);
  await stubCheckoutPage(page);
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await choosePlan(page, "Business");
  await expect.poll(() => checkoutsFor(second.companyId).length).toBe(1);
  await expect(page).toHaveURL(checkoutsFor(second.companyId)[0].url);
  expect(checkoutsFor(second.companyId)[0].variantQuantities).toEqual([
    { variant_id: Number(localLemonSqueezyVariants.business), quantity: 2 },
  ]);
  const paid = startProviderSubscription(second.companyId, "business", 2);
  await deliverSubscriptionWebhook(request, "subscription_created", paid);
  expect(await subscriptionOf(database, second.companyId)).toMatchObject({
    status: "active",
    plan: "business",
    quantity: 2,
  });

  await approveMember(page, "Mara Lind", "Active");
  await expect.poll(() => providerSubscription(paid.id).quantity).toBe(3);
  await approveMember(page, "Mara Lind", "Inactive");
  await expect.poll(() => providerSubscription(paid.id).quantityUpdates).toEqual([3, 2]);
  expect(providerSubscription(first.id).quantity).toBe(1);
  expect(providerSubscription(first.id).quantityUpdates).toBeUndefined();

  await deliverSubscriptionWebhook(request, "subscription_updated", providerSubscription(paid.id));
  expect(await subscriptionOf(database, second.companyId)).toMatchObject({ quantity: 2, plan: "business" });
  expect(await subscriptionOf(database, workspace.companyId)).toMatchObject({
    status: "active",
    plan: "starter",
    lemonSqueezyId: first.id,
    quantity: 1,
  });
  expect(errors).toEqual([]);
});

test("a lapsed paid workspace keeps its integrations through the grace, asks to renew and recovers when paid again", async ({
  page,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectPageErrors(page);
  const second = await addBrowserWorkspace(database, workspace, "Bergmann Steuern");
  const paid = startProviderSubscription(second.companyId, "pro", 1);
  await deliverSubscriptionWebhook(request, "subscription_created", paid);
  const key = await mintApiKey(
    database,
    { authUserId: workspace.authUserId, companyId: second.companyId },
    "Bergmann sync",
  );
  await setActiveWorkspace(database, workspace, second.companyId);

  await deliverSubscriptionWebhook(
    request,
    "subscription_updated",
    changeProviderSubscription(paid.id, { status: "past_due" }),
  );
  expect((await subscriptionOf(database, second.companyId)).status).toBe("pastDue");
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect(await whoAmI(request, key.key)).toEqual({ status: 200, id: second.userId, code: null });

  const endedAt = lemonSqueezyTimestamp(new Date(Date.now() - 60_000));
  await deliverSubscriptionWebhook(
    request,
    "subscription_expired",
    changeProviderSubscription(paid.id, { status: "expired", renews_at: null, ends_at: endedAt }),
  );
  expect(await subscriptionOf(database, second.companyId)).toMatchObject({
    status: "expired",
    lemonSqueezyId: paid.id,
    trialEndDate: null,
  });
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.SubscriptionExpiredView.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(englishMessages.SubscriptionExpiredView.selfServiceCheckoutDescription, { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#settings-billing-plan-picker")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("ws-billing-lapsed.png"), fullPage: true });
  expect(await whoAmI(request, key.key)).toEqual({ status: 200, id: second.userId, code: null });
  expect(await mcpWorkspaceName(key.key)).toEqual({ id: second.companyId, name: "Bergmann Steuern" });

  await switchFromBlockedPage(page, workspace.companyId);
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");

  await setActiveWorkspace(database, workspace, second.companyId);
  await deliverSubscriptionWebhook(
    request,
    "subscription_updated",
    changeProviderSubscription(paid.id, {
      status: "active",
      ends_at: null,
      renews_at: lemonSqueezyTimestamp(new Date(Date.now() + 30 * DAY_MS)),
    }),
  );
  expect((await subscriptionOf(database, second.companyId)).status).toBe("active");
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect(await subscriptionOf(database, workspace.companyId)).toMatchObject({ status: "active", lemonSqueezyId: null });
  expect(errors).toEqual([]);
});
