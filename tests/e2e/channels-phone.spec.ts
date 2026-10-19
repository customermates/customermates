import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { copyGenericWorkspace } from "../helpers/copy-generic-workspace";
import { applyConfigurableRecordsMigration, createLegacyMigrationDatabase } from "../helpers/legacy-migration-database";
import { legacyRecordFixture } from "../helpers/legacy-record-fixture";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import { removeBrowserWorkspace } from "./workspace";

test("adds a typed number to contact details as a phone that can be called", async ({ page, database, companyId }) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill("Phone");
  await drawer.getByRole("textbox", { name: "Last name", exact: false }).fill("Person");
  await drawer.getByRole("combobox", { name: "Add phone, email or profile", exact: true }).fill("0621 123456");
  await page.getByRole("option", { name: 'Add "0621 123456" as Phone', exact: true }).click();
  const phones = drawer.locator('[data-record-channel-group="phone"]');
  await expect(phones).toContainText("Phone");
  await expect(phones.getByRole("link", { name: "+49621123456", exact: true })).toHaveAttribute(
    "href",
    "tel:+49621123456",
  );
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT provider::text AS provider, "channelClass", value FROM "RecordIdentity" WHERE "companyId" = $1',
            [companyId],
          )
        ).rows,
    )
    .toEqual([{ provider: "phone", channelClass: "phone", value: "+49621123456" }]);

  await openRecordDetails(page, "Phone Person");
  await expect(
    drawer.locator('[data-record-channel-group="phone"]').getByRole("link", { name: "+49621123456" }),
  ).toHaveAttribute("href", "tel:+49621123456");
  expect(errors).toEqual([]);
});

const upgraded = test.extend({
  workspace: async ({ database }, use) => {
    const upgrade = await createLegacyMigrationDatabase(process.env.CRM_E2E_DATABASE_URL);
    const legacy = await legacyRecordFixture(upgrade.client);
    const workspace = {
      companyId: legacy.companyId,
      userId: legacy.userId,
      authUserId: randomUUID(),
    };
    try {
      const phone = await legacy.insert("CustomColumn", {
        entityType: "contact",
        type: "phone",
        label: "Phone",
        options: { allowMultiple: false },
      });
      await legacy.insert("CustomFieldValue", {
        entityType: "contact",
        contactId: legacy.recordId,
        columnId: phone,
        type: "phone",
        value: "+4930123456",
      });
      const email = await legacy.insert("CustomColumn", {
        entityType: "contact",
        type: "email",
        label: "Email",
        options: { allowMultiple: false },
      });
      await legacy.insert("CustomFieldValue", {
        entityType: "contact",
        contactId: legacy.recordId,
        columnId: email,
        type: "email",
        value: "Synthetic.Person@Example.test",
      });
      await upgrade.client.query(
        'UPDATE "User" SET "agreeToTerms" = true, "onboardingWizardCompletedAt" = NOW(), "displayLanguage" = \'en\', "formattingLocale" = \'en\', "agentCreditActivatedAt" = NOW() WHERE id = $1',
        [legacy.userId],
      );
      await upgrade.client.query(
        'INSERT INTO "AuthUser" (id, "companyId", email, name, "emailVerified", "updatedAt") SELECT $1, "companyId", email, \'Migration administrator\', true, NOW() FROM "User" WHERE id = $2',
        [workspace.authUserId, legacy.userId],
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

upgraded("shows the values of former phone and email fields in contact details", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const contact = presetId(companyId, "contact");
  const messaging = process.env.APP_MODE !== "self-hosted";
  if (messaging) {
    // An email conversation with the former Email field's address, in another case, appears on the record.
    const accountId = randomUUID();
    const threadId = randomUUID();
    const address = "synthetic.person@example.test";
    await database.query(
      'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,NOW())',
      [accountId, companyId, workspace.userId, randomUUID()],
    );
    await database.query(
      'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',NOW(),NOW())',
      [threadId, companyId, accountId, randomUUID()],
    );
    await database.query(
      'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$5,$4,\'Synthetic Person\',NOW())',
      [randomUUID(), companyId, threadId, address, "Synthetic.Person@Example.test"],
    );
    await database.query(
      'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,\'Conversation after the upgrade\',NOW(),NOW())',
      [
        randomUUID(),
        companyId,
        threadId,
        accountId,
        randomUUID(),
        JSON.stringify({ attendeeId: address, identifier: address, displayName: "Synthetic Person" }),
        JSON.stringify({ to: [], cc: [], bcc: [] }),
      ],
    );
  }
  const labels = (
    await database.query(
      'SELECT definition ->> \'label\' AS label FROM "RecordFieldDefinition" WHERE "companyId" = $1 AND "typeId" = $2',
      [companyId, contact],
    )
  ).rows.map((row) => row.label);
  expect(labels).toContain("Contact details");
  expect(labels).not.toContain("Phone");
  expect(labels).not.toContain("Email");
  await page.goto(`/en/records/${contact}`);
  await expect(page.locator("header")).toContainText("Contacts");
  await openRecordDetails(page, "Synthetic Person");
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(
    drawer.locator('[data-record-channel-group="phone"]').getByRole("link", { name: "+4930123456" }),
  ).toHaveAttribute("href", "tel:+4930123456");
  await expect(
    drawer.locator('[data-record-channel-group="email"]').getByRole("link", { name: "synthetic.person@example.test" }),
  ).toHaveAttribute("href", "mailto:synthetic.person@example.test");
  await expect(drawer.getByRole("textbox", { name: "Phone", exact: true })).toHaveCount(0);
  await expect(drawer.getByRole("textbox", { name: "Email", exact: true })).toHaveCount(0);
  if (messaging) {
    await drawer.getByRole("tab", { name: "Activities", exact: true }).click();
    await expect(drawer.getByText("Conversation after the upgrade", { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
