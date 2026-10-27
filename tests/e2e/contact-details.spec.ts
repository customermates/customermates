import { randomUUID } from "node:crypto";

import { presetId } from "../../features/records/crm-preset";
import { appPath, companyPath, workspaceSlugOf } from "./app-paths";
import { copyGenericWorkspace } from "../helpers/copy-generic-workspace";
import { applyConfigurableRecordsMigration, createLegacyMigrationDatabase } from "../helpers/legacy-migration-database";
import { legacyRecordFixture } from "../helpers/legacy-record-fixture";
import { addFromConfigure, configureDrawer, openConfigure } from "./configure";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import { invokesServerAction, serverActionIds } from "./server-actions";
import { removeBrowserWorkspace } from "./workspace";

test("explains the contact details type in the field type picker and offers no email or phone type", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  await openConfigure(page, presetId(companyId, "organization"));
  await addFromConfigure(page, "Field");
  await configureDrawer(page).getByRole("combobox", { name: "Value type", exact: true }).click();
  const option = page.getByRole("option", { name: /^Phone, email & social/ });
  await expect(option).toContainText("Phone numbers, email addresses and social profiles");
  await expect(page.getByRole("option", { name: "Email", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /^Phone$/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /^Channels/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("keeps an email address, a phone number and a social profile in contact details and opens each", async ({
  page,
  database,
  companyId,
  workspace,
  diagnostics,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  let unavailableLookups = 0;
  if (process.env.APP_MODE !== "self-hosted") {
    await database.query(
      'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","updatedAt") VALUES ($1,$2,$3,$4,\'linkedin\',\'ok\',true,NOW())',
      [randomUUID(), companyId, workspace.userId, randomUUID()],
    );
    const lookupIds = serverActionIds("app/[locale]/(protected)/w/[workspace]/inbox/actions.ts", "resolveProviderProfileAction");
    await page.route("**/*", async (route) => {
      if (!invokesServerAction(route.request(), lookupIds)) return route.fallback();
      unavailableLookups += 1;
      const pathname = new URL(route.request().url()).pathname;
      diagnostics.expect({
        kind: "console",
        text: /^Failed to load resource:.*ERR_FAILED/,
        source: (url) => url.pathname === pathname,
        page,
      });
      await route.abort("failed");
    });
  }
  const contact = presetId(companyId, "contact");
  await page.goto(companyPath(companyId, `/records/${contact}`));
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill("Ada");
  await drawer.getByRole("textbox", { name: "Last name", exact: false }).fill("Details");
  const add = drawer.getByRole("combobox", { name: "Add phone, email or profile", exact: true });
  for (const [value, provider, group] of [
    ["Ada@Example.test", "Email", "email"],
    ["0621 123456", "Phone", "phone"],
    ["https://www.linkedin.com/in/ada-details", "LinkedIn", "social"],
  ] as const) {
    await add.fill(value);
    await expect(page.getByRole("option", { name: `Add "${value}" as ${provider}`, exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await add.press("Enter");
    await expect(add).toHaveValue("");
    await expect(drawer.locator(`[data-record-channel-group="${group}"]`)).toBeVisible();
  }
  if (process.env.APP_MODE !== "self-hosted") expect(unavailableLookups).toBeGreaterThan(0);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT i.provider::text AS provider, i."channelClass", i.value FROM "RecordIdentity" i JOIN "RecordIdentityLink" l ON l."companyId" = i."companyId" AND l."identityId" = i.id WHERE i."companyId" = $1 ',
            [companyId],
          )
        ).rows.sort((left, right) => (left.channelClass < right.channelClass ? -1 : 1)),
    )
    .toEqual([
      { provider: "mail", channelClass: "email", value: "ada@example.test" },
      { provider: "linkedin", channelClass: "linkedin", value: "ada-details" },
      { provider: "phone", channelClass: "phone", value: "+49621123456" },
    ]);
  const values = await database.query(
    'SELECT 1 FROM "RecordValue" WHERE "companyId" = $1 AND "fieldId" = $2',
    [companyId, presetId(companyId, "capability.identity")],
  );
  expect(values.rows).toEqual([]);

  await openRecordDetails(page, "Ada Details");
  const field = drawer.locator(`[data-entity-field="${presetId(companyId, "capability.identity")}"]`);
  await expect(field).toContainText("Contact details");
  await expect(
    field.locator('[data-record-channel-group="email"]').getByRole("link", { name: "ada@example.test" }),
  ).toHaveAttribute("href", "mailto:ada@example.test");
  await expect(
    field.locator('[data-record-channel-group="phone"]').getByRole("link", { name: "+49621123456" }),
  ).toHaveAttribute("href", "tel:+49621123456");
  await expect(field.locator('[data-record-channel-group="social"]').getByRole("link").first()).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/ada-details",
  );
  expect(errors).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true });

  test("keeps the add phone, email or profile menu fully on screen", async ({
    page,
    database,
    companyId,
    workspace,
  }) => {
    test.skip(process.env.APP_MODE === "self-hosted", "Messaging is part of the cloud service only");
    test.setTimeout(180000);
    const errors = collectPageErrors(page);
    const accountId = randomUUID();
    const threadId = randomUUID();
    await database.query(
      'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,NOW())',
      [accountId, companyId, workspace.userId, randomUUID()],
    );
    await database.query(
      'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',NOW(),NOW())',
      [threadId, companyId, accountId, randomUUID()],
    );
    const names = ["Crew Anna", "Crew Bert", "Crew Cleo", "Crew Dana"];
    for (const name of names) {
      const email = `${name.toLowerCase().replace(" ", ".")}@example.test`;
      await database.query(
        'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,$5,NOW())',
        [randomUUID(), companyId, threadId, email, name],
      );
    }

    await page.goto(companyPath(companyId, `/records/${presetId(companyId, "contact")}`));
    await page.locator("#records-add").click();
    const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
    const add = drawer.getByRole("combobox", { name: "Add phone, email or profile", exact: true });
    await add.fill("crew");
    const options = page.getByRole("option");
    await expect(options).toHaveCount(names.length);
    const menu = page.locator('[data-slot="popover-content"]');
    const box = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
    for (const name of names) await expect(options.filter({ hasText: name })).toBeInViewport({ ratio: 1 });
    expect(errors).toEqual([]);
  });
});

const upgraded = test.extend({
  workspace: async ({ database }, use) => {
    const upgrade = await createLegacyMigrationDatabase(process.env.CRM_E2E_DATABASE_URL);
    const legacy = await legacyRecordFixture(upgrade.client);
    const workspace = {
      companyId: legacy.companyId,
      userId: legacy.userId,
      authUserId: randomUUID(),
      slug: "",
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
      workspace.slug = await workspaceSlugOf(database, legacy.companyId);
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
  await page.goto(appPath(workspace.slug, `/records/${contact}`));
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
