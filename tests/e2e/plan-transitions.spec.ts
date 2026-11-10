import type { APIRequestContext, Page } from "@playwright/test";
import type { Client as Database } from "pg";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { mintApiKey } from "./api-key";
import { appPath, appUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import {
  changeProviderSubscription,
  deliverWebhookBody,
  paymentWebhookBody,
  postSignedWebhook,
  providerSubscription,
  startProviderSubscription,
  subscriptionWebhookBody,
} from "./lemonsqueezy";
import { localLemonSqueezyVariants } from "./local-lemonsqueezy-provider.mjs";
import {
  PLAN_NAME,
  accountRows,
  activateAgentCredit,
  addRoutine,
  addWebhook,
  connectAccount,
  endTrial,
  inboxState,
  mateUsage,
  memberRows,
  moveTo,
  rateWindows,
  readSurfaces,
  routineRows,
  setRateWindow,
  shareAccount,
  sharedAccounts,
  startTrial,
  subscribe,
  subscriptionRow,
  webhookRows,
} from "./plan-state";
import type { Surfaces } from "./plan-state";
import { providerRemovals } from "./provider-accounts";
import { secondUser } from "./second-user";
import { sentEmailsTo, emailText } from "./transactional-mail";
import { saveRole } from "./view-sharing-helpers";
import { addBrowserWorkspace } from "./workspace";
import { loginEmail } from "./workspace-membership";
import { openSidebar } from "./sidebar";
import { e2eAppMode, setActiveWorkspace } from "./workspace-switching";

import { presetId } from "@/features/records/crm-preset";

const DAY_MS = 86_400_000;
const REMOVED_NOTICE = englishMessages.AccountsRemovedNotice.subject;

const STARTER = localLemonSqueezyVariants.starter;
const PRO = localLemonSqueezyVariants.pro;
const BUSINESS = localLemonSqueezyVariants.business;

function surfaces(overrides: Partial<Surfaces>): Surfaces {
  return {
    billing: "Pro Active",
    card: null,
    paymentBanner: false,
    pausedBanner: false,
    inbox: "open",
    inboxTag: null,
    routines: "list",
    webhooks: "list",
    mate: "chat",
    ...overrides,
  };
}

const FREE = surfaces({
  billing: "Free Current plan",
  card: "free",
  inbox: "locked-plan",
  inboxTag: "Pro",
  routines: "locked",
  webhooks: "locked",
  mate: "upgrade",
});

function removalNotices(address: string) {
  return sentEmailsTo(address).filter((email) => email.subject === REMOVED_NOTICE);
}

function mcpPayload(text: string) {
  const body = text.trim();
  if (body.startsWith("{") || body.startsWith("[")) return JSON.parse(body) as unknown;
  const data = body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);
  return data.length ? (JSON.parse(data.at(-1) as string) as unknown) : null;
}

async function mcp(request: APIRequestContext, key: string, body: unknown) {
  const response = await request.post("/api/v1/mcp", {
    headers: { "x-api-key": key, accept: "application/json, text/event-stream" },
    data: body,
  });
  const text = await response.text();
  return {
    status: response.status(),
    headers: response.headers(),
    body: mcpPayload(text) as Record<string, unknown> | null,
  };
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "plan-transitions", version: "1" } },
};

let callSequence = 100;

function toolCall(name = "get_workspace_context") {
  callSequence += 1;
  return { jsonrpc: "2.0", id: callSequence, method: "tools/call", params: { name, arguments: {} } };
}

async function whoAmI(request: APIRequestContext, key: string) {
  const response = await request.get("/api/v1/users/me", { headers: { "x-api-key": key } });
  return response;
}

async function waitForSafeMinute(window = 12_000) {
  const into = Date.now() % 60_000;
  if (into > 60_000 - window) await new Promise((resolve) => setTimeout(resolve, 60_000 - into + 500));
}

async function legacyRole(database: Database, companyId: string, name: string) {
  const roleId = randomUUID();
  await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,NOW())', [
    roleId,
    companyId,
    name,
  ]);
  for (const resource of ["inboxMessages", "routines", "api"])
    await database.query(
      'INSERT INTO "RolePermission" (id,"roleId","companyId",resource,action) VALUES ($1,$2,$3,$4,\'readAll\')',
      [randomUUID(), roleId, companyId, resource],
    );
  return roleId;
}

async function syncFreePlan(request: APIRequestContext, companyId: string) {
  const response = await request.get(`/api/cron/free-plan?companyId=${companyId}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { paused: number; resumed: number };
}

async function lockCard(page: Page, slug: string, path: string) {
  await page.goto(appPath(slug, path));
  await page.waitForLoadState("networkidle");
  return page.locator("[data-locked-feature]");
}

async function billingControls(page: Page, slug: string) {
  await page.goto(appPath(slug, "/settings/billing"));
  await page.waitForLoadState("networkidle");
  const plan = page.getByRole("textbox", { name: englishMessages.Subscription.plan, exact: true });
  await expect(plan).toBeVisible();
  return {
    plan: (await plan.innerText()).replace(/\s+/g, " ").trim(),
    manage: await page.locator("#settings-billing-manage").count(),
    refresh: await page.locator("#settings-billing-refresh").count(),
    picker: await page.locator("#settings-billing-plan-picker").count(),
  };
}

function channelCard(page: Page, address: string) {
  return page.getByRole("button").filter({ hasText: address });
}

const ASK_ADMIN = (plan: string) => `Only workspace admins can change the plan. Ask an admin to choose ${plan}.`;

test.describe("plans on Customermates Cloud", () => {
  test.skip(e2eAppMode() !== "cloud", "Plans, subscriptions and the Free plan exist in the cloud only");

  test("Pro to Starter locks the Inbox and removes the accounts but keeps Mate, routines and webhooks, and Starter to Pro opens the Inbox again", async ({
    page,
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(300_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const hook = "https://hooks.example.test/pro-to-starter";
    const adminEmail = await loginEmail(database, workspace);
    const paid = await subscribe(request, workspace, "pro");
    const accounts = [
      await connectAccount(database, workspace, "google", "first@synthetic.test", 30),
      await connectAccount(database, workspace, "outlook", "second@synthetic.test", 10),
    ];
    await addRoutine(database, workspace, "Morning digest");
    await addWebhook(database, workspace.companyId, hook);

    expect(await subscriptionRow(database, workspace.companyId)).toEqual({
      status: "active",
      plan: "pro",
      variant: PRO,
      quantity: 1,
      bound: true,
      trialEnded: null,
    });
    expect(await readSurfaces(page, slug)).toEqual(surfaces({}));
    expect(await mateUsage(page, slug)).toBe("Pro plan · 3x Mate usage");
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "first@synthetic.test", status: "ok" },
      { address: "second@synthetic.test", status: "ok" },
    ]);

    const starterBody = await moveTo(request, paid, { plan: "starter" });

    expect(await subscriptionRow(database, workspace.companyId)).toEqual({
      status: "active",
      plan: "starter",
      variant: STARTER,
      quantity: 1,
      bound: true,
      trialEnded: null,
    });
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "first@synthetic.test", status: "deleted" },
      { address: "second@synthetic.test", status: "deleted" },
    ]);
    expect(await routineRows(database, workspace.companyId)).toEqual([
      { name: "Morning digest", enabled: true, paused: false, reason: null },
    ]);
    expect(await webhookRows(database, workspace.companyId)).toEqual([{ url: hook, enabled: true }]);
    expect(await memberRows(database, workspace.companyId)).toEqual([
      { name: "Browser Administrator", status: "active", paused: false },
    ]);
    expect(providerRemovals(accounts)).toEqual([1, 1]);
    const notices = removalNotices(adminEmail);
    expect(notices).toHaveLength(1);
    expect(emailText(notices[0])).toContain("first@synthetic.test");
    expect(emailText(notices[0])).toContain("second@synthetic.test");

    expect(await readSurfaces(page, slug)).toEqual(
      surfaces({ billing: "Starter Active", inbox: "locked-plan", inboxTag: "Pro" }),
    );
    expect(await mateUsage(page, slug)).toBe("Starter plan · 1x Mate usage");
    await expect(page.locator('[data-upsell-notice="mate-usage"]')).toContainText("Upgrade to Pro");
    await page.goto(appPath(slug, "/routines"));
    const allowance = page.locator('[data-upsell-notice="routines"]');
    await expect(allowance).toContainText("You are using every routine your Starter plan includes");
    await expect(allowance.getByRole("link", { name: "Upgrade to Pro" })).toBeVisible();
    await expect(page.getByText("Morning digest", { exact: true })).toBeVisible();
    await page.goto(appPath(slug, "/settings/channels"));
    await expect(page.locator("[data-locked-feature]")).toContainText(englishMessages.MessagingUpsell.title);
    await page.goto(appPath(slug, "/settings/webhooks"));
    await expect(page.getByText(hook, { exact: false })).toBeVisible();

    await page.goto(appPath(slug, "/inbox"));
    await page.locator("[data-locked-feature]").getByRole("link", { name: "Upgrade to Pro" }).click();
    await expect(page).toHaveURL(appUrlPattern(slug, "/settings/billing\\?plan=pro$"));
    await expect(page.getByRole("textbox", { name: englishMessages.Subscription.plan, exact: true })).toContainText(
      "Starter",
    );
    await expect(page.locator("#settings-billing-plan-picker")).toHaveCount(0);
    await expect(page.locator("#settings-billing-manage")).toBeVisible();

    await moveTo(request, paid, { plan: "pro" });
    expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
      status: "active",
      plan: "pro",
      variant: PRO,
    });
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "first@synthetic.test", status: "deleted" },
      { address: "second@synthetic.test", status: "deleted" },
    ]);
    expect(await readSurfaces(page, slug)).toEqual(surfaces({}));
    expect(await mateUsage(page, slug)).toBe("Pro plan · 3x Mate usage");
    await page.goto(appPath(slug, "/settings/channels"));
    await expect(page.locator("[data-locked-feature]")).toHaveCount(0);
    for (const address of ["first@synthetic.test", "second@synthetic.test"]) {
      await expect(channelCard(page, address)).toContainText(/Status\s*Deleted/);
      await expect(channelCard(page, address)).not.toContainText(/Status\s*Connected/);
    }

    await deliverWebhookBody(request, starterBody);
    expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({ plan: "pro", variant: PRO });
    expect(await inboxState(page, slug)).toBe("open");
    expect(providerRemovals(accounts)).toEqual([1, 1]);
    expect(removalNotices(adminEmail)).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test("Starter to Business, Business to Pro and back to Business and Starter follow the per-user account allowance and the seats", async ({
    page,
    browser,
    request,
    database,
    workspace,
  }, testInfo) => {
    test.setTimeout(360_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const role = await saveRole(page, {
      name: `Sales ${randomUUID().slice(0, 6)}`,
      description: "Reads the Inbox and routines, connects channels and may use the API",
      permissions: [
        { resource: "inboxMessages", actions: ["readAll", "create"] },
        { resource: "routines", actions: ["readAll"] },
        { resource: "api", actions: ["readAll"] },
      ],
      recordGrants: [],
    });
    const member = await secondUser(browser, database, workspace.companyId, testInfo, role.role.id);
    await activateAgentCredit(database, member.userId);
    try {
      const paid = await subscribe(request, workspace, "starter", 2);
      await moveTo(request, paid, { plan: "business", quantity: 3 });
      expect(await subscriptionRow(database, workspace.companyId)).toEqual({
        status: "active",
        plan: "business",
        variant: BUSINESS,
        quantity: 3,
        bound: true,
        trialEnded: null,
      });
      await page.goto(appPath(slug, "/settings/billing"));
      await expect(page.getByRole("textbox", { name: englishMessages.Subscription.plan, exact: true })).toContainText(
        "Business",
      );
      await expect(page.getByRole("textbox", { name: englishMessages.Subscription.quantity, exact: true })).toHaveText(
        "3",
      );
      expect(await inboxState(page, slug)).toBe("open");
      expect(await inboxState(member.page, slug)).toBe("open");
      expect(await mateUsage(page, slug)).toBe("Business plan · 10x Mate usage");
      expect(await mateUsage(member.page, slug)).toBe("Business plan · 10x Mate usage");

      const owner = { companyId: workspace.companyId, userId: workspace.userId };
      const colleague = { companyId: workspace.companyId, userId: member.userId };
      const adminEmail = await loginEmail(database, workspace);
      const accounts = [
        await connectAccount(database, owner, "google", "admin-1@synthetic.test", 60),
        await connectAccount(database, owner, "outlook", "admin-2@synthetic.test", 50),
        await connectAccount(database, owner, "linkedin", "admin-3@synthetic.test", 40),
        await connectAccount(database, colleague, "google", "member-1@synthetic.test", 30),
        await connectAccount(database, colleague, "outlook", "member-2@synthetic.test", 20),
      ];

      await page.goto(appPath(slug, "/settings/channels"));
      await page.locator("#settings-channels-connect").click();
      await page.getByRole("menuitem", { name: "Gmail" }).click();
      await expect(page.getByText(englishMessages.ConnectedAccountsCard.accountLimitReached)).toBeVisible();
      await expect(page.locator("[data-connect-upsell]")).toHaveCount(0);

      await moveTo(request, paid, { plan: "pro" });
      expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
        status: "active",
        plan: "pro",
        variant: PRO,
        quantity: 3,
      });
      expect(await accountRows(database, workspace.companyId)).toEqual([
        { address: "admin-1@synthetic.test", status: "ok" },
        { address: "admin-2@synthetic.test", status: "deleted" },
        { address: "admin-3@synthetic.test", status: "deleted" },
        { address: "member-1@synthetic.test", status: "ok" },
        { address: "member-2@synthetic.test", status: "deleted" },
      ]);
      expect(providerRemovals(accounts)).toEqual([0, 1, 1, 0, 1]);
      const proNotices = removalNotices(adminEmail);
      expect(proNotices).toHaveLength(1);
      const noticeText = emailText(proNotices[0]);
      for (const removed of ["admin-2", "admin-3", "member-2"])
        expect(noticeText).toContain(`${removed}@synthetic.test`);
      for (const kept of ["admin-1", "member-1"]) expect(noticeText).not.toContain(`${kept}@synthetic.test`);
      expect(sentEmailsTo(member.email).filter((email) => email.subject === REMOVED_NOTICE)).toEqual([]);

      await page.goto(appPath(slug, "/settings/channels"));
      await expect(channelCard(page, "admin-1@synthetic.test")).toContainText(/Status\s*Connected/);
      for (const address of ["admin-2", "admin-3"])
        await expect(channelCard(page, `${address}@synthetic.test`)).toContainText(/Status\s*Deleted/);
      await member.page.goto(appPath(slug, "/settings/channels"));
      await expect(channelCard(member.page, "member-1@synthetic.test")).toContainText(/Status\s*Connected/);
      await expect(channelCard(member.page, "member-2@synthetic.test")).toContainText(/Status\s*Deleted/);
      await expect(channelCard(member.page, "admin-1@synthetic.test")).toHaveCount(0);
      expect(await inboxState(member.page, slug)).toBe("open");

      await page.locator("#settings-channels-connect").click();
      await page.getByRole("menuitem", { name: "Gmail" }).click();
      const upsell = page.locator("[data-connect-upsell]");
      await expect(upsell).toContainText(englishMessages.ConnectedAccountsCard.upgradeToBusinessForMoreAccounts);
      await expect(upsell.getByRole("link", { name: "Upgrade to Business" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(upsell).toHaveCount(0);

      await member.page.goto(appPath(slug, "/settings/channels"));
      await member.page.locator("#settings-channels-connect").click();
      await member.page.getByRole("menuitem", { name: "Gmail" }).click();
      const memberUpsell = member.page.locator("[data-connect-upsell]");
      await expect(memberUpsell).toContainText(englishMessages.ConnectedAccountsCard.upgradeToBusinessForMoreAccounts);
      await expect(memberUpsell).toContainText(
        "Only workspace admins can change the plan. Ask an admin to choose Business.",
      );
      await expect(memberUpsell.getByRole("link", { name: "Upgrade to Business" })).toHaveCount(0);
      await member.page.keyboard.press("Escape");

      await moveTo(request, paid, { plan: "business" });
      expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
        status: "active",
        plan: "business",
        variant: BUSINESS,
        quantity: 3,
      });
      expect((await accountRows(database, workspace.companyId)).map((account) => account.status)).toEqual([
        "ok",
        "deleted",
        "deleted",
        "ok",
        "deleted",
      ]);
      accounts.push(
        await connectAccount(database, owner, "outlook", "admin-4@synthetic.test", 5),
        await connectAccount(database, owner, "linkedin", "admin-5@synthetic.test", 4),
      );
      await page.goto(appPath(slug, "/settings/channels"));
      await page.locator("#settings-channels-connect").click();
      await page.getByRole("menuitem", { name: "Gmail" }).click();
      await expect(page.getByText(englishMessages.ConnectedAccountsCard.accountLimitReached)).toBeVisible();
      await expect(page.locator("[data-connect-upsell]")).toHaveCount(0);

      await moveTo(request, paid, { plan: "starter", quantity: 2 });
      expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
        status: "active",
        plan: "starter",
        variant: STARTER,
        quantity: 2,
      });
      expect((await accountRows(database, workspace.companyId)).map((account) => account.status)).toEqual([
        "deleted",
        "deleted",
        "deleted",
        "deleted",
        "deleted",
        "deleted",
        "deleted",
      ]);
      expect(providerRemovals(accounts)).toEqual([1, 1, 1, 1, 1, 1, 1]);
      expect(removalNotices(adminEmail)).toHaveLength(2);
      expect(await inboxState(page, slug)).toBe("locked-plan");
      expect(await inboxState(member.page, slug)).toBe("locked-plan");
      await member.page.goto(appPath(slug, "/settings/billing"));
      await expect(
        member.page.getByRole("textbox", { name: englishMessages.Subscription.quantity, exact: true }),
      ).toHaveText("2");
      expect(errors).toEqual([]);
      expect(member.errors).toEqual([]);
    } finally {
      await member.close();
    }
  });

  test("replayed, duplicated and reordered deliveries of plan changes end in the plan the provider holds, once", async ({
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(240_000);
    const paid = await subscribe(request, workspace, "pro");
    const owner = { companyId: workspace.companyId, userId: workspace.userId };
    const adminEmail = await loginEmail(database, workspace);
    const accounts = [
      await connectAccount(database, owner, "google", "kept@synthetic.test", 40),
      await connectAccount(database, owner, "outlook", "gone@synthetic.test", 20),
    ];
    const created = subscriptionWebhookBody("subscription_created", providerSubscription(paid.id));

    const business = subscriptionWebhookBody(
      "subscription_updated",
      changeProviderSubscription(paid.id, { plan: "business" }),
    );
    const starter = subscriptionWebhookBody(
      "subscription_updated",
      changeProviderSubscription(paid.id, { plan: "starter" }),
    );
    const pro = subscriptionWebhookBody("subscription_updated", changeProviderSubscription(paid.id, { plan: "pro" }));

    for (const body of [pro, starter, business, created, starter, pro, business, pro]) {
      await deliverWebhookBody(request, body);
      expect(await subscriptionRow(database, workspace.companyId)).toEqual({
        status: "active",
        plan: "pro",
        variant: PRO,
        quantity: 1,
        bound: true,
        trialEnded: null,
      });
    }
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "kept@synthetic.test", status: "ok" },
      { address: "gone@synthetic.test", status: "ok" },
    ]);
    expect(removalNotices(adminEmail)).toEqual([]);
    expect(providerRemovals(accounts)).toEqual([0, 0]);

    const downgrade = await moveTo(request, paid, { plan: "starter" });
    const upgrade = await moveTo(request, paid, { plan: "business", quantity: 2 });
    expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
      plan: "business",
      variant: BUSINESS,
      quantity: 2,
    });

    for (const body of [downgrade, upgrade, downgrade, upgrade, created]) {
      await deliverWebhookBody(request, body);
      expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
        status: "active",
        plan: "business",
        variant: BUSINESS,
        quantity: 2,
      });
    }
    expect((await accountRows(database, workspace.companyId)).map((account) => account.status)).toEqual([
      "deleted",
      "deleted",
    ]);
    expect(removalNotices(adminEmail)).toHaveLength(1);
    expect(providerRemovals(accounts)).toEqual([1, 1]);

    const last = await moveTo(request, paid, { plan: "pro", quantity: 1 });
    await deliverWebhookBody(request, downgrade);
    await deliverWebhookBody(request, last);
    const settled = {
      status: "active",
      plan: "pro",
      variant: PRO,
      quantity: 1,
      bound: true,
      trialEnded: null,
    };
    expect(await subscriptionRow(database, workspace.companyId)).toEqual(settled);

    for (const payment of [
      paymentWebhookBody(providerSubscription(paid.id)),
      paymentWebhookBody(providerSubscription(paid.id)),
    ]) {
      const answered = await postSignedWebhook(request, payment);
      expect(answered.status()).toBe(200);
      expect(await answered.json()).toEqual({ ignored: true });
      expect(await subscriptionRow(database, workspace.companyId)).toEqual(settled);
    }
    expect(providerRemovals(accounts)).toEqual([1, 1]);
  });

  test("a failed payment, a cancellation and an unpaid plan lock the Inbox and Mate or the whole app, and the provider's recovery restores everything", async ({
    page,
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(360_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const paid = await subscribe(request, workspace, "pro");
    const owner = { companyId: workspace.companyId, userId: workspace.userId };
    await connectAccount(database, owner, "google", "billing@synthetic.test", 20);
    await addRoutine(database, owner, "Billing watch");
    const { key } = await mintApiKey(database, workspace, "Billing integration");

    await moveTo(request, paid, { status: "past_due" });
    expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({ status: "pastDue", plan: "pro" });
    expect(await readSurfaces(page, slug)).toEqual(
      surfaces({ billing: "Pro Past Due", paymentBanner: true, inbox: "locked-subscription", mate: "unavailable" }),
    );
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "billing@synthetic.test", status: "ok" },
    ]);
    expect((await whoAmI(request, key)).status()).toBe(200);

    await moveTo(request, paid, { status: "active" });
    expect(await readSurfaces(page, slug)).toEqual(surfaces({}));

    const endsAt = new Date(Date.now() + 20 * DAY_MS);
    await moveTo(
      request,
      paid,
      { status: "cancelled", renews_at: null, ends_at: endsAt.toISOString() },
      "subscription_cancelled",
    );
    expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({ status: "cancelled", plan: "pro" });
    expect(await readSurfaces(page, slug)).toEqual(
      surfaces({ billing: "Pro Cancelled", inbox: "locked-subscription", mate: "unavailable" }),
    );
    await expect(
      page.getByRole("textbox", { name: englishMessages.Subscription.currentPeriodEnd, exact: true }),
    ).toContainText(String(endsAt.getUTCFullYear()));
    expect((await whoAmI(request, key)).status()).toBe(200);

    await moveTo(request, paid, {
      status: "active",
      ends_at: null,
      renews_at: new Date(Date.now() + 30 * DAY_MS).toISOString(),
    });
    expect(await readSurfaces(page, slug)).toEqual(surfaces({}));

    await moveTo(request, paid, { status: "unpaid" });
    expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({ status: "unPaid", plan: "pro" });
    await page.goto(appPath(slug, "/dashboard"));
    await expect(page).toHaveURL(appUrlPattern(slug, "/subscription-expired$"));
    await expect(
      page.getByRole("heading", { level: 1, name: englishMessages.SubscriptionExpiredView.title, exact: true }),
    ).toBeVisible();
    expect((await whoAmI(request, key)).status()).toBe(200);
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "billing@synthetic.test", status: "ok" },
    ]);

    await moveTo(request, paid, { status: "active" });
    await page.goto(appPath(slug, "/dashboard"));
    await expect(page).toHaveURL(appUrlPattern(slug, "/dashboard$"));
    expect(await readSurfaces(page, slug)).toEqual(surfaces({}));

    await moveTo(
      request,
      paid,
      { status: "expired", renews_at: null, ends_at: new Date(Date.now() - 60_000).toISOString() },
      "subscription_expired",
    );
    expect(await subscriptionRow(database, workspace.companyId)).toEqual({
      status: "expired",
      plan: "pro",
      variant: PRO,
      quantity: 1,
      bound: true,
      trialEnded: null,
    });
    await page.goto(appPath(slug, "/dashboard"));
    await expect(page).toHaveURL(appUrlPattern(slug, "/subscription-expired$"));
    await expect(page.locator("#settings-billing-plan-picker")).toBeVisible();
    expect((await whoAmI(request, key)).status()).toBe(200);
    expect(await memberRows(database, workspace.companyId)).toEqual([
      { name: "Browser Administrator", status: "active", paused: false },
    ]);

    const renewed = startProviderSubscription(
      workspace.companyId,
      "starter",
      1,
      undefined,
      new Date(Date.now() + 5000),
    );
    await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", renewed));
    expect(await subscriptionRow(database, workspace.companyId)).toEqual({
      status: "active",
      plan: "starter",
      variant: STARTER,
      quantity: 1,
      bound: true,
      trialEnded: null,
    });
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "billing@synthetic.test", status: "deleted" },
    ]);
    await page.goto(appPath(slug, "/dashboard"));
    await expect(page).toHaveURL(appUrlPattern(slug, "/dashboard$"));
    expect(await readSurfaces(page, slug)).toEqual(
      surfaces({ billing: "Starter Active", inbox: "locked-plan", inboxTag: "Pro" }),
    );
    expect(errors).toEqual([]);
  });

  test("a paid plan that ends after the trial moves the workspace to Free, pauses what Free does not include, and a new plan brings it all back", async ({
    page,
    browser,
    request,
    database,
    workspace,
  }, testInfo) => {
    test.setTimeout(360_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const role = await saveRole(page, {
      name: `Colleague ${randomUUID().slice(0, 6)}`,
      description: "Reads the Inbox and routines",
      permissions: [
        { resource: "inboxMessages", actions: ["readAll"] },
        { resource: "routines", actions: ["readAll"] },
      ],
      recordGrants: [],
    });
    const colleague = await secondUser(browser, database, workspace.companyId, testInfo, role.role.id);
    try {
      const owner = { companyId: workspace.companyId, userId: workspace.userId };
      await database.query(
        'UPDATE "Subscription" SET status=\'trial\',"trialEndDate"=NOW()-interval \'2 days\' WHERE "companyId"=$1',
        [workspace.companyId],
      );
      const paid = startProviderSubscription(
        workspace.companyId,
        "pro",
        2,
        undefined,
        new Date(Date.now() - 5 * DAY_MS),
      );
      await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", paid));
      expect(await subscriptionRow(database, workspace.companyId)).toEqual({
        status: "active",
        plan: "pro",
        variant: PRO,
        quantity: 2,
        bound: true,
        trialEnded: true,
      });
      await connectAccount(database, owner, "google", "lapsing@synthetic.test", 15);
      await addRoutine(database, owner, "Weekly review");
      await addWebhook(database, workspace.companyId, "https://hooks.example.test/lapsing");

      await moveTo(
        request,
        paid,
        { status: "expired", renews_at: null, ends_at: new Date(Date.now() - 60_000).toISOString() },
        "subscription_expired",
      );
      expect(await subscriptionRow(database, workspace.companyId)).toEqual({
        status: "expired",
        plan: "pro",
        variant: PRO,
        quantity: 2,
        bound: true,
        trialEnded: true,
      });
      expect(await memberRows(database, workspace.companyId)).toEqual([
        { name: "Browser Administrator", status: "active", paused: false },
        { name: "Second Person", status: "inactive", paused: true },
      ]);
      expect(await routineRows(database, workspace.companyId)).toEqual([
        { name: "Weekly review", enabled: false, paused: true, reason: expect.any(String) },
      ]);
      expect(await webhookRows(database, workspace.companyId)).toEqual([
        { url: "https://hooks.example.test/lapsing", enabled: true },
      ]);
      expect(await readSurfaces(page, slug)).toEqual({ ...FREE, pausedBanner: true });
      await colleague.page.goto(appPath(slug, "/dashboard"));
      await expect(colleague.page).toHaveURL(/\/auth\/paused$/);
      await expect(colleague.page.getByTestId("plan-paused-card")).toContainText("This workspace is on Free");

      const starter = startProviderSubscription(workspace.companyId, "starter", 1);
      await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", starter));
      expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
        status: "active",
        plan: "starter",
        variant: STARTER,
        bound: true,
      });
      expect(await memberRows(database, workspace.companyId)).toEqual([
        { name: "Browser Administrator", status: "active", paused: false },
        { name: "Second Person", status: "active", paused: false },
      ]);
      expect(await routineRows(database, workspace.companyId)).toEqual([
        { name: "Weekly review", enabled: true, paused: false, reason: null },
      ]);
      await expect.poll(() => providerSubscription(starter.id).quantity).toBe(2);
      expect(await readSurfaces(page, slug)).toEqual(
        surfaces({ billing: "Starter Active", inbox: "locked-plan", inboxTag: "Pro" }),
      );
      await colleague.page.goto(appPath(slug, "/dashboard"));
      await expect(colleague.page).toHaveURL(appUrlPattern(slug, "/dashboard$"));
      expect(await mateUsage(colleague.page, slug)).toBe("Starter plan · 1x Mate usage");
      expect(errors).toEqual([]);
    } finally {
      await colleague.close();
    }
  });

  test("a trial that checks out on Starter loses its accounts, one that checks out on Pro keeps them, and the trial card leads to the plan that keeps it running", async ({
    page,
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(360_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const owner = { companyId: workspace.companyId, userId: workspace.userId };
    const adminEmail = await loginEmail(database, workspace);
    await startTrial(database, workspace.companyId, 3);
    const accounts = [
      await connectAccount(database, owner, "google", "trial-1@synthetic.test", 30),
      await connectAccount(database, owner, "outlook", "trial-2@synthetic.test", 20),
    ];
    await addRoutine(database, owner, "Trial routine");
    await addWebhook(database, workspace.companyId, "https://hooks.example.test/trial");

    expect(await readSurfaces(page, slug)).toEqual(surfaces({ billing: "Pro Trial", card: "trial" }));
    await page.goto(appPath(slug, "/dashboard"));
    const card = page.locator("[data-trial-card]");
    await expect(card).toContainText("3 days left in your Pro trial");
    for (const loss of ["accounts", "routines", "webhooks"])
      await expect(card.locator(`[data-trial-end-loss="${loss}"]`)).toBeVisible();
    await expect(card).toContainText("Business · €69 per user / month");
    await card.getByRole("link", { name: "Keep it running with Business" }).click();
    await expect(page).toHaveURL(appUrlPattern(slug, "/settings/billing\\?plan=business$"));
    const picker = page.locator("#settings-billing-plan-picker");
    await expect(picker.locator('[data-plan="business"]')).toHaveAttribute("data-focused", "true");
    await expect(picker.locator('[data-plan="business"]')).toHaveAttribute("data-recommended", "true");
    await expect(picker.locator('[data-plan="pro"]')).not.toHaveAttribute("data-focused", "true");

    const starter = startProviderSubscription(workspace.companyId, "starter", 1);
    await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", starter));
    expect(await subscriptionRow(database, workspace.companyId)).toMatchObject({
      status: "active",
      plan: "starter",
      variant: STARTER,
      quantity: 1,
      bound: true,
    });
    expect(await accountRows(database, workspace.companyId)).toEqual([
      { address: "trial-1@synthetic.test", status: "deleted" },
      { address: "trial-2@synthetic.test", status: "deleted" },
    ]);
    expect(await routineRows(database, workspace.companyId)).toEqual([
      { name: "Trial routine", enabled: true, paused: false, reason: null },
    ]);
    expect(providerRemovals(accounts)).toEqual([1, 1]);
    expect(removalNotices(adminEmail)).toHaveLength(1);
    expect(await readSurfaces(page, slug)).toEqual(
      surfaces({ billing: "Starter Active", inbox: "locked-plan", inboxTag: "Pro" }),
    );

    const second = await addBrowserWorkspace(database, workspace, "Pro checkout");
    await startTrial(database, second.companyId, 3);
    const kept = [await connectAccount(database, second, "google", "kept-1@synthetic.test", 30)];
    await setActiveWorkspace(database, workspace, second.companyId);
    await page.goto(appPath(second.slug, "/dashboard"));
    await expect(page.locator("[data-trial-card]")).toContainText("Keep it running with Pro");
    const pro = startProviderSubscription(second.companyId, "pro", 1);
    await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", pro));
    expect(await subscriptionRow(database, second.companyId)).toMatchObject({
      status: "active",
      plan: "pro",
      variant: PRO,
      bound: true,
    });
    expect((await accountRows(database, second.companyId)).map((account) => account.status)).toEqual(["ok"]);
    expect(providerRemovals(kept)).toEqual([0]);
    expect(await inboxState(page, second.slug)).toBe("open");
    expect(errors).toEqual([]);
  });

  test("the upgrade prompts follow the role: admins get the plan buttons, members read Billing and are told to ask an admin, and a role that cannot open Billing never sees it", async ({
    page,
    browser,
    request,
    database,
    workspace,
  }, testInfo) => {
    test.setTimeout(420_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const role = await saveRole(page, {
      name: `Reader ${randomUUID().slice(0, 6)}`,
      description: "Reads the Inbox and routines and may use the API",
      permissions: [
        { resource: "inboxMessages", actions: ["readAll"] },
        { resource: "routines", actions: ["readAll"] },
        { resource: "api", actions: ["readAll"] },
      ],
      recordGrants: [],
    });
    const member = await secondUser(browser, database, workspace.companyId, testInfo, role.role.id);
    const outsiderRole = await legacyRole(database, workspace.companyId, "No company rows");
    const outsider = await secondUser(browser, database, workspace.companyId, testInfo, outsiderRole);
    try {
      const paid = await subscribe(request, workspace, "starter", 3);

      const adminLock = await lockCard(page, slug, "/inbox");
      await expect(adminLock).toContainText(englishMessages.MessagingUpsell.title);
      const upgrade = adminLock.getByRole("link", { name: "Upgrade to Pro" });
      await expect(upgrade).toHaveAttribute("data-upsell-plan-target", "pro");
      await expect(upgrade).toHaveAttribute("href", /\/settings\/billing\?plan=pro$/);
      await expect(adminLock.locator("[data-upsell-ask-admin]")).toHaveCount(0);
      expect(await billingControls(page, slug)).toEqual({ plan: "Starter Active", manage: 1, refresh: 1, picker: 0 });

      for (const reader of [member, outsider]) {
        const lock = await lockCard(reader.page, slug, "/inbox");
        await expect(lock).toContainText(englishMessages.MessagingUpsell.title);
        await expect(lock.locator("[data-upsell-ask-admin]")).toHaveText(ASK_ADMIN("Pro"));
        await expect(lock.getByRole("link", { name: "Upgrade to Pro" })).toHaveCount(0);
      }
      expect(await billingControls(member.page, slug)).toEqual({
        plan: "Starter Active",
        manage: 0,
        refresh: 0,
        picker: 0,
      });
      await outsider.page.goto(appPath(slug, "/settings/billing"));
      await expect(outsider.page).toHaveURL(appUrlPattern(slug, "/dashboard$"));

      await moveTo(request, paid, { plan: "pro", status: "past_due" });
      await member.page.goto(appPath(slug, "/dashboard"));
      await page.goto(appPath(slug, "/dashboard"));
      await outsider.page.goto(appPath(slug, "/dashboard"));
      await expect(page.locator("[data-payment-failed-banner]")).toBeVisible();
      await expect(
        page.locator("[data-payment-failed-banner]").getByRole("link", { name: "Review payment" }),
      ).toBeVisible();
      await expect(member.page.locator("[data-payment-failed-banner]")).toBeVisible();
      await expect(outsider.page.locator("[data-payment-failed-banner]")).toHaveCount(0);
      for (const person of [page, member.page, outsider.page])
        expect(await inboxState(person, slug)).toBe("locked-subscription");
      const memberLock = await lockCard(member.page, slug, "/inbox");
      await expect(memberLock.locator("[data-upsell-ask-admin]")).toHaveText(ASK_ADMIN("Pro"));
      await moveTo(request, paid, { status: "active" });

      await startTrial(database, workspace.companyId, 3);
      await page.goto(appPath(slug, "/dashboard"));
      await member.page.goto(appPath(slug, "/dashboard"));
      await outsider.page.goto(appPath(slug, "/dashboard"));
      await expect(page.locator("[data-trial-card]")).toBeVisible();
      await expect(member.page.locator("[data-trial-card]")).toBeVisible();
      await expect(outsider.page.locator("[data-trial-card]")).toHaveCount(0);

      expect(errors).toEqual([]);
      expect(member.errors).toEqual([]);
      expect(outsider.errors).toEqual([]);
    } finally {
      await outsider.close();
      await member.close();
    }
  });

  test("on Free the admin's upgrade buttons open Billing on Starter, the usage meters show the Free limits, and a paused member is refused everywhere", async ({
    page,
    browser,
    request,
    database,
    workspace,
  }, testInfo) => {
    test.setTimeout(420_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const role = await saveRole(page, {
      name: `Free reader ${randomUUID().slice(0, 6)}`,
      description: "Reads the Inbox and may use the API",
      permissions: [
        { resource: "inboxMessages", actions: ["readAll"] },
        { resource: "api", actions: ["readAll"] },
      ],
      recordGrants: [],
    });
    const noApiRole = await saveRole(page, {
      name: `No API ${randomUUID().slice(0, 6)}`,
      description: "Reads the Inbox",
      permissions: [{ resource: "inboxMessages", actions: ["readAll"] }],
      recordGrants: [],
    });
    const paused = await secondUser(browser, database, workspace.companyId, testInfo, role.role.id);
    const noApi = await secondUser(browser, database, workspace.companyId, testInfo, noApiRole.role.id);
    try {
      const keys = {
        admin: await mintApiKey(database, workspace, "Admin"),
        paused: await mintApiKey(database, { authUserId: paused.authUserId, companyId: workspace.companyId }, "Paused"),
        noApi: await mintApiKey(database, { authUserId: noApi.authUserId, companyId: workspace.companyId }, "No API"),
      };
      await endTrial(database, workspace.companyId);
      await database.query('DELETE FROM "ApiRateLimitWindow" WHERE "companyId"=$1', [workspace.companyId]);

      expect((await whoAmI(request, keys.admin.key)).status()).toBe(200);
      expect((await whoAmI(request, keys.paused.key)).status()).toBe(200);
      const denied = await whoAmI(request, keys.noApi.key);
      expect(denied.status()).toBe(403);
      expect(JSON.stringify(await denied.json())).toContain(
        "Using API keys or MCP connections requires Read access All on API & Webhooks",
      );
      const deniedMcp = await mcp(request, keys.noApi.key, toolCall());
      expect(deniedMcp.status).toBe(403);
      expect(deniedMcp.body).toMatchObject({
        error: "insufficient_permissions",
        requiredPermission: { resource: "api", action: "readAll" },
      });
      expect(await rateWindows(database, workspace.companyId)).toEqual([
        { window: "day", count: 2 },
        { window: "minute", count: 2 },
      ]);

      expect(await syncFreePlan(request, workspace.companyId)).toMatchObject({ paused: 2 });
      expect(await memberRows(database, workspace.companyId)).toEqual([
        { name: "Browser Administrator", status: "active", paused: false },
        { name: "Second Person", status: "inactive", paused: true },
        { name: "Second Person", status: "inactive", paused: true },
      ]);
      for (const key of [keys.paused.key, keys.noApi.key]) {
        const refused = await whoAmI(request, key);
        expect(refused.status()).toBe(403);
        const inactive = await mcp(request, key, toolCall());
        expect(inactive.status).toBe(403);
        expect(inactive.body).toMatchObject({
          error: expect.stringMatching(/^(inactive_user|insufficient_permissions)$/),
        });
      }
      const pausedMcp = await mcp(request, keys.paused.key, toolCall());
      expect(pausedMcp.body).toMatchObject({ error: "inactive_user" });
      expect(await rateWindows(database, workspace.companyId)).toEqual([
        { window: "day", count: 2 },
        { window: "minute", count: 2 },
      ]);
      await paused.page.goto(appPath(slug, "/dashboard"));
      await expect(paused.page).toHaveURL(/\/auth\/paused$/);
      await expect(paused.page.getByTestId("plan-paused-card")).toContainText(
        "Ask Browser Administrator to choose Starter",
      );
      expect((await whoAmI(request, keys.admin.key)).status()).toBe(200);

      expect(await readSurfaces(page, slug)).toEqual({ ...FREE, pausedBanner: true });
      await page.goto(appPath(slug, "/dashboard"));
      const card = page.locator("[data-free-plan-card]");
      await expect(card).toContainText("This workspace is on Free");
      await expect(card.locator("[data-free-plan-usage]")).toContainText("1 of 1");
      await page.goto(appPath(slug, "/routines"));
      await page.locator("[data-locked-feature]").getByRole("link", { name: "Upgrade to Starter" }).click();
      await expect(page).toHaveURL(appUrlPattern(slug, "/settings/billing\\?plan=starter$"));
      const picker = page.locator("#settings-billing-plan-picker");
      await expect(picker.locator("[data-plan='free']")).toContainText("Free · current plan");
      await expect(picker.locator("[data-plan='starter']")).toHaveAttribute("data-focused", "true");
      await expect(picker.locator("[data-plan='pro']")).not.toHaveAttribute("data-focused", "true");
      await expect(picker.locator("[data-checkout-seats-note]")).toContainText("3");
      const usage = page.locator("#settings-billing-plan-usage");
      await expect(usage.locator("[data-plan-usage='members']")).toContainText("1 of 1");
      await expect(usage.locator("[data-plan-usage='records']")).toContainText("of 250");
      await expect(usage.locator("[data-plan-usage='storage']")).toContainText("100 MB");
      await expect(usage.locator("[data-plan-usage='api']")).toContainText("3 of 200");
      await expect(usage).toContainText("Up to 30 per minute");
      expect(errors).toEqual([]);
    } finally {
      await noApi.close();
      await paused.close();
    }
  });

  test("an account shared on Business is private on Pro, and its owner can share it again after upgrading to Business", async ({
    page,
    browser,
    request,
    database,
    workspace,
  }, testInfo) => {
    test.setTimeout(300_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    const role = await saveRole(page, {
      name: `Teammate ${randomUUID().slice(0, 6)}`,
      description: "Reads the Inbox",
      permissions: [{ resource: "inboxMessages", actions: ["readAll"] }],
      recordGrants: [],
    });
    const teammate = await secondUser(browser, database, workspace.companyId, testInfo, role.role.id);
    try {
      const owner = { companyId: workspace.companyId, userId: workspace.userId };
      const paid = await subscribe(request, workspace, "business", 2);
      const shared = await connectAccount(database, owner, "google", "shared@synthetic.test", 30);
      await shareAccount(database, shared.id);
      await teammate.page.goto(appPath(slug, "/settings/channels"));
      await expect(channelCard(teammate.page, "shared@synthetic.test")).toContainText(/Visibility\s*Shared/);

      await moveTo(request, paid, { plan: "pro", quantity: 2 });
      expect(await sharedAccounts(database, workspace.companyId)).toEqual([
        { address: "shared@synthetic.test", shared: false },
      ]);
      await page.goto(appPath(slug, "/settings/channels"));
      await channelCard(page, "shared@synthetic.test").click();
      const dialog = page.getByRole("dialog");
      const visibility = dialog.locator("#connected-account-visibility");
      await expect(visibility).not.toBeChecked();
      await expect(visibility).toBeDisabled();
      await expect(dialog).toContainText("Private");
      await expect(dialog.locator('[data-upsell-notice="shared-accounts"]')).toContainText("Upgrade to Business");
      await teammate.page.goto(appPath(slug, "/settings/channels"));
      await expect(channelCard(teammate.page, "shared@synthetic.test")).toHaveCount(0);

      await moveTo(request, paid, { plan: "business", quantity: 2 });
      expect(await sharedAccounts(database, workspace.companyId)).toEqual([
        { address: "shared@synthetic.test", shared: false },
      ]);
      await page.goto(appPath(slug, "/settings/channels"));
      await channelCard(page, "shared@synthetic.test").click();
      await expect(page.getByRole("dialog").locator("#connected-account-visibility")).toBeEnabled();
      await expect(page.getByRole("dialog").locator("#connected-account-visibility")).not.toBeChecked();
      await page.getByRole("dialog").locator("#connected-account-visibility").click();
      await expect(page.getByText(englishMessages.ConnectedAccountsCard.sharedOnToast)).toBeVisible();
      expect(await sharedAccounts(database, workspace.companyId)).toEqual([
        { address: "shared@synthetic.test", shared: true },
      ]);
      expect(errors).toEqual([]);
      expect(teammate.errors).toEqual([]);
    } finally {
      await teammate.close();
    }
  });

  test("a downgrade to a plan without shared accounts leaves no account shared with the workspace", async ({
    request,
    database,
    workspace,
  }) => {
    const owner = { companyId: workspace.companyId, userId: workspace.userId };
    const paid = await subscribe(request, workspace, "business", 1);
    const shared = await connectAccount(database, owner, "google", "still-shared@synthetic.test", 30);
    await shareAccount(database, shared.id);

    await moveTo(request, paid, { plan: "pro" });

    expect(await sharedAccounts(database, workspace.companyId)).toEqual([
      { address: "still-shared@synthetic.test", shared: false },
    ]);

    await moveTo(request, paid, { plan: "business" });

    expect(await sharedAccounts(database, workspace.companyId)).toEqual([
      { address: "still-shared@synthetic.test", shared: false },
    ]);
  });

  test("the Free plan answers the 31st MCP tool call of a minute and the 201st of a day with a result an agent can act on, and counts nothing else", async ({
    page,
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(240_000);
    const errors = collectPageErrors(page);
    await endTrial(database, workspace.companyId);
    const { key } = await mintApiKey(database, workspace, "Free plan agent");
    await database.query('DELETE FROM "ApiRateLimitWindow" WHERE "companyId"=$1', [workspace.companyId]);
    await waitForSafeMinute();

    const init = await mcp(request, key, INITIALIZE);
    expect(init.status).toBe(200);
    expect((init.body?.result as { serverInfo?: unknown }).serverInfo).toBeTruthy();
    const initialized = await request.post("/api/v1/mcp", {
      headers: { "x-api-key": key, accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(initialized.status()).toBe(202);
    const tools = await mcp(request, key, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(tools.status).toBe(200);
    expect(((tools.body?.result as { tools: unknown[] }).tools ?? []).length).toBeGreaterThan(10);
    await mcp(request, key, INITIALIZE);
    expect(await rateWindows(database, workspace.companyId)).toEqual([]);

    const first = await mcp(request, key, toolCall());
    expect(first.status).toBe(200);
    expect((first.body?.result as { isError?: boolean }).isError).not.toBe(true);
    expect(await rateWindows(database, workspace.companyId)).toEqual([
      { window: "day", count: 1 },
      { window: "minute", count: 1 },
    ]);
    expect((await mcp(request, key, { jsonrpc: "2.0", id: 3, method: "tools/list" })).status).toBe(200);
    expect(await rateWindows(database, workspace.companyId)).toEqual([
      { window: "day", count: 1 },
      { window: "minute", count: 1 },
    ]);

    await setRateWindow(database, workspace.companyId, "minute", 29);
    const thirtieth = await mcp(request, key, toolCall());
    expect(thirtieth.status).toBe(200);
    expect((thirtieth.body?.result as { isError?: boolean }).isError).not.toBe(true);

    const call = toolCall();
    const refused = await mcp(request, key, call);
    expect(refused.status).toBe(200);
    expect(refused.headers["content-type"]).toContain("application/json");
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    const result = refused.body as {
      jsonrpc: string;
      id: number;
      result: {
        isError: boolean;
        content: Array<{ type: string; text: string }>;
        structuredContent: Record<string, unknown>;
      };
    };
    expect(result.jsonrpc).toBe("2.0");
    expect(result.id).toBe(call.id);
    expect(result.result.isError).toBe(true);
    const upgrade = result.result.structuredContent.upgrade as { plan: string; price: string; url: string };
    expect(upgrade).toEqual({
      plan: "starter",
      price: "€12",
      url: expect.stringContaining("/dashboard?open=%2Fsettings%2Fbilling%3Fplan%3Dstarter"),
    });
    expect(result.result.structuredContent).toEqual({
      error: "rate_limited",
      plan: "free",
      window: "minute",
      limit: 30,
      retryAfterSeconds: expect.any(Number),
      upgrade,
    });
    const retryAfter = result.result.structuredContent.retryAfterSeconds as number;
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
    expect(retryAfter).toBe(Number(refused.headers["retry-after"]));
    const text = result.result.content[0].text;
    expect(text).toContain("This Customermates workspace is on the Free plan");
    expect(text).toContain("30 API and MCP requests per minute");
    expect(text).toContain(`Retry in ${retryAfter} seconds.`);
    expect(text).toContain("Starter (€12 per user per month)");
    expect(text).toContain("Tell the user");
    expect(text).toContain(`A workspace admin can upgrade here: ${upgrade.url}`);

    expect(await rateWindows(database, workspace.companyId)).toEqual([
      { window: "day", count: 3 },
      { window: "minute", count: 31 },
    ]);
    expect((await mcp(request, key, INITIALIZE)).status).toBe(200);
    expect(
      ((await mcp(request, key, { jsonrpc: "2.0", id: 4, method: "tools/list" })).body?.result as { tools: unknown[] })
        .tools.length,
    ).toBeGreaterThan(10);
    expect(
      (
        await request.post("/api/v1/mcp", {
          headers: { "x-api-key": key, accept: "application/json, text/event-stream" },
          data: { jsonrpc: "2.0", method: "notifications/initialized" },
        })
      ).status(),
    ).toBe(202);
    expect(await rateWindows(database, workspace.companyId)).toEqual([
      { window: "day", count: 3 },
      { window: "minute", count: 31 },
    ]);

    const batch = await request.post("/api/v1/mcp", {
      headers: { "x-api-key": key, accept: "application/json, text/event-stream" },
      data: [toolCall(), toolCall()],
    });
    expect(batch.status()).toBe(429);
    expect(Number(batch.headers()["retry-after"])).toBeGreaterThan(0);
    expect(await batch.json()).toEqual({
      error: "rate_limited",
      message: expect.stringContaining("This Customermates workspace is on the Free plan"),
      plan: "free",
      upgrade,
    });

    const rest = await whoAmI(request, key);
    expect(rest.status()).toBe(429);
    expect(Number(rest.headers()["retry-after"])).toBeGreaterThan(0);
    const restBody = (await rest.json()) as {
      error: { kind: string; issues: Array<{ customCode: string; message: string }> };
    };
    expect(restBody.error.kind).toBe("rate_limit");
    expect(restBody.error.issues[0]?.customCode).toBe("apiRateLimitReached");
    const restMessage = restBody.error.issues[0]?.message ?? "";
    expect(restMessage).toContain("This Customermates workspace is on the Free plan");
    expect(restMessage).toContain("30 API and MCP requests per minute");
    expect(restMessage).toContain("Starter (€12 per user per month)");
    expect(restMessage).toContain(`A workspace admin can upgrade here: ${upgrade.url}`);

    await setRateWindow(database, workspace.companyId, "minute", 0);
    await setRateWindow(database, workspace.companyId, "day", 200);
    const dayRefused = await mcp(request, key, toolCall());
    expect(dayRefused.status).toBe(200);
    const day = (
      dayRefused.body as {
        result: { isError: boolean; content: Array<{ text: string }>; structuredContent: Record<string, unknown> };
      }
    ).result;
    expect(day.isError).toBe(true);
    expect(day.structuredContent).toMatchObject({
      error: "rate_limited",
      plan: "free",
      window: "day",
      limit: 200,
      upgrade,
    });
    expect(day.structuredContent.retryAfterSeconds as number).toBeGreaterThan(0);
    expect(day.structuredContent.retryAfterSeconds as number).toBeLessThanOrEqual(86_400);
    expect(day.content[0].text).toContain("200 API and MCP requests per day");
    expect(day.content[0].text).toMatch(/The daily limit resets in about \d+ hours?\./);
    expect((await mcp(request, key, { jsonrpc: "2.0", id: 5, method: "tools/list" })).status).toBe(200);

    await page.goto(appPath(workspace.slug, "/settings/billing"));
    await expect(page.locator("[data-plan-usage='api']")).toContainText("200 of 200");
    await expect(page.locator("#settings-billing-plan-usage")).toContainText("Up to 30 per minute");

    await page.goto(upgrade.url);
    await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/settings/billing\\?plan=starter$"));
    await expect(page.locator("#settings-billing-plan-picker").locator('[data-plan="starter"]')).toHaveAttribute(
      "data-focused",
      "true",
    );
    expect(errors).toEqual([]);
  });

  test("a paid plan has no request limit, and the limit comes back when the workspace is on Free again", async ({
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(240_000);
    await endTrial(database, workspace.companyId);
    const { key } = await mintApiKey(database, workspace, "Plan change agent");
    await database.query('DELETE FROM "ApiRateLimitWindow" WHERE "companyId"=$1', [workspace.companyId]);
    await setRateWindow(database, workspace.companyId, "day", 200);
    const limited = await mcp(request, key, toolCall());
    expect((limited.body as { result: { isError: boolean } }).result.isError).toBe(true);
    expect((await whoAmI(request, key)).status()).toBe(429);

    const paid = await subscribe(request, workspace, "starter");
    const windows = await rateWindows(database, workspace.companyId);
    for (let attempt = 0; attempt < 35; attempt += 1) expect((await whoAmI(request, key)).status()).toBe(200);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const answered = await mcp(request, key, toolCall());
      expect(answered.status).toBe(200);
      expect((answered.body as { result: { isError?: boolean } }).result.isError).not.toBe(true);
    }
    expect(await rateWindows(database, workspace.companyId)).toEqual(windows);

    for (const plan of ["pro", "business"] as const) {
      await moveTo(request, paid, { plan });
      expect((await whoAmI(request, key)).status()).toBe(200);
      const answered = await mcp(request, key, toolCall());
      expect((answered.body as { result: { isError?: boolean } }).result.isError).not.toBe(true);
    }
    expect(await rateWindows(database, workspace.companyId)).toEqual(windows);
  });
});

test.describe("self-hosted installs", () => {
  test.skip(
    e2eAppMode() !== "self-hosted",
    "Self-hosted installs have no plans; the cloud tests above cover the plans",
  );

  test("have no plans, plan prompts, Inbox or Mate, and no request limit on the API and MCP", async ({
    page,
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(240_000);
    const errors = collectPageErrors(page);
    const slug = workspace.slug;
    for (const path of ["/settings/billing", "/inbox", "/routines", "/settings/channels"]) {
      await page.goto(appPath(slug, path));
      await expect(page).toHaveURL(appUrlPattern(slug, "/dashboard$"));
    }
    await page.goto(appPath(slug, "/dashboard?agentChat=open"));
    await page.waitForLoadState("networkidle");
    await openSidebar(page);
    for (const selector of [
      "#nav-inbox",
      "#nav-routines",
      "#nav-assistant",
      "[data-nav-plan-tag]",
      "[data-trial-card]",
      "[data-free-plan-card]",
      "[data-payment-failed-banner]",
      "[data-plan-paused-banner]",
      "[data-testid='agent-panel']",
      "[data-testid='agent-upgrade-panel']",
    ])
      await expect(page.locator(selector)).toHaveCount(0);
    await page.goto(appPath(slug, "/settings/webhooks"));
    await page.waitForLoadState("networkidle");
    await expect(page.locator("[data-locked-feature]")).toHaveCount(0);

    const { key } = await mintApiKey(database, workspace, "Self-hosted agent");
    await database.query('DELETE FROM "ApiRateLimitWindow" WHERE "companyId"=$1', [workspace.companyId]);
    for (let attempt = 0; attempt < 35; attempt += 1) expect((await whoAmI(request, key)).status()).toBe(200);
    for (let attempt = 0; attempt < 33; attempt += 1) {
      const answered = await mcp(request, key, toolCall());
      expect(answered.status).toBe(200);
      expect((answered.body as { result: { isError?: boolean } }).result.isError).not.toBe(true);
    }
    expect(await rateWindows(database, workspace.companyId)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
