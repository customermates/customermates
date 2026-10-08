import type { Locator, Page } from "@playwright/test";

import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { test, expect, isBenignPageError } from "./fixtures";
import { openRecordDetails } from "./record-rows";

function chip(scope: Locator, label: string) {
  return scope.locator('[data-slot="badge"]').filter({ hasText: new RegExp(`^${label}$`) });
}

async function openEntry(page: Page, scope: Locator, label: RegExp) {
  const open = page.getByRole("dialog");
  const before = await open.count();
  await scope.getByRole("button", { name: label }).first().click();
  await expect(open).toHaveCount(before + 1);
  return { detail: open.nth(before), before };
}

async function closeEntry(page: Page, entry: { before: number }) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(entry.before);
}

test("renders change values with the shared value renderers on every activity surface", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  const memberId = randomUUID();
  const roleId = randomUUID();
  await database.query('INSERT INTO "UserRole" (id,"companyId",name,"updatedAt") VALUES ($1,$2,\'Field team\',NOW())', [
    roleId,
    companyId,
  ]);
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,country,"updatedAt") VALUES ($1,$2,$3,$4,\'Invited\',\'Member\',\'pendingAuthorization\',\'de\',NOW())',
    [memberId, companyId, roleId, `${memberId}@example.test`],
  );

  await page.goto("/en/settings/members");
  await page.locator('[data-slot="data-row-open"]').filter({ hasText: "Invited Member" }).click();
  const member = page.getByRole("dialog", { name: "User", exact: true });
  await member.locator("#member-modal-status").click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await member.getByRole("button", { name: "Save", exact: true }).click();
  await expect(member).not.toBeVisible();

  const receiverUrl = `http://127.0.0.1:49999/${randomUUID()}`;
  await page.goto("/en/settings/webhooks");
  await page.locator("#settings-webhooks-add").click();
  const webhook = page.getByRole("dialog");
  await webhook.locator("#webhook-modal-url").fill(receiverUrl);
  await webhook.locator("#webhook-modal-events").click();
  await page.getByRole("option", { name: "Record created", exact: true }).click();
  await page.keyboard.press("Escape");
  await webhook.getByRole("button", { name: "Save", exact: true }).click();
  await expect(webhook).not.toBeVisible();
  await page.getByRole("button", { name: receiverUrl, exact: true }).click();
  await webhook.locator("#webhook-modal-enabled").uncheck();
  await webhook.getByRole("button", { name: "Save", exact: true }).click();
  await expect(webhook).not.toBeVisible();

  await page.goto("/en/settings/roles");
  await page.locator("#settings-roles-add").click();
  const role = page.getByRole("dialog", { name: "Role", exact: true });
  await role.getByRole("textbox", { name: "Name", exact: false }).fill("Value readers");
  await role.getByRole("textbox", { name: "Description", exact: false }).fill("Reads tasks");
  await role
    .locator("[data-record-permission]")
    .filter({ hasText: /^Tasks/ })
    .getByRole("radio", { name: "All", exact: true })
    .check();
  await role.getByRole("button", { name: "Save", exact: true }).click();
  await expect(role).not.toBeVisible();

  const dealTypeId = presetId(companyId, "deal");
  await page.goto(`/en/records/${dealTypeId}`);
  await page.locator("#records-add").click();
  const record = page.getByRole("dialog");
  await record.getByRole("textbox", { name: "Name", exact: false }).fill("Value renderer deal");
  await record.getByRole("combobox", { name: "Stage", exact: false }).click();
  await page.getByRole("option", { name: "Won", exact: true }).click();
  await record.getByRole("button", { name: "Save", exact: true }).click();
  await expect(record).not.toBeVisible();
  const stage = await database.query(
    'SELECT definition FROM "RecordFieldDefinition" WHERE "companyId"=$1 AND id=$2',
    [companyId, presetId(companyId, "deal.stage")],
  );
  const won = (stage.rows[0].definition.options as Array<{ label: string; color?: string | null }>).find(
    (option) => option.label === "Won",
  );
  const wonColor = won?.color ?? "secondary";

  await page.goto("/en/settings/activity");
  const feed = page.locator('[data-slot="feed-container"]');

  const { detail: userEntry, ...userEntryOpened } = await openEntry(page, feed, /User Updated/);
  await expect(chip(userEntry, "Waiting for approval")).toHaveAttribute("data-variant", "warning");
  await expect(chip(userEntry, "Active")).toHaveAttribute("data-variant", "success");
  await expect(userEntry.locator("svg.lucide-arrow-right")).not.toHaveCount(0);
  await userEntry.screenshot({ path: testInfo.outputPath("user-updated.png"), animations: "disabled" });
  await closeEntry(page, userEntryOpened);

  const { detail: webhookEntry, ...webhookEntryOpened } = await openEntry(page, feed, /Webhook Updated/);
  await expect(webhookEntry.getByText("Yes", { exact: true })).toBeVisible();
  await expect(webhookEntry.getByText("No", { exact: true })).toBeVisible();
  await closeEntry(page, webhookEntryOpened);

  const { detail: createdWebhook, ...createdWebhookOpened } = await openEntry(page, feed, /Webhook Created/);
  await expect(chip(createdWebhook, "Record created")).toBeVisible();
  await expect(createdWebhook.getByText("—", { exact: true }).first()).toBeVisible();
  await closeEntry(page, createdWebhookOpened);

  const { detail: accessEntry, ...accessEntryOpened } = await openEntry(page, feed, /Record access changed .*Value readers/);
  await expect(chip(accessEntry, "Read access: All")).toBeVisible();
  await closeEntry(page, accessEntryOpened);

  const { detail: recordEntry, ...recordEntryOpened } = await openEntry(page, feed, /Record created .*Value renderer deal/);
  await expect(chip(recordEntry, "Won")).toHaveAttribute("data-variant", wonColor);
  await expect(recordEntry.getByRole("button", { name: "Browser Administrator", exact: true })).toBeVisible();
  await recordEntry.screenshot({ path: testInfo.outputPath("record-created.png"), animations: "disabled" });
  await closeEntry(page, recordEntryOpened);

  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  const editor = page.getByRole("dialog");
  await editor.locator("#widget-kind-activityTimeline").click();
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Value history");
  await editor.getByRole("combobox", { name: "Record types", exact: true }).click();
  await page.locator('[data-slot="popover-content"]').getByRole("combobox").fill("Deals");
  await page.getByRole("option", { name: "Deals", exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.locator("#widget-modal-save").click();
  await expect(editor).not.toBeVisible();
  const card = page
    .locator('[data-uid="app-card"]')
    .filter({ has: page.getByRole("heading", { name: "Value history", exact: true }) });
  const { detail: widgetEntry, ...widgetEntryOpened } = await openEntry(page, card, /Record created .*Value renderer deal/);
  await expect(chip(widgetEntry, "Won")).toHaveAttribute("data-variant", wonColor);
  await expect(widgetEntry.getByRole("button", { name: "Browser Administrator", exact: true })).toBeVisible();
  await closeEntry(page, widgetEntryOpened);

  await page.goto(`/en/records/${dealTypeId}`);
  await openRecordDetails(page, "Value renderer deal");
  const drawer = page.getByRole("dialog").first();
  await drawer.getByRole("tab", { name: "History", exact: true }).click();
  const { detail: historyEntry, ...historyEntryOpened } = await openEntry(page, drawer, /Record created/);
  await expect(chip(historyEntry, "Won")).toHaveAttribute("data-variant", wonColor);
  await expect(historyEntry.getByRole("button", { name: "Browser Administrator", exact: true })).toBeVisible();
  await closeEntry(page, historyEntryOpened);

  expect(errors).toEqual([]);
});
