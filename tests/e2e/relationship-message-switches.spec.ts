import type { Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { configureDrawer, openConfigure, openConfigureRow, saveDrawer } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

async function readModel(database: Client, companyId: string) {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

test("shows and saves the per-direction message switches of a relationship", async ({ page, database, companyId }) => {
  const errors = captureErrors(page);
  const relationId = presetId(companyId, "deal.contacts");
  const before = (await readModel(database, companyId)).relationships.find((relation) => relation.id === relationId);
  expect(before).toMatchObject({ messagesOnSource: true, messagesOnTarget: false });

  await openConfigure(page, presetId(companyId, "deal"));
  await openConfigureRow(page, "Relationships", "Contacts");
  const drawer = configureDrawer(page);
  const onDeals = drawer.getByRole("switch", { name: "Show their messages on Deals", exact: true });
  const onContacts = drawer.getByRole("switch", { name: "Show their messages on Contacts", exact: true });
  await expect(onDeals).toBeChecked();
  await expect(onContacts).not.toBeChecked();
  await expect(drawer.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  await onContacts.click();
  await expect(onContacts).toBeChecked();
  await saveDrawer(page);
  await expect
    .poll(async () => (await readModel(database, companyId)).relationships.find((relation) => relation.id === relationId))
    .toMatchObject({ messagesOnSource: true, messagesOnTarget: true });

  await openConfigureRow(page, "Relationships", "Contacts");
  await expect(onContacts).toBeChecked();
  await onContacts.click();
  await saveDrawer(page);
  await expect
    .poll(async () => (await readModel(database, companyId)).relationships.find((relation) => relation.id === relationId))
    .toMatchObject({ messagesOnSource: true, messagesOnTarget: false });
  expect(errors).toEqual([]);
});
