import type { APIRequestContext } from "@playwright/test";
import type { Client } from "pg";

import { randomUUID } from "node:crypto";

import { appPath, pagePath } from "./app-paths";
import { mintApiKey } from "./api-key";
import { collectPageErrors, expect, test } from "./fixtures";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import { e2eAppMode, setActiveWorkspace, signInLogin } from "./workspace-switching";

import { presetId } from "@/features/records/crm-preset";

test.skip(e2eAppMode() !== "cloud", "The Free plan exists on Customermates Cloud only");

const DAY_MS = 86_400_000;

async function endTrial(database: Client, companyId: string) {
  await database.query(
    "UPDATE \"Subscription\" SET status='trial',\"trialEndDate\"=NOW()-interval '1 day',\"lemonSqueezyId\"=NULL WHERE \"companyId\"=$1",
    [companyId],
  );
}

async function syncFreePlan(request: APIRequestContext, companyId: string) {
  const response = await request.get(`/api/cron/free-plan?companyId=${companyId}`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { paused: number; resumed: number; notified: number };
}

async function memberships(database: Client, companyId: string) {
  const { rows } = await database.query<{ id: string; status: string; paused: boolean }>(
    'SELECT id, status::text AS status, "pausedByPlanAt" IS NOT NULL AS paused FROM "User" WHERE "companyId"=$1',
    [companyId],
  );
  return Object.fromEntries(rows.map((row) => [row.id, { status: row.status, paused: row.paused }]));
}

test("a workspace whose trial ended continues on Free with usage, upgrade prompts and a request limit", async ({
  page,
  request,
  database,
  workspace,
}) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  await endTrial(database, workspace.companyId);
  const contactTypeId = presetId(workspace.companyId, "contact");
  await database.query(
    'INSERT INTO "CrmRecord" ("companyId","typeId",id,"updatedAt") SELECT $1,$2,gen_random_uuid(),NOW() FROM generate_series(1,212)',
    [workspace.companyId, contactTypeId],
  );

  await page.goto(pagePath(page, "/dashboard"));
  await expect(page).toHaveURL(/\/dashboard$/);
  const card = page.locator("[data-free-plan-card]");
  await expect(card).toContainText("This workspace is on Free");
  await expect(card.getByRole("link", { name: "Upgrade to Starter" })).toBeVisible();

  await page.goto(pagePath(page, `/records/${contactTypeId}`));
  const notice = page.locator("[data-plan-limit='records']");
  await expect(notice).toHaveAttribute("data-usage-level", "approaching");
  await expect(notice).toContainText("213 of 250 records used");
  await expect(notice).toContainText("Starter · €12 per user / month");

  await page.goto(pagePath(page, "/settings/billing"));
  await expect(page.locator("#settings-billing-plan-usage")).toContainText("Free plan usage");
  await expect(page.locator("[data-plan-usage='members']")).toContainText("1 of 1");
  await expect(page.locator("[data-plan-usage='records']")).toContainText("213 of 250");
  await expect(page.locator("[data-plan-usage='storage']")).toContainText("100 MB");
  await expect(page.locator("[data-plan-usage='api']")).toContainText("API calls today");
  await expect(page.locator("[data-plan-usage='api']")).toContainText("0 of 200");
  await expect(page.locator("#settings-billing-plan-usage")).toContainText("Up to 10 per minute");
  await expect(page.locator("[data-plan-usage='customLists']")).toHaveCount(0);
  await expect(page.locator("#settings-billing-plan-picker [data-plan='free']")).toContainText("Free · current plan");

  await page.goto(pagePath(page, "/routines"));
  await expect(page.locator("[data-locked-feature]")).toContainText("Routines are paused on Free");
  await expect(page.locator("[data-locked-feature]").getByRole("link", { name: "Upgrade to Starter" })).toBeVisible();

  await page.goto(pagePath(page, "/inbox"));
  await expect(page.locator("[data-locked-feature]")).toContainText("Follow up from LinkedIn and email");

  const { key } = await mintApiKey(database, workspace, "Free plan request limit");
  const allowed = await request.get("/api/v1/users/me", { headers: { "x-api-key": key } });
  expect(allowed.status()).toBe(200);
  const day = new Date(Math.floor(Date.now() / DAY_MS) * DAY_MS);
  await database.query(
    'UPDATE "ApiRateLimitWindow" SET count=200 WHERE "companyId"=$1 AND "window"=\'day\' AND "windowStart"=$2',
    [workspace.companyId, day],
  );
  const refused = await request.get("/api/v1/users/me", { headers: { "x-api-key": key } });
  expect(refused.status()).toBe(429);
  expect(Number(refused.headers()["retry-after"])).toBeGreaterThan(0);
  const body = (await refused.json()) as { error: { kind: string; issues: Array<{ customCode: string; message: string }> } };
  expect(body.error.kind).toBe("rate_limit");
  expect(body.error.issues[0]?.customCode).toBe("apiRateLimitReached");
  expect(body.error.issues[0]?.message).toContain("upgrade to Starter (€12 per user per month)");
  expect(errors).toEqual([]);
});

test("a three-person trial workspace drops to Free: two are paused, one can be swapped in, and a paid plan restores all", async ({
  page,
  request,
  database,
  workspace,
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const errors = collectPageErrors(page);
  const colleague = await createBrowserWorkspace(database, "Morgan's workspace");
  try {
    const admin = await database.query<{ id: string }>(
      'SELECT id FROM "UserRole" WHERE "companyId"=$1 AND "isSystemRole"=true LIMIT 1',
      [workspace.companyId],
    );
    const memberRoleId = randomUUID();
    await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,\'Member\',NOW())', [
      memberRoleId,
      workspace.companyId,
    ]);
    const colleagueMemberId = randomUUID();
    const teammateId = randomUUID();
    await database.query(
      'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","createdAt","updatedAt") VALUES ($1,$2,$3,$4,\'Morgan\',\'Lee\',\'active\',true,NOW(),\'en\',\'en\',NOW()+interval \'1 minute\',NOW()), ($5,$2,$6,$7,\'Taylor\',\'Kim\',\'active\',true,NOW(),\'en\',\'en\',NOW()+interval \'2 minutes\',NOW())',
      [
        colleagueMemberId,
        workspace.companyId,
        admin.rows[0].id,
        `browser-${colleague.userId}@example.test`,
        teammateId,
        memberRoleId,
        `taylor-${teammateId}@example.test`,
      ],
    );
    await setActiveWorkspace(database, colleague, workspace.companyId);
    await endTrial(database, workspace.companyId);

    expect(await syncFreePlan(request, workspace.companyId)).toMatchObject({ paused: 2, notified: 2 });
    expect(await memberships(database, workspace.companyId)).toEqual({
      [workspace.userId]: { status: "active", paused: false },
      [colleagueMemberId]: { status: "inactive", paused: true },
      [teammateId]: { status: "inactive", paused: true },
    });

    await page.goto(pagePath(page, "/dashboard"));
    const banner = page.locator("[data-plan-paused-banner]");
    await expect(banner).toContainText("2 people are paused. Choose Starter to bring them back.");
    await expect(banner.getByRole("link", { name: "Upgrade to Starter" })).toBeVisible();

    await page.goto(pagePath(page, "/settings/members"));
    await expect(page.locator("[data-plan-paused]")).toHaveCount(2);
    await expect(page.locator("[data-plan-paused]").first()).toHaveText("Paused (Free plan)");

    const paused = await signInLogin(browser, database, colleague, testInfo);
    try {
      await paused.page.goto(appPath(workspace.slug, "/dashboard"));
      await expect(paused.page).toHaveURL(/\/auth\/paused$/);
      const card = paused.page.getByTestId("plan-paused-card");
      await expect(card).toContainText("This workspace is on Free");
      await expect(card).toContainText("Ask Browser Administrator to choose Starter to bring you back.");
      await expect(card.getByRole("button", { name: "Morgan's workspace" })).toBeVisible();
      expect(paused.errors).toEqual([]);
    } finally {
      await paused.close();
    }

    await page.getByRole("button", { name: "More actions for Morgan Lee" }).click();
    await page.getByRole("menuitem", { name: "Hand over the active seat" }).click();
    const dialog = page.locator("[data-slot='confirm-dialog']");
    await expect(dialog).toContainText("Give Morgan Lee the active seat?");
    await dialog.getByRole("button", { name: "Hand over seat" }).click();
    await expect(page).toHaveURL(/\/auth\/paused$/);
    await expect(page.getByTestId("plan-paused-card")).toContainText("Ask Morgan Lee to choose Starter to bring you back.");
    expect(await memberships(database, workspace.companyId)).toEqual({
      [workspace.userId]: { status: "inactive", paused: true },
      [colleagueMemberId]: { status: "active", paused: false },
      [teammateId]: { status: "inactive", paused: true },
    });

    await database.query(
      "UPDATE \"Subscription\" SET status='active',plan='starter' WHERE \"companyId\"=$1",
      [workspace.companyId],
    );
    expect(await syncFreePlan(request, workspace.companyId)).toMatchObject({ resumed: 2 });
    expect(await memberships(database, workspace.companyId)).toEqual({
      [workspace.userId]: { status: "active", paused: false },
      [colleagueMemberId]: { status: "active", paused: false },
      [teammateId]: { status: "active", paused: false },
    });
    await page.goto(pagePath(page, "/dashboard"));
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator("[data-plan-paused-banner]")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await removeBrowserWorkspace(database, colleague);
  }
});

test("webhooks and the n8n trigger are refused on Free with a Starter prompt", async ({
  page,
  request,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  await endTrial(database, workspace.companyId);

  const { key } = await mintApiKey(database, workspace, "Free plan webhook gate");
  const refused = await request.post("/api/v1/webhooks", {
    headers: { "x-api-key": key },
    data: { url: "https://hooks.example.test/customermates", events: ["record.created"] },
  });
  expect(refused.status()).toBe(409);
  const body = (await refused.json()) as { error: { issues: Array<{ customCode: string; message: string }> } };
  expect(body.error.issues[0]?.customCode).toBe("planWebhooksNotIncluded");
  expect(body.error.issues[0]?.message).toContain("Upgrade to Starter (€12 per user per month)");

  await page.goto(pagePath(page, "/settings/webhooks"));
  const gate = page.locator("[data-locked-feature]");
  await expect(gate).toContainText("Webhooks and n8n start on Starter");
  await expect(gate.getByRole("link", { name: "Upgrade to Starter" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a workspace whose payment failed stays locked instead of moving to Free", async ({ page, database, workspace }) => {
  const errors = collectPageErrors(page);
  await database.query("UPDATE \"Subscription\" SET status='unPaid' WHERE \"companyId\"=$1", [workspace.companyId]);

  await page.goto(pagePath(page, "/dashboard"));
  await expect(page).toHaveURL(/\/subscription-expired$/);
  expect(errors).toEqual([]);
});
