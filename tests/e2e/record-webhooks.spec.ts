import { setPaletteText, expectPaletteText } from "./filter-palette";
import { addFromConfigure, openConfigure } from "./configure";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";

test("keeps migrated multi-type webhook sources when editing delivery settings", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  const id = randomUUID();
  const url = "http://127.0.0.1:49999/migrated-events";
  const sources = ["service", "deal"].map((kind) => ({
    query: { typeId: presetId(companyId, kind), filters: [], relationships: [], relatedFilters: [] },
    changedFieldIds: [],
    events: ["record.updated"],
  }));
  await database.query(
    'INSERT INTO "Webhook" (id, "companyId", url, events, enabled, "updatedAt") VALUES ($1, $2, $3, $4, true, NOW())',
    [id, companyId, url, ["record.updated"]],
  );
  await database.query(
    'INSERT INTO "RecordEventSubscription" ("companyId", id, kind, "ownerUserId", "typeId", events, "changedFieldIds", query, sources, revision, enabled) VALUES ($1, $2, $3, $4, NULL, $5, $6, NULL, $7::jsonb, 1, true)',
    [companyId, id, "webhook", workspace.userId, ["record.updated"], [], JSON.stringify(sources)],
  );
  await page.goto("/en/settings/webhooks");
  await page.getByRole("button", { name: url, exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText(/Services · Record updated/)).toBeVisible();
  await expect(modal.getByText(/Deals · Record updated/)).toBeVisible();
  await modal.locator("#webhook-modal-description").fill("Retained migration sources");
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(modal).not.toBeVisible();
  const saved = await database.query(
    'SELECT w.description, s.sources FROM "Webhook" w JOIN "RecordEventSubscription" s ON s."companyId"=w."companyId" AND s.id=w.id WHERE w."companyId"=$1 AND w.id=$2',
    [companyId, id],
  );
  expect(saved.rows[0]).toMatchObject({ description: "Retained migration sources", sources });
  await page.close();
});

test("persists a webhook for a customer-created type with an explicit owner and filtered record changes", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const creation = page.getByRole("dialog");
  await creation.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
  await creation.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  const field = await database.query(
    `SELECT f.id, f.definition->>'label' AS label FROM "RecordFieldDefinition" f JOIN "RecordTypeDefinition" t ON t."companyId"=f."companyId" AND t.id=f."typeId" AND t.definition->>'primaryFieldId'=f.id WHERE f."companyId"=$1 AND f."typeId"=$2`,
    [companyId, typeId],
  );
  expect(field.rows).toHaveLength(1);
  const receiverUrl = "http://127.0.0.1:49999/project-events";
  await page.goto("/en/settings/webhooks");
  await page.locator("#settings-webhooks-add").click();
  const webhook = page.getByRole("dialog");
  await webhook.locator("#webhook-modal-url").fill(receiverUrl);
  await webhook.locator("#webhook-modal-description").fill("Project delivery");
  await webhook.locator("#webhook-modal-events").click();
  await page.getByRole("option", { name: "Record updated", exact: true }).click();
  await page.keyboard.press("Escape");
  await webhook.getByRole("combobox", { name: "Records from", exact: false }).click();
  await page.getByRole("option", { name: "Projects", exact: true }).click();
  await webhook.locator('[id="recordTrigger.changedFieldIds"]').click();
  await page.getByRole("option", { name: field.rows[0].label, exact: true }).click();
  await page.keyboard.press("Escape");
  await setPaletteText(page, "record-trigger-filters", "query:search", "Ready");
  await webhook.getByRole("button", { name: "Save", exact: true }).click();
  await expect(webhook).not.toBeVisible();
  const saved = await database.query(
    'SELECT w.id,s."typeId",s.query,s."changedFieldIds",s."ownerUserId" FROM "Webhook" w JOIN "RecordEventSubscription" s ON s."companyId"=w."companyId" AND s.id=w.id WHERE w."companyId"=$1 AND w.url=$2',
    [companyId, receiverUrl],
  );
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0]).toMatchObject({
    typeId,
    changedFieldIds: [field.rows[0].id],
    query: { typeId, search: "Ready" },
    ownerUserId: workspace.userId,
  });
  await page.reload();
  await page.getByRole("button", { name: receiverUrl, exact: true }).click();
  await expect(webhook.getByRole("combobox", { name: "Records from", exact: false })).toContainText("Projects");
  await expect(webhook.locator('[id="recordTrigger.changedFieldIds"]')).toContainText(field.rows[0].label);
  await expectPaletteText(page, "record-trigger-filters", "query:search", "Ready");
  await webhook
    .locator("[data-record-trigger]")
    .screenshot({ path: testInfo.outputPath("custom-type-webhook.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(webhook).not.toBeVisible();
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const record = page.getByRole("dialog");
  await record.getByRole("textbox", { name: field.rows[0].label, exact: false }).fill("Draft project");
  await record.getByRole("button", { name: "Save", exact: true }).click();
  await expect(record).not.toBeVisible();
  await openRecordDetails(page, "Draft project");
  await record.getByRole("textbox", { name: field.rows[0].label, exact: false }).fill("Ready project");
  await record.getByRole("button", { name: "Save", exact: true }).click();
  await expect(record).not.toBeVisible();
  const matches = await database.query(
    'SELECT e.kind,e."subjectTypeId" AS "typeId" FROM "RecordEventMatch" m JOIN "EventLog" e ON e."companyId"=m."companyId" AND e.id=m."eventId" WHERE m."companyId"=$1 AND m."subscriptionId"=$2',
    [companyId, saved.rows[0].id],
  );
  expect(matches.rows).toEqual([{ kind: "record.updated", typeId }]);
  expect(errors).toEqual([]);
});

test("labels migrated legacy webhook deliveries without missing translations", async ({ page, database, companyId }) => {
  const errors = collectPageErrors(page);
  const url = `http://127.0.0.1:49998/legacy-${randomUUID()}`;
  await database.query(
    `INSERT INTO "WebhookDelivery" (id, url, "companyId", event, "requestBody", "nextAttemptAt", "statusCode", success, status, "deliveredAt", "createdAt") VALUES ($1, $2, $3, 'contact.created', '{}'::jsonb, NULL, 200, true, 'success', NOW(), NOW()), ($4, $2, $3, 'acme.widget.synced', '{}'::jsonb, NULL, 200, true, 'success', NOW(), NOW() - INTERVAL '1 minute')`,
    [randomUUID(), url, companyId, randomUUID()],
  );
  await page.goto("/en/settings/webhook-deliveries");
  const legacyRow = page.getByRole("row").filter({ hasText: "Contact created (legacy)" });
  await expect(legacyRow).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: "acme.widget.synced" })).toHaveCount(1);
  await expect(page.getByText(/Common\.events\./)).toHaveCount(0);
  await legacyRow.getByRole("button", { name: url, exact: true }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Contact created (legacy)", { exact: true })).toBeVisible();
  await expect(modal.getByText(/Common\.events\./)).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.close();
});
