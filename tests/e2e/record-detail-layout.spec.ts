import { randomUUID } from "node:crypto";
import { test, expect, isBenignPageError } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import { presetId } from "../../features/records/crm-preset";

test("persists personal detail pins, visibility and keyboard order without losing the record draft", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  const typeId = presetId(companyId, "organization");
  const nameId = presetId(companyId, "organization.name");
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Layout company");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await openRecordDetails(page, "Layout company");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Draft stays here");
  await drawer.getByRole("button", { name: "Pin Name to the overview", exact: true }).click();
  await expect(drawer.locator(`[data-chip-column="${nameId}"]`)).toContainText("Draft stays here");
  await drawer.getByRole("button", { name: "Customize", exact: true }).click();
  await expect(drawer.getByRole("link", { name: "Edit field Name", exact: true })).toHaveAttribute(
    "href",
    new RegExp(`/configure\\?typeId=${typeId}&tab=fields&focus=field%3A${nameId}$`),
  );
  await expect(drawer.getByRole("link", { name: "Edit field Updated at", exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Hide Updated at from details", exact: true }).click();
  const drag = drawer.getByRole("button", { name: "Drag to reorder: Created at", exact: true });
  await drag.focus();
  await page.keyboard.press("Space");
  await expect(drag).toHaveAttribute("aria-pressed", "true");
  await expect(drawer.locator('[role="status"][aria-live="assertive"]')).toContainText("Created at");
  await drag.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("ArrowUp");
  await expect(drawer.locator('[role="status"][aria-live="assertive"]')).toContainText(
    "Moved Created at to Assigned to.",
  );
  await page.keyboard.press("Space");
  await expect(drag).not.toHaveAttribute("aria-pressed", "true");
  const readLayout = async () => {
    const result = await database.query('SELECT "detailOptions" FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
      companyId,
      `record-detail:${typeId}`,
    ]);
    return result.rows[0]?.detailOptions;
  };
  await expect
    .poll(readLayout)
    .toMatchObject({ starredFieldIds: [nameId], hiddenFieldIds: ["system:updatedAt"], fieldOrder: expect.any(Array) });
  await expect
    .poll(async () => {
      const persisted = await readLayout();
      return (
        persisted?.fieldOrder?.indexOf("system:createdAt") >= 0 &&
        persisted.fieldOrder.indexOf("system:createdAt") < persisted.fieldOrder.indexOf("system:assignedTo")
      );
    })
    .toBe(true);
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await expect(drawer.locator('[data-sortable-field="system:updatedAt"]')).not.toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Draft stays here");
  const source = await database.query(
    'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 ORDER BY "textValue"',
    [companyId, nameId],
  );
  expect(source.rows).toEqual([{ textValue: "Example organization" }, { textValue: "Layout company" }]);
  await drawer.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Draft stays here");
  await page.getByTestId("agent-panel").getByRole("button", { name: "Close", exact: true }).click();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.reload();
  await openRecordDetails(page, "Draft stays here");
  await expect(drawer.locator(`[data-chip-column="${nameId}"]`)).toContainText("Draft stays here");
  await expect(drawer.locator('[data-sortable-field="system:updatedAt"]')).not.toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("personal-record-details.png"),
    fullPage: true,
    animations: "disabled",
  });
  await drawer.getByRole("link", { name: "Open page", exact: true }).click();
  const main = page.getByRole("main");
  await expect(main.locator(`[data-chip-column="${nameId}"]`)).toBeVisible();
  await expect(page.locator("header")).toContainText("Draft stays here");
  if (testInfo.project.name !== "mobile") {
    await page.setViewportSize({ width: 1720, height: 1000 });
    await expect(main.locator("[data-detail-panel-switcher]")).not.toBeVisible();
    await expect(main.getByRole("region", { name: "Overview", exact: true })).toBeVisible();
    await expect(main.getByRole("region", { name: "Notes", exact: true })).toBeVisible();
    await expect(main.getByRole("region", { name: "Activities", exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("record-detail-desktop.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 980, height: 850 });
  }
  await expect(main.getByRole("tab", { name: "Notes", exact: true })).toBeVisible();
  await main.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Notes", exact: true })).toBeVisible();
  await main.getByRole("textbox", { name: "Notes", exact: true }).fill("A note from the full-page editor");
  await main.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Draft stays here");
  await page.locator("[data-record-page-actions]").getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.locator("[data-record-page-actions]").getByRole("button", { name: "Save", exact: true }),
  ).toHaveCount(0);
  const notesId = presetId(companyId, "organization.notes");
  await expect
    .poll(async () => {
      const notes = await database.query(
        'SELECT "jsonValue" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2',
        [companyId, notesId],
      );
      return JSON.stringify(notes.rows);
    })
    .toContain("A note from the full-page editor");
  await page.locator("[data-record-page-actions]").getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .locator("[data-record-page-actions]")
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  await expect.poll(readLayout).toBeNull();
  await expect(main.locator("[data-chip-column]")).toHaveCount(0);
  await page.locator("[data-record-page-actions]").getByRole("button", { name: "Done", exact: true }).click();
  await expect(main.locator('[data-sortable-field="system:updatedAt"]')).toBeVisible();
  const api = await page.request.post("/api/v1/records/detail-layout/save", {
    data: {
      typeId,
      expectedRevision: 1,
      idempotencyKey: randomUUID(),
      layout: { pinnedFields: ["system:createdAt"], hiddenFields: [nameId], fieldOrder: [] },
    },
  });
  expect(api.status()).toBe(200);
  await page.reload();
  await expect(main.locator('[data-chip-column="system:createdAt"]')).toBeVisible();
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).not.toBeVisible();
  await page.locator("header").getByRole("link", { name: "Organizations", exact: true }).click();
  await page.locator("#records-add").click();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toBeVisible();
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Visible required input");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  const records = await database.query(
    'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 ORDER BY "textValue"',
    [companyId, nameId],
  );
  expect(records.rows).toEqual([
    { textValue: "Draft stays here" },
    { textValue: "Example organization" },
    { textValue: "Visible required input" },
  ]);
  expect(errors).toEqual([]);
});

test("shows pinned fields as a chip row under the title that pins, edits the draft and unpins", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  const firstName = `Chip row ${randomUUID().slice(0, 6)}`;
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill(firstName);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await openRecordDetails(page, firstName);

  await expect(drawer.locator("[data-entity-detail-summary], [data-summary-cell]")).toHaveCount(0);
  await drawer.getByRole("button", { name: "Pin a field", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Last name", exact: true }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Last name", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.keyboard.press("Escape");
  const placeholder = drawer.locator("[data-record-chip-row] [data-chip-column]").filter({ hasText: "Last name" });
  await expect(placeholder.locator("[data-placeholder-chip]")).toBeVisible();
  const lastNameId = await placeholder.getAttribute("data-chip-column");
  const lastName = drawer.locator(`[data-record-chip-row] [data-chip-column="${lastNameId}"]`);

  await lastName.getByRole("button", { name: "Edit Last name", exact: true }).click();
  const editor = page.locator('[data-slot="popover-content"][data-state="open"]');
  await expect(editor).toContainText("Last name");
  await editor.locator("input").first().fill("Pinned");
  await page.keyboard.press("Escape");
  await expect(lastName.locator("[data-placeholder-chip]")).toHaveCount(0);
  await expect(lastName).toContainText("Pinned");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await page.reload();
  await openRecordDetails(page, `${firstName} Pinned`);
  await expect(lastName).toContainText("Pinned");
  await lastName.getByRole("button", { name: "Edit Last name", exact: true }).click();
  await editor.getByRole("button", { name: "Unpin Last name from the overview", exact: true }).click();
  await expect(lastName).toHaveCount(0);
});

test("edits header links with the card picker, keeps contact values outside edit targets, fills placeholders", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const suffix = randomUUID().slice(0, 6);
  const organization = `Picker org ${suffix}`;
  const firstName = `Picker ${suffix}`;
  await page.goto(`/en/records/${presetId(companyId, "organization")}`);
  await page.locator("#records-add").click();
  const organizationDrawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await organizationDrawer.getByRole("textbox", { name: "Name", exact: false }).fill(organization);
  await organizationDrawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(organizationDrawer).not.toBeVisible();

  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill(firstName);
  await drawer.getByRole("textbox", { name: "Avatar", exact: false }).fill("https://example.test/avatar.png");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await openRecordDetails(page, firstName);

  for (const field of ["Organizations", "Avatar", "Channels"]) {
    await drawer.getByRole("button", { name: "Pin a field", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: field, exact: true }).click();
    await page.keyboard.press("Escape");
  }
  const chips = drawer.locator("[data-record-chip-row]");
  await expect(chips.getByRole("group", { name: "Organizations", exact: true })).toBeVisible();
  await expect(chips.getByRole("group", { name: "Avatar", exact: true })).toBeVisible();

  const avatar = chips.getByRole("group", { name: "Avatar", exact: true });
  await expect(avatar.getByRole("link")).toBeVisible();
  await expect(avatar.locator("button a, a button")).toHaveCount(0);
  await expect(avatar.getByRole("button", { name: "Edit Avatar", exact: true })).toHaveCount(0);

  const organizations = chips.getByRole("group", { name: "Organizations", exact: true });
  await expect(organizations.locator("[data-placeholder-chip]")).toBeVisible();
  await organizations.getByRole("button", { name: "Edit Organizations", exact: true }).click();
  const picker = page.locator('[data-slot="popover-content"][data-state="open"]');
  await expect(picker.locator("[data-relationship-field]")).toHaveCount(0);
  await picker.getByRole("combobox", { name: "Organizations", exact: true }).fill(organization);
  await picker.getByRole("option", { name: organization, exact: true }).click();
  await expect(organizations).toContainText(organization);
  await organizations.getByRole("button", { name: "Edit Organizations", exact: true }).click();
  await expect(picker.getByRole("option", { name: `Open ${organization}`, exact: true })).toBeVisible();
  await expect(
    picker.getByRole("option", { name: "Unpin Organizations from the overview", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  const channels = chips.getByRole("group", { name: "Channels", exact: true });
  await expect(channels.locator("[data-placeholder-chip]")).toBeVisible();
  await channels.getByRole("button", { name: "Edit Channels", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Unpin Channels from the overview", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.reload();
  await openRecordDetails(page, firstName);
  await expect(organizations).toContainText(organization);
  await drawer.getByRole("button", { name: "Pin a field", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Avatar", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(avatar).toHaveCount(0);
  expect(errors).toEqual([]);
});
