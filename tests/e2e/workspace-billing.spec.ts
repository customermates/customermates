import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";
import type { Client as Database } from "pg";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { mintApiKey } from "./api-key";
import { collectPageErrors, expect, test } from "./fixtures";
import {
  changeProviderSubscription,
  checkoutsFor,
  deliverSubscriptionWebhook,
  postSignedWebhook,
  providerSubscription,
  startProviderSubscription,
  stubCheckoutPage,
  subscriptionWebhookBody,
} from "./lemonsqueezy";
import { localE2eEnvironment } from "./local-environment";
import { localLemonSqueezyStoreId, localLemonSqueezyVariants } from "./local-lemonsqueezy-provider.mjs";
import { addBrowserWorkspace } from "./workspace";
import {
  addAdministrator,
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  setActiveWorkspace,
} from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "Plans, checkout and the trial exist in the cloud only");

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

async function mcpWorkspaceName(key: string) {
  const { baseUrl } = localE2eEnvironment();
  const client = new Client({ name: "workspace-billing", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/v1/mcp`), {
    requestInit: { headers: { "x-api-key": key } },
  });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "get_workspace_context", arguments: {} });
    expect(result.isError).not.toBe(true);
    const { company } = z
      .looseObject({ company: z.looseObject({ id: z.string(), name: z.string().nullable() }) })
      .parse(result.structuredContent);
    return { id: company.id, name: company.name };
  } finally {
    await client.close();
  }
}

async function createWorkspaceFromSettings(page: Page, name: string) {
  await page.goto("/en/settings/workspaces");
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = page.getByRole("dialog", { name: "Create workspace" });
  await dialog.locator("#create-workspace-name").fill(name);
  await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(page.getByRole("heading", { level: 1, name: `Choose a plan for ${name}`, exact: true })).toBeVisible();
}

async function choosePlan(page: Page, plan: string) {
  const picker = page.locator("#settings-billing-plan-picker");
  await clickHydrated(picker.getByRole("button").filter({ has: page.getByText(plan, { exact: true }) }));
}

async function finishOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.wiki.title, exact: true }),
  ).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.wiki.skip, exact: true }));
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.invite.title, exact: true }),
  ).toBeVisible();
  await clickHydrated(page.locator("#onboarding-next"));
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.ai.title, exact: true }),
  ).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.finish, exact: true }));
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}

async function createApiKeyInSettings(page: Page, workspaceName: string, name: string) {
  await page.goto("/en/settings/api-keys");
  await expect(page.getByText(`These keys only access the ${workspaceName} workspace.`, { exact: true })).toBeVisible();
  await clickHydrated(page.locator("#settings-api-keys-generate"));
  const dialog = page.getByRole("dialog");
  await dialog.locator("#api-key-option-standard").click();
  await dialog.locator("#api-key-name").fill(name);
  await dialog.locator("#api-key-save").click();
  await expect(dialog.getByText(englishMessages.ApiKeyModal.keyCreated, { exact: true })).toBeVisible();
  const key = (await dialog.locator("pre code").textContent())?.trim() ?? "";
  expect(key.length).toBeGreaterThan(20);
  return key;
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

test("paying for an extra workspace activates only that workspace, then its onboarding, API key and MCP work", async ({
  page,
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

  await choosePlan(page, "Pro");
  await expect.poll(() => checkoutsFor(steuern.companyId).length).toBe(1);
  const [checkout] = checkoutsFor(steuern.companyId);
  await expect(page).toHaveURL(checkout.url);
  expect(checkoutPages).toEqual([checkout.url]);
  expect(checkout).toMatchObject({
    storeId: localLemonSqueezyStoreId,
    variantId: localLemonSqueezyVariants.pro,
    custom: { company_id: steuern.companyId },
    variantQuantities: [{ variant_id: Number(localLemonSqueezyVariants.pro), quantity: 1 }],
    enabledVariants: [Number(localLemonSqueezyVariants.pro)],
    redirectUrl: `${baseUrl}/settings/billing`,
    skipTrial: true,
  });
  expect(checkoutsFor(workspace.companyId)).toEqual([]);
  expect((await subscriptionOf(database, steuern.companyId)).status).toBe("expired");

  const paid = startProviderSubscription(steuern.companyId, "pro", 1);
  const forged = await postSignedWebhook(
    request,
    subscriptionWebhookBody("subscription_created", paid),
    "not-the-secret",
  );
  expect(forged.status()).toBe(401);
  expect((await subscriptionOf(database, steuern.companyId)).status).toBe("expired");

  await deliverSubscriptionWebhook(request, "subscription_created", paid);
  const activated = await subscriptionOf(database, steuern.companyId);
  expect(activated).toMatchObject({
    status: "active",
    plan: "pro",
    lemonSqueezyId: paid.id,
    lemonSqueezyVariantId: localLemonSqueezyVariants.pro,
    quantity: 1,
    trialEndDate: null,
  });
  expect(activated.currentPeriodEnd?.toISOString()).toBe(paid.attributes.renews_at);
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);

  await page.goto(checkout.redirectUrl as string);
  await page.screenshot({ path: testInfo.outputPath("ws-billing-onboarding.png"), fullPage: true });
  await finishOnboarding(page);
  await expectCurrentWorkspace(page, "Steuern 2026");
  await page.screenshot({ path: testInfo.outputPath("ws-billing-dashboard.png"), fullPage: true });

  const key = await createApiKeyInSettings(page, "Steuern 2026", "Steuern sync");
  const bound = await database.query<{ companyId: string }>(
    'SELECT "companyId" FROM "Apikey" WHERE "referenceId"=$1 AND name=$2',
    [workspace.authUserId, "Steuern sync"],
  );
  expect(bound.rows).toEqual([{ companyId: steuern.companyId }]);
  expect(await whoAmI(request, key)).toEqual({ status: 200, id: steuern.userId, code: null });
  expect(await mcpWorkspaceName(key)).toEqual({ id: steuern.companyId, name: "Steuern 2026" });
  expect(await whoAmI(request, earlyKey.key)).toEqual({ status: 200, id: steuern.userId, code: null });
  expect(await whoAmI(request, firstKey.key)).toEqual({ status: 200, id: workspace.userId, code: null });
  expect(await mcpWorkspaceName(firstKey.key)).toEqual({ id: workspace.companyId, name: "Browser workspace" });

  await page.goto("/en/settings/workspaces");
  await expect(page.locator(`li[data-workspace-id="${steuern.companyId}"]`)).toContainText("Pro");
  await expect(page.locator(`li[data-workspace-id="${workspace.companyId}"]`)).toContainText(/Trial/);
  await page.screenshot({ path: testInfo.outputPath("ws-billing-workspaces.png"), fullPage: true });

  await createWorkspaceFromSettings(page, "Archiv");
  const archiv = await workspaceNamed(database, "Archiv");
  expect(await subscriptionOf(database, archiv.companyId)).toMatchObject({ status: "expired", trialEndDate: null });
  expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstBefore);
  expect(await subscriptionOf(database, steuern.companyId)).toEqual(activated);

  const others = page.locator("[data-slot='restricted-workspace-switch']");
  await clickHydrated(others.getByRole("button", { name: "Browser workspace", exact: true }));
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");
  await page.goto("/en/settings/api-keys");
  await expect(page.getByText("Browser bookkeeping", { exact: true })).toBeVisible();
  await expect(page.getByText("Steuern sync", { exact: true })).toHaveCount(0);
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

  const endedAt = new Date(Date.now() - 60_000).toISOString();
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

  const others = page.locator("[data-slot='restricted-workspace-switch']");
  await clickHydrated(others.getByRole("button", { name: "Browser workspace", exact: true }));
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Browser workspace");

  await setActiveWorkspace(database, workspace, second.companyId);
  await deliverSubscriptionWebhook(
    request,
    "subscription_updated",
    changeProviderSubscription(paid.id, {
      status: "active",
      ends_at: null,
      renews_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  );
  expect((await subscriptionOf(database, second.companyId)).status).toBe("active");
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, "Bergmann Steuern");
  expect(await subscriptionOf(database, workspace.companyId)).toMatchObject({ status: "active", lemonSqueezyId: null });
  expect(errors).toEqual([]);
});
