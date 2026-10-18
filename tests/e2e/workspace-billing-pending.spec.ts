import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import type { Client as Database } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { UNSIGNED_CHECKOUT_CLAIMS_END } from "../../ee/subscription/unsigned-checkout-claims";
import { collectPageErrors, expect, test } from "./fixtures";
import {
  changeProviderSubscription,
  checkoutsFor,
  deliverWebhookBody,
  paymentWebhookBody,
  postSignedWebhook,
  signedCustomData,
  startProviderSubscription,
  stubCheckoutPage,
  subscriptionWebhookBody,
} from "./lemonsqueezy";
import { localResendEnvironment } from "./local-resend-provider.mjs";
import { secondUser } from "./second-user";
import { emailLanguage, emailText, sentEmailsTo } from "./transactional-mail";
import { addBrowserWorkspace, type BrowserWorkspace } from "./workspace";
import { choosePlan } from "./workspace-setup";
import { clickHydrated, e2eAppMode, setActiveWorkspace } from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "Plans, checkout and the trial exist in the cloud only");

const DAY_MS = 24 * 60 * 60 * 1000;
const OPERATOR = localResendEnvironment().RESEND_OPERATOR_EMAIL;
const copy = englishMessages.CheckoutPending;

type Billing = { status: string; plan: string; lemonSqueezyId: string | null; checkoutStartedAt: Date | null };

async function billing(database: Database, companyId: string): Promise<Billing> {
  const { rows } = await database.query<Billing>(
    'SELECT status::text,plan::text,"lemonSqueezyId","checkoutStartedAt" FROM "Subscription" WHERE "companyId"=$1',
    [companyId],
  );
  if (rows.length !== 1) throw new Error("The workspace subscription is missing");
  return rows[0];
}

async function startedMinutesAgo(database: Database, companyId: string, minutes: number) {
  await database.query(
    'UPDATE "Subscription" SET "checkoutStartedAt"=NOW()-make_interval(mins=>$2) WHERE "companyId"=$1',
    [companyId, minutes],
  );
}

async function expiredWorkspace(database: Database, workspace: BrowserWorkspace, name: string) {
  const second = await addBrowserWorkspace(database, workspace, name);
  await database.query(
    'UPDATE "Subscription" SET status=\'expired\',"trialEndDate"=NULL,"currentPeriodEnd"=NULL WHERE "companyId"=$1',
    [second.companyId],
  );
  await setActiveWorkspace(database, workspace, second.companyId);
  return second;
}

async function inTrial(database: Database, companyId: string) {
  await database.query(
    "UPDATE \"Subscription\" SET status='trial',\"trialEndDate\"=date_trunc('second',NOW()+interval '3 days') WHERE \"companyId\"=$1",
    [companyId],
  );
}

function pendingNotice(page: Page) {
  return page.locator("#settings-billing-payment-pending");
}

function planPicker(page: Page) {
  return page.locator("#settings-billing-plan-picker");
}

async function expectPlan(page: Page, plan: string, status: string) {
  const field = page.getByRole("textbox", { name: englishMessages.Subscription.plan, exact: true });
  await expect(field).toContainText(plan);
  await expect(field).toContainText(status);
}

function operatorMailsAbout(subscriptionId: string) {
  return sentEmailsTo(OPERATOR).filter((email) => emailText(email).includes(subscriptionId));
}

test("an admin back from checkout sees the payment being processed, and the page moves on once the webhook activates the workspace", async ({
  page,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectPageErrors(page);
  const second = await expiredWorkspace(database, workspace, "Bergmann Steuern");
  const checkoutPages = await stubCheckoutPage(page);
  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(planPicker(page)).toBeVisible();
  await expect(pendingNotice(page)).toHaveCount(0);

  const before = Date.now();
  await choosePlan(page, "Business");
  await expect.poll(() => checkoutsFor(second.companyId).length).toBe(1);
  const [checkout] = checkoutsFor(second.companyId);
  await expect(page).toHaveURL(checkout.url);
  expect(checkout.custom).toEqual(signedCustomData(second.companyId));
  expect(checkout.custom?.company_signature).toMatch(/^[0-9a-f]{64}$/);
  const startedAt = (await billing(database, second.companyId)).checkoutStartedAt;
  expect(startedAt?.getTime()).toBeGreaterThanOrEqual(before - 5_000);
  expect(checkout.expiresAt).toBe(new Date((startedAt?.getTime() ?? 0) + 24 * 60 * 60 * 1000).toISOString());

  await page.goto(checkout.redirectUrl as string);
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(pendingNotice(page)).toBeVisible();
  await expect(pendingNotice(page)).toContainText(copy.title);
  await expect(pendingNotice(page).getByRole("button", { name: copy.abandon, exact: true })).toBeVisible();
  await expect(planPicker(page)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath(`payment-pending-${testInfo.project.name}.png`), fullPage: true });

  const paid = startProviderSubscription(second.companyId, "business", 1);
  await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", paid, checkout.custom));

  await expect(page).toHaveURL(/\/en\/settings\/billing$/);
  await expectPlan(page, "Business", "Active");
  expect(await billing(database, second.companyId)).toMatchObject({
    status: "active",
    plan: "business",
    lemonSqueezyId: paid.id,
    checkoutStartedAt: null,
  });
  expect(checkoutPages).toEqual([checkout.url]);
  expect(errors).toEqual([]);
});

test("the escape link clears a pending payment at once and brings the plans back on both plan pages", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const second = await expiredWorkspace(database, workspace, "Bergmann Steuern");
  await startedMinutesAgo(database, second.companyId, 1);

  await page.goto("/en/dashboard");
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(pendingNotice(page)).toBeVisible();
  await clickHydrated(pendingNotice(page).getByRole("button", { name: copy.abandon, exact: true }));
  await expect(planPicker(page)).toBeVisible();
  await expect(pendingNotice(page)).toHaveCount(0);
  expect((await billing(database, second.companyId)).checkoutStartedAt).toBeNull();
  await page.reload();
  await expect(planPicker(page)).toBeVisible();

  await setActiveWorkspace(database, workspace, workspace.companyId);
  await inTrial(database, workspace.companyId);
  await startedMinutesAgo(database, workspace.companyId, 1);
  await page.goto("/en/settings/billing");
  await expect(page).toHaveURL(/\/en\/settings\/billing$/);
  await expect(pendingNotice(page)).toBeVisible();
  await clickHydrated(pendingNotice(page).getByRole("button", { name: copy.abandon, exact: true }));
  await expect(planPicker(page)).toBeVisible();
  await expect(page.locator("#settings-billing-payment-overdue")).toHaveCount(0);
  expect((await billing(database, workspace.companyId)).checkoutStartedAt).toBeNull();
  expect(errors).toEqual([]);
});

test("every admin sees the payment being processed, and the server refuses a second checkout from a page that still shows the plans", async ({
  page,
  browser,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectPageErrors(page);
  await inTrial(database, workspace.companyId);
  const colleague = await secondUser(browser, database, workspace.companyId, testInfo);
  try {
    const stale = await colleague.page.context().newPage();
    await stubCheckoutPage(page);
    await stubCheckoutPage(colleague.page);
    await stubCheckoutPage(stale);
    await page.goto("/en/settings/billing");
    await colleague.page.goto("/en/settings/billing");
    await stale.goto("/en/settings/billing");
    await expect(planPicker(page)).toBeVisible();
    await expect(planPicker(colleague.page)).toBeVisible();
    await expect(planPicker(stale)).toBeVisible();

    await choosePlan(page, "Business");
    await expect.poll(() => checkoutsFor(workspace.companyId).length).toBe(1);
    const [checkout] = checkoutsFor(workspace.companyId);
    await expect(page).toHaveURL(checkout.url);

    await choosePlan(colleague.page, "Pro");
    await expect(pendingNotice(colleague.page)).toBeVisible();
    await expect(planPicker(colleague.page)).toHaveCount(0);
    await expect(colleague.page).toHaveURL(/\/en\/settings\/billing$/);
    expect(checkoutsFor(workspace.companyId)).toHaveLength(1);
    await colleague.page.reload();
    await expect(pendingNotice(colleague.page)).toBeVisible();
    await colleague.page.screenshot({
      path: testInfo.outputPath(`payment-pending-colleague-${testInfo.project.name}.png`),
      fullPage: true,
    });

    await page.goto(checkout.redirectUrl as string);
    await expect(page).toHaveURL(/\/en\/settings\/billing$/);
    await expect(pendingNotice(page)).toBeVisible();

    const paid = startProviderSubscription(workspace.companyId, "business", 2);
    await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", paid, checkout.custom));
    for (const admin of [page, colleague.page]) {
      await expect(pendingNotice(admin)).toHaveCount(0);
      await expectPlan(admin, "Business", "Active");
    }
    expect(await billing(database, workspace.companyId)).toMatchObject({
      lemonSqueezyId: paid.id,
      checkoutStartedAt: null,
    });

    await expect(planPicker(stale)).toBeVisible();
    await choosePlan(stale, "Starter");
    await expectPlan(stale, "Business", "Active");
    await expect(planPicker(stale)).toHaveCount(0);
    await expect(stale).toHaveURL(/\/en\/settings\/billing$/);
    expect(checkoutsFor(workspace.companyId)).toHaveLength(1);
    expect(colleague.errors).toEqual([]);
  } finally {
    await colleague.close();
  }
  expect(errors).toEqual([]);
});

test("after fifteen minutes the plans come back with a way to support, and a new checkout is allowed", async ({
  page,
  database,
  workspace,
}) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  await inTrial(database, workspace.companyId);
  await startedMinutesAgo(database, workspace.companyId, 1);
  await stubCheckoutPage(page);
  await page.goto("/en/settings/billing");
  await expect(pendingNotice(page)).toBeVisible();

  await startedMinutesAgo(database, workspace.companyId, 16);

  await expect(planPicker(page)).toBeVisible();
  await expect(pendingNotice(page)).toHaveCount(0);
  const hint = page.locator("#settings-billing-payment-overdue");
  await expect(hint).toContainText(copy.overdue);
  await expect(hint.getByRole("link", { name: copy.contactSupport, exact: true })).toHaveAttribute(
    "href",
    `mailto:mail@customermates.com?subject=${encodeURIComponent(copy.supportEmailSubject)}`,
  );
  expect(checkoutsFor(workspace.companyId)).toEqual([]);

  const before = Date.now();
  await choosePlan(page, "Pro");
  await expect.poll(() => checkoutsFor(workspace.companyId).length).toBe(1);
  expect((await billing(database, workspace.companyId)).checkoutStartedAt?.getTime()).toBeGreaterThanOrEqual(
    before - 5_000,
  );
  expect(errors).toEqual([]);
});

test.describe("workspace claims of the webhook", () => {
  test.skip(process.env.CRM_E2E_SERVER_MODE === "development", "next dev logs e-mails instead of sending them");

  test("unsigned and forged workspace claims bind nothing and reach the operator", async ({
    page,
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(180_000);
    const errors = collectPageErrors(page);
    const second = await expiredWorkspace(database, workspace, "Bergmann Steuern");
    const before = await billing(database, second.companyId);

    const late = startProviderSubscription(
      second.companyId,
      "business",
      1,
      undefined,
      new Date(Math.max(Date.now(), UNSIGNED_CHECKOUT_CLAIMS_END.getTime()) + DAY_MS),
    );
    const unsigned = await postSignedWebhook(
      request,
      subscriptionWebhookBody("subscription_created", late, { company_id: second.companyId }),
    );
    expect(unsigned.status()).toBe(200);
    expect(await unsigned.json()).toEqual({ refused: true });

    const forged = startProviderSubscription(second.companyId, "pro", 1);
    const forgedResponse = await postSignedWebhook(
      request,
      subscriptionWebhookBody("subscription_created", forged, {
        company_id: second.companyId,
        company_signature: signedCustomData(workspace.companyId).company_signature,
      }),
    );
    expect(forgedResponse.status()).toBe(200);
    expect(await forgedResponse.json()).toEqual({ refused: true });

    expect(await billing(database, second.companyId)).toEqual(before);
    const [unsignedMail, ...moreUnsigned] = operatorMailsAbout(late.id);
    expect(moreUnsigned).toEqual([]);
    expect(unsignedMail.subject).toBe("Unsigned workspace in a Lemon Squeezy subscription");
    expect(emailLanguage(unsignedMail)).toBe("en");
    expect(emailText(unsignedMail)).toContain(`Bergmann Steuern (${second.companyId})`);
    const [forgedMail, ...moreForged] = operatorMailsAbout(forged.id);
    expect(moreForged).toEqual([]);
    expect(forgedMail.subject).toBe("Forged workspace in a Lemon Squeezy subscription");
    expect(emailText(forgedMail)).toContain(second.companyId);

    await page.goto("/en/dashboard");
    await expect(page).toHaveURL(/\/en\/subscription-expired$/);
    await expect(planPicker(page)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("events for a workspace that no longer exists are acknowledged, and only payments reach the operator", async ({
    request,
    database,
  }) => {
    const deleted = randomUUID();
    const stray = startProviderSubscription(deleted, "pro", 1);

    for (const event of ["subscription_updated", "subscription_cancelled", "subscription_expired"] as const) {
      const response = await postSignedWebhook(request, subscriptionWebhookBody(event, stray));
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ ignored: true });
    }
    expect(operatorMailsAbout(stray.id)).toEqual([]);

    for (const body of [subscriptionWebhookBody("subscription_created", stray), paymentWebhookBody(stray)]) {
      const response = await postSignedWebhook(request, body);
      expect(response.status()).toBe(200);
      expect(await response.json()).toEqual({ ignored: true });
    }
    const mails = operatorMailsAbout(stray.id);
    expect(mails.map((mail) => mail.subject)).toEqual([
      "Lemon Squeezy payment for a missing workspace",
      "Lemon Squeezy payment for a missing workspace",
    ]);
    expect(mails.every((mail) => emailLanguage(mail) === "en")).toBe(true);
    const texts = mails.map(emailText);
    expect(texts.filter((text) => text.includes("Event subscription_created"))).toHaveLength(1);
    expect(texts.filter((text) => text.includes("Event subscription_payment_success"))).toHaveLength(1);
    expect(texts.every((text) => text.includes(`Workspace ${deleted}`))).toBe(true);
    const bound = await database.query('SELECT "companyId" FROM "Subscription" WHERE "lemonSqueezyId"=$1', [stray.id]);
    expect(bound.rows).toEqual([]);
  });

  test("a second paid subscription for a workspace binds the newest and asks the operator to refund the older one", async ({
    page,
    request,
    database,
    workspace,
  }) => {
    test.setTimeout(180_000);
    const errors = collectPageErrors(page);
    const second = await expiredWorkspace(database, workspace, "Bergmann Steuern");
    const first = startProviderSubscription(second.companyId, "pro", 1, undefined, new Date(Date.now() - 2 * DAY_MS));
    await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", first));
    expect(await billing(database, second.companyId)).toMatchObject({ status: "active", lemonSqueezyId: first.id });

    const newest = startProviderSubscription(second.companyId, "business", 1);
    await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", newest));

    expect(await billing(database, second.companyId)).toMatchObject({
      status: "active",
      plan: "business",
      lemonSqueezyId: newest.id,
    });
    const [replaced, ...moreReplaced] = operatorMailsAbout(newest.id);
    expect(moreReplaced).toEqual([]);
    expect(replaced.subject).toBe("Workspace moved to its newest subscription");
    expect(emailText(replaced)).toContain(`New subscription, now bound ${newest.id}`);
    expect(emailText(replaced)).toContain(`Previous subscription to cancel or refund ${first.id}`);
    expect(emailText(replaced)).toContain(`Bergmann Steuern (${second.companyId})`);

    const stale = await postSignedWebhook(request, subscriptionWebhookBody("subscription_updated", first));
    expect(stale.status()).toBe(200);
    expect(await stale.json()).toEqual({ refused: true });
    expect(await billing(database, second.companyId)).toMatchObject({ plan: "business", lemonSqueezyId: newest.id });
    expect(operatorMailsAbout(first.id).map((email) => email.subject)).toEqual([
      "Workspace moved to its newest subscription",
      "Second subscription for a workspace",
    ]);

    const cancelled = await postSignedWebhook(
      request,
      subscriptionWebhookBody("subscription_cancelled", changeProviderSubscription(first.id, { status: "cancelled" })),
    );
    expect(cancelled.status()).toBe(200);
    expect(await cancelled.json()).toEqual({ ignored: true });
    expect(await billing(database, second.companyId)).toMatchObject({ plan: "business", lemonSqueezyId: newest.id });
    expect(operatorMailsAbout(first.id)).toHaveLength(2);

    await page.goto("/en/settings/billing");
    await expect(page).toHaveURL(/\/en\/settings\/billing$/);
    await expectPlan(page, "Business", "Active");
    expect(errors).toEqual([]);
  });
});
