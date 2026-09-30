import { randomUUID } from "node:crypto";
import { test as base, expect } from "./fixtures";
import { removeBrowserWorkspace } from "./workspace";
import { presentationFixture } from "../../prisma/record-migrations/v5/__tests__/fixture";
import { migrateRecordWorkspace } from "../../prisma/record-migrations/run";
import { presetId } from "../../features/records/crm-preset";

const test = base.extend({
  workspace: async ({ database }, use) => {
    const legacy = await presentationFixture(database);
    const authUserId = randomUUID();
    const workspace = { companyId: legacy.companyId, userId: legacy.userId, authUserId };
    try {
      for (const dealId of [legacy.recordId, legacy.otherDeal])
        await legacy.insert("DealUser", { dealId, userId: legacy.userId });
      for (const [index, widgetId] of Object.values(legacy.widgets).entries()) {
        await database.query('UPDATE "Widget" SET layout = $2::jsonb WHERE id = $1', [
          widgetId,
          JSON.stringify({ lg: { i: widgetId, x: (index % 2) * 6, y: Math.floor(index / 2) * 7, w: 6, h: 7 } }),
        ]);
      }
      await database.query(
        'UPDATE "User" SET "agreeToTerms" = true, "onboardingWizardCompletedAt" = NOW(), "displayLanguage" = \'en\', "formattingLocale" = \'en\', "agentCreditActivatedAt" = NOW() WHERE id = $1',
        [legacy.userId],
      );
      await database.query(
        'INSERT INTO "AuthUser" (id, "companyId", email, name, "emailVerified", "updatedAt") SELECT $1, "companyId", email, \'Migration administrator\', true, NOW() FROM "User" WHERE id = $2',
        [authUserId, legacy.userId],
      );
      await database.query(
        'INSERT INTO "Subscription" (id, "companyId", status, "updatedAt") VALUES ($1, $2, \'active\', NOW())',
        [randomUUID(), legacy.companyId],
      );
      const report = await migrateRecordWorkspace(database, legacy.companyId, "backfill");
      if (!report.ok) throw new Error("Browser legacy migration failed");
      await use(workspace);
    } finally {
      await removeBrowserWorkspace(database, workspace);
    }
  },
});

test("opens migrated saved views, personal details and financial widgets with persisted values", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  const typeId = presetId(companyId, "deal");
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator('[data-group-key="value:open"] [data-item-id]')).toHaveCount(2);
  const views = page.locator("#global-data-views");
  await expect(views.getByRole("link", { name: "My board", exact: true })).toHaveAttribute("aria-current", "page");
  await views.getByRole("link", { name: "Explicit empty", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: "Name", exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Synthetic deal", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Synthetic deal", exact: true }).first().click();
  const drawer = page.getByRole("dialog", { name: "Deal", exact: true });
  await expect(drawer.locator(`[data-summary-field="${presetId(companyId, "deal.name")}"]`)).toContainText(
    "Synthetic deal",
  );
  await expect(drawer.locator('[data-sortable-field="system:createdAt"]')).not.toBeVisible();
  await expect(drawer.getByText("€2,600.00", { exact: true })).toBeVisible();
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Migrated deal edited");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT COUNT(*)::integer AS count FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 AND "textValue"=$3',
            [companyId, presetId(companyId, "deal.name"), "Migrated deal edited"],
          )
        ).rows[0].count,
    )
    .toBe(1);
  await views.getByRole("link", { name: "My board", exact: true }).click();
  await expect(page.locator('[data-group-key="value:open"] [data-item-id]')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('[data-group-key="value:open"] [data-item-id]')).toHaveCount(2);
  await expect(page.locator("#records-search")).toBeAttached();
  await expect(page.locator("header")).toContainText("Deals");
  await expect(page.getByText("Line items", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("migrated-deal-board.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/en/dashboard");
  const widget = (name: string) =>
    page.locator('[data-uid="app-card"]').filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(widget("Deal values").getByText("Overall: €5,200.00", { exact: true })).toBeVisible();
  await expect(widget("Weighted values").getByText("Overall: €3,120.00", { exact: true })).toBeVisible();
  await expect(widget("Organization values").getByText("Overall: €5,200.00", { exact: true })).toBeVisible();
  await expect(widget("Organization values").locator("dd").getByText("€5,200.00", { exact: true })).toHaveCount(2);
  await expect(widget("Service quantities").getByText("Overall: 10", { exact: true })).toBeVisible();
  await expect(widget("Service quantities").locator("dd").getByText("4", { exact: true })).toHaveCount(1);
  await expect(widget("Service quantities").locator("dd").getByText("6", { exact: true })).toHaveCount(1);
  await expect(widget("Only service A").getByText("Overall: €4,000.00", { exact: true })).toBeVisible();
  const saved = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey" LIKE \'records:%\'',
    [companyId],
  );
  expect(saved.rows[0].count).toBe(15);
  await widget("Organization values").screenshot({ path: testInfo.outputPath("migrated-organization-values.png") });
  expect(errors).toEqual([]);
});
