import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { copyGenericWorkspace } from "../helpers/copy-generic-workspace";
import { applyConfigurableRecordsMigration, createLegacyMigrationDatabase } from "../helpers/legacy-migration-database";
import { legacyRecordFixture } from "../helpers/legacy-record-fixture";
import { test as base, expect, isBenignPageError } from "./fixtures";
import { removeBrowserWorkspace } from "./workspace";
import { openRecordDetails } from "./record-rows";

const test = base.extend({
  workspace: async ({ database }, use) => {
    const upgrade = await createLegacyMigrationDatabase(process.env.CRM_E2E_DATABASE_URL);
    const legacy = await legacyRecordFixture(upgrade.client);
    const authUserId = randomUUID();
    const workspace = {
      companyId: legacy.companyId,
      userId: legacy.userId,
      authUserId,
    };
    try {
      for (const dealId of [legacy.recordId, legacy.otherDeal])
        await legacy.insert("DealUser", { dealId, userId: legacy.userId });
      await upgrade.client.query(
        'UPDATE "User" SET "agreeToTerms" = true, "onboardingWizardCompletedAt" = NOW(), "displayLanguage" = \'en\', "formattingLocale" = \'en\', "agentCreditActivatedAt" = NOW() WHERE id = $1',
        [legacy.userId],
      );
      await upgrade.client.query(
        'INSERT INTO "AuthUser" (id, "companyId", email, name, "emailVerified", "updatedAt") SELECT $1, "companyId", email, \'Migration administrator\', true, NOW() FROM "User" WHERE id = $2',
        [authUserId, legacy.userId],
      );
      await upgrade.client.query(
        'INSERT INTO "Subscription" (id, "companyId", status, "updatedAt") VALUES ($1, $2, \'active\', NOW())',
        [randomUUID(), legacy.companyId],
      );
      await applyConfigurableRecordsMigration(upgrade.client);
      await copyGenericWorkspace(upgrade.client, database, legacy.companyId);
      await use(workspace);
    } finally {
      try {
        await removeBrowserWorkspace(database, workspace);
      } finally {
        await upgrade.close();
      }
    }
  },
});

test("opens upgraded records with persisted values, totals and links", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  const typeId = presetId(companyId, "deal");
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator("header")).toContainText("Deals");
  await expect(page.getByRole("link", { name: "Synthetic deal", exact: true })).toHaveCount(2);
  await openRecordDetails(page, "Synthetic deal");
  const drawer = page.getByRole("dialog", { name: "Deal", exact: true });
  await expect(drawer.getByRole("heading", { name: "Synthetic deal", exact: true })).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Synthetic deal");
  await expect(drawer.getByRole("textbox", { name: "Value", exact: true })).toHaveText("€2,600.00");
  await expect(drawer.getByRole("textbox", { name: "Weighted value", exact: true })).toHaveText("€1,560.00");
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
  await page.screenshot({
    path: testInfo.outputPath("upgraded-deals.png"),
    fullPage: true,
    animations: "disabled",
  });
  const personType = presetId(companyId, "contact");
  const retiredContacts = await page.goto("/en/contacts");
  expect(retiredContacts?.status()).toBe(404);
  const contacts = await page.goto(`/en/records/${personType}`);
  expect(contacts?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/en/records/${personType}$`));
  await expect(page.locator("header")).toContainText("Contacts");
  const person = (
    await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 LIMIT 1', [
      companyId,
      personType,
    ])
  ).rows[0];
  await page.getByRole("button", { name: "Synthetic Person", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Open page", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${personType}/${person.id}$`));
  await expect(page.getByText("Organization A", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
