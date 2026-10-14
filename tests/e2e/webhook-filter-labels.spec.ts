import { randomUUID } from "node:crypto";

import { choosePaletteValue } from "./filter-palette";
import { expect, test, collectPageErrors } from "./fixtures";

test("saved webhook delivery filters resolve subscriptions beyond the first option page on desktop and phone", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const ids = Array.from({ length: 105 }, () => randomUUID());
  const urls = ids.map((_, index) => `https://example.test/filter-label-${index}`);
  await database.query(
    `INSERT INTO "Webhook" (id,"companyId",url,events,enabled,"createdAt","updatedAt")
     SELECT id,$1,url,ARRAY[]::text[],false,NOW() - (106 - ord) * interval '1 minute',NOW()
     FROM unnest($2::uuid[],$3::text[]) WITH ORDINALITY AS hooks(id,url,ord)`,
    [companyId, ids, urls],
  );
  for (const index of [0, 104]) {
    await database.query(
      `INSERT INTO "WebhookDelivery" (id,"companyId",url,event,"requestBody","webhookId",status,success,"nextAttemptAt")
       VALUES ($1,$2,$3,'test.event','{}'::jsonb,$4,'success',true,NULL)`,
      [randomUUID(), companyId, urls[index], ids[index]],
    );
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/en/settings/webhook-deliveries");
  await choosePaletteValue(page, "settings-webhook-deliveries-filter", "webhookId", urls[0]);
  await expect(page.locator("#global-data-views-all")).toHaveAttribute("data-view-modified", "");
  await page.locator("#settings-webhook-deliveries-filter").click();
  await page.locator("#settings-webhook-deliveries-filter-save").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#global-data-views-all")).not.toHaveAttribute("data-view-modified");

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.reload();
    await page.locator("#settings-webhook-deliveries-filter").click();
    const active = page.locator("[data-palette-active-filters]");
    await expect(active).toContainText(urls[0]);
    await expect(active).not.toContainText("Filter not available");
    await page.keyboard.press("Escape");
    await expect(page.getByText(urls[0], { exact: true }).first()).toBeVisible();
    await expect(page.getByText(urls[104], { exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
