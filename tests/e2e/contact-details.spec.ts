import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";

import { presetId } from "../../features/records/crm-preset";
import { addFromConfigure, configureDrawer, openConfigure } from "./configure";
import { test, expect, collectPageErrors } from "./fixtures";
import { openRecordDetails } from "./record-rows";

async function workbook(rows: unknown[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Contacts");
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

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
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const contact = presetId(companyId, "contact");
  await page.goto(`/en/records/${contact}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill("Ada");
  await drawer.getByRole("textbox", { name: "Last name", exact: false }).fill("Details");
  const add = drawer.getByRole("combobox", { name: "Add phone, email or profile", exact: true });
  for (const [value, provider, group] of [
    ["Ada@Example.test", "Email", "email"],
    ["+49 621 123456", "Phone", "phone"],
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

    await page.goto(`/en/records/${presetId(companyId, "contact")}`);
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

test("imports the email and phone columns of an Excel file into contact details", async ({
  page,
  database,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectPageErrors(page);
  const contact = presetId(companyId, "contact");
  await page.goto(`/en/records/${contact}`);
  await page.locator("#records-more").click();
  await page.getByRole("menuitem", { name: "Add from file", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "contacts.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await workbook([
      ["First name", "Last name", "E-Mail", "Mobile"],
      ["Grace", "Imported", "Grace@Example.test", "+49 170 1234567"],
      ["Linus", "Imported", "not an address", ""],
    ]),
  });
  await expect(dialog).toContainText("Step 1 of 5");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 2 of 5");
  await expect(dialog.locator("#xlsx-import-target-2")).toContainText("Contact details");
  await expect(dialog.locator("#xlsx-import-target-3")).toContainText("Contact details");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  await expect(dialog).toContainText("Step 3 of 5");
  await expect(dialog).toContainText("“not an address” is not an email address, phone number or profile link.");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Step 4 of 5");
  await dialog.getByRole("button", { name: "Import records", exact: true }).click();
  const summary = dialog.getByTestId("xlsx-import-summary");
  await expect(summary).toContainText("1 record created", { timeout: 60000 });
  await expect(summary).toContainText("1 row failed");
  await dialog.locator("#xlsx-import-save").click();
  await expect(dialog).not.toBeVisible();

  expect(
    (
      await database.query(
        'SELECT i.provider::text AS provider, i.value FROM "RecordIdentity" i JOIN "RecordIdentityLink" l ON l."companyId" = i."companyId" AND l."identityId" = i.id WHERE i."companyId" = $1 AND l."typeId" = $2',
        [companyId, contact],
      )
    ).rows.sort((left, right) => (left.provider < right.provider ? 1 : -1)),
  ).toEqual([
    { provider: "phone", value: "+491701234567" },
    { provider: "mail", value: "grace@example.test" },
  ]);
  await openRecordDetails(page, "Grace Imported");
  await expect(
    page
      .getByRole("dialog", { name: "Contact", exact: true })
      .locator('[data-record-channel-group="email"]')
      .getByRole("link", { name: "grace@example.test" }),
  ).toHaveAttribute("href", "mailto:grace@example.test");
  expect(errors).toEqual([]);
});
