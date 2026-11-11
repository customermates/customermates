import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";
import type { Client as Database } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { appPath } from "./app-paths";
import { expect } from "./fixtures";
import {
  changeProviderSubscription,
  deliverWebhookBody,
  startProviderSubscription,
  subscriptionWebhookBody,
} from "./lemonsqueezy";
import { openSidebar } from "./sidebar";

export type PaidPlan = "starter" | "pro" | "business";

export const PLAN_NAME: Record<PaidPlan, string> = { starter: "Starter", pro: "Pro", business: "Business" };

export type Owner = { companyId: string; userId: string };

type ProviderChange = Parameters<typeof changeProviderSubscription>[1];

export async function subscribe(request: APIRequestContext, owner: Owner, plan: PaidPlan, seats = 1) {
  const paid = startProviderSubscription(owner.companyId, plan, seats);
  await deliverWebhookBody(request, subscriptionWebhookBody("subscription_created", paid));
  return paid;
}

export async function moveTo(
  request: APIRequestContext,
  paid: { id: string },
  change: ProviderChange,
  event: Parameters<typeof subscriptionWebhookBody>[0] = "subscription_updated",
) {
  const body = subscriptionWebhookBody(event, changeProviderSubscription(paid.id, change));
  await deliverWebhookBody(request, body);
  return body;
}

export async function connectAccount(
  database: Database,
  owner: Owner,
  provider: "google" | "outlook" | "linkedin",
  address: string,
  connectedMinutesAgo: number,
) {
  const id = randomUUID();
  const unipileAccountId = `e2e_local_${id}`;
  await database.query(
    'INSERT INTO "ConnectedAccount"(id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","emailAddress","displayName","createdAt","updatedAt") VALUES($1,$2,$3,$4,$5,\'ok\',true,$6,$6,NOW()-($7::int * interval \'1 minute\'),NOW())',
    [id, owner.companyId, owner.userId, unipileAccountId, provider, address, connectedMinutesAgo],
  );
  return { id, unipileAccountId, address };
}

export async function activateAgentCredit(database: Database, userId: string) {
  await database.query('UPDATE "User" SET "agentCreditActivatedAt"=NOW()-interval \'40 days\' WHERE id=$1', [userId]);
}

export async function shareAccount(database: Database, accountId: string) {
  await database.query('UPDATE "ConnectedAccount" SET shared=true WHERE id=$1', [accountId]);
}

export async function sharedAccounts(database: Database, companyId: string) {
  const { rows } = await database.query<{ address: string; shared: boolean }>(
    'SELECT "emailAddress" AS address,shared FROM "ConnectedAccount" WHERE "companyId"=$1 ORDER BY "createdAt"',
    [companyId],
  );
  return rows;
}

export async function addRoutine(database: Database, owner: Owner, name: string) {
  await database.query(
    'INSERT INTO "Routine" (id,"companyId","ownerUserId",name,prompt,enabled,"triggerKind","cronExpression",timezone,"triggerEvents","nextRunAt","updatedAt") VALUES ($1,$2,$3,$4,$5,true,\'schedule\',\'0 8 * * 1-5\',\'Europe/Berlin\',\'{}\',NOW()+interval \'1 day\',NOW())',
    [
      randomUUID(),
      owner.companyId,
      owner.userId,
      name,
      "Summarize yesterday's conversations without sending anything.",
    ],
  );
}

export async function addWebhook(database: Database, companyId: string, url: string) {
  await database.query(
    'INSERT INTO "Webhook" (id,url,events,enabled,"companyId","updatedAt") VALUES ($1,$2,\'{record.created}\',true,$3,NOW())',
    [randomUUID(), url, companyId],
  );
}

export type SubscriptionRow = {
  status: string;
  plan: string;
  variant: string | null;
  quantity: number | null;
  bound: boolean;
  trialEnded: boolean | null;
};

export async function subscriptionRow(database: Database, companyId: string): Promise<SubscriptionRow> {
  const { rows } = await database.query<SubscriptionRow>(
    'SELECT status::text,plan::text,"lemonSqueezyVariantId" AS variant,quantity,"lemonSqueezyId" IS NOT NULL AS bound,("trialEndDate" < NOW()) AS "trialEnded" FROM "Subscription" WHERE "companyId"=$1',
    [companyId],
  );
  if (rows.length !== 1) throw new Error("The workspace subscription is missing");
  return rows[0];
}

export async function accountRows(database: Database, companyId: string) {
  const { rows } = await database.query<{ address: string; status: string }>(
    'SELECT "emailAddress" AS address,status::text FROM "ConnectedAccount" WHERE "companyId"=$1 ORDER BY "createdAt"',
    [companyId],
  );
  return rows;
}

export async function routineRows(database: Database, companyId: string) {
  const { rows } = await database.query<{ name: string; enabled: boolean; paused: boolean; reason: string | null }>(
    'SELECT name,enabled,"pausedByPlanAt" IS NOT NULL AS paused,"disabledReason" AS reason FROM "Routine" WHERE "companyId"=$1 ORDER BY name',
    [companyId],
  );
  return rows;
}

export async function webhookRows(database: Database, companyId: string) {
  const { rows } = await database.query<{ url: string; enabled: boolean }>(
    'SELECT url,enabled FROM "Webhook" WHERE "companyId"=$1 ORDER BY url',
    [companyId],
  );
  return rows;
}

export async function memberRows(database: Database, companyId: string) {
  const { rows } = await database.query<{ name: string; status: string; paused: boolean }>(
    'SELECT "firstName" || \' \' || "lastName" AS name,status::text,"pausedByPlanAt" IS NOT NULL AS paused FROM "User" WHERE "companyId"=$1 ORDER BY "createdAt","firstName"',
    [companyId],
  );
  return rows;
}

export async function rateWindows(database: Database, companyId: string) {
  const { rows } = await database.query<{ window: string; count: number }>(
    'SELECT "window",count FROM "ApiRateLimitWindow" WHERE "companyId"=$1 ORDER BY "window"',
    [companyId],
  );
  return rows;
}

export async function setRateWindow(database: Database, companyId: string, window: "minute" | "day", count: number) {
  const size = window === "minute" ? 60_000 : 86_400_000;
  const start = new Date(Math.floor(Date.now() / size) * size);
  await database.query(
    'INSERT INTO "ApiRateLimitWindow" ("companyId","window","windowStart",count) VALUES ($1,$2,$3,$4) ON CONFLICT ("companyId","window","windowStart") DO UPDATE SET count=EXCLUDED.count',
    [companyId, window, start, count],
  );
}

export async function endTrial(database: Database, companyId: string, daysAgo = 1) {
  await database.query(
    'UPDATE "Subscription" SET status=\'trial\',"trialEndDate"=NOW()-($2::int * interval \'1 day\'),"lemonSqueezyId"=NULL,"lemonSqueezyVariantId"=NULL,quantity=NULL WHERE "companyId"=$1',
    [companyId, daysAgo],
  );
}

export async function startTrial(database: Database, companyId: string, daysLeft = 3) {
  await database.query(
    'UPDATE "Subscription" SET status=\'trial\',plan=\'pro\',"trialEndDate"=date_trunc(\'second\',NOW()+($2::int * interval \'1 day\')),"lemonSqueezyId"=NULL,"lemonSqueezyVariantId"=NULL,quantity=NULL WHERE "companyId"=$1',
    [companyId, daysLeft],
  );
}

export type InboxState = "open" | "locked-plan" | "locked-subscription";
export type MateState = "chat" | "upgrade" | "unavailable";

export type Surfaces = {
  billing: string;
  card: "trial" | "free" | null;
  paymentBanner: boolean;
  pausedBanner: boolean;
  inbox: InboxState;
  inboxTag: string | null;
  routines: "list" | "locked";
  webhooks: "list" | "locked";
  mate: MateState;
};

async function settled(page: Page, path: string, slug: string) {
  await page.goto(appPath(slug, path));
  await page.waitForLoadState("networkidle");
}

export async function inboxState(page: Page, slug: string): Promise<InboxState> {
  await settled(page, "/inbox", slug);
  const lock = page.locator("[data-locked-feature]");
  if ((await lock.count()) === 0) return "open";
  const text = (await lock.first().innerText()).replace(/\s+/g, " ");
  if (text.includes(englishMessages.ConnectedAccountsCard.paidSubscriptionRequired)) return "locked-subscription";
  expect(text).toContain(englishMessages.MessagingUpsell.title);
  return "locked-plan";
}

export async function planTag(page: Page): Promise<string | null> {
  await openSidebar(page);
  const tag = page.locator("#nav-inbox [data-nav-plan-tag]");
  return (await tag.count()) === 0 ? null : ((await tag.first().getAttribute("data-nav-plan-tag")) ?? null);
}

export async function lockedFeatureOrList(page: Page, slug: string, path: string): Promise<"list" | "locked"> {
  await settled(page, path, slug);
  return (await page.locator("[data-locked-feature]").count()) === 0 ? "list" : "locked";
}

export async function mateState(page: Page, slug: string): Promise<MateState> {
  await page.goto(appPath(slug, "/dashboard?agentChat=open"));
  await page.waitForLoadState("networkidle");
  await openSidebar(page);
  if ((await page.locator("#nav-assistant").count()) === 0) {
    await expect(page.getByTestId("agent-panel")).toHaveCount(0);
    await expect(page.getByTestId("agent-upgrade-panel")).toHaveCount(0);
    return "unavailable";
  }
  const chat = page.getByTestId("agent-panel");
  const upgrade = page.getByTestId("agent-upgrade-panel");
  await expect(chat.or(upgrade)).toBeVisible();
  return (await upgrade.count()) > 0 ? "upgrade" : "chat";
}

export async function mateUsage(page: Page, slug: string): Promise<string> {
  await page.goto(appPath(slug, "/dashboard?agentChat=open"));
  await page.waitForLoadState("networkidle");
  const ring = page.getByTestId("agent-usage");
  await expect(ring).toBeVisible();
  await ring.hover();
  const plan = page.getByText(/ plan · \d+x Mate usage$/);
  await expect(plan).toBeVisible();
  return (await plan.innerText()).trim();
}

async function billingText(page: Page, slug: string) {
  await settled(page, "/settings/billing", slug);
  const plan = page.getByRole("textbox", { name: englishMessages.Subscription.plan, exact: true });
  await expect(plan).toBeVisible();
  return (await plan.innerText()).replace(/\s+/g, " ").trim();
}

export async function readSurfaces(page: Page, slug: string): Promise<Surfaces> {
  await settled(page, "/dashboard", slug);
  await openSidebar(page);
  const card = (await page.locator("[data-trial-card]").count())
    ? "trial"
    : (await page.locator("[data-free-plan-card]").count())
      ? "free"
      : null;
  const paymentBanner = (await page.locator("[data-payment-failed-banner]").count()) > 0;
  const pausedBanner = (await page.locator("[data-plan-paused-banner]").count()) > 0;
  const inbox = await inboxState(page, slug);
  const inboxTag = await planTag(page);
  const routines = await lockedFeatureOrList(page, slug, "/routines");
  const webhooks = await lockedFeatureOrList(page, slug, "/settings/webhooks");
  const mate = await mateState(page, slug);
  const billing = await billingText(page, slug);
  return { billing, card, paymentBanner, pausedBanner, inbox, inboxTag, routines, webhooks, mate };
}
