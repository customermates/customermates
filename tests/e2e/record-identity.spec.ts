import { test, expect } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import { presetId } from "../../features/records/crm-preset";

test("edits identity channels in the generic drawer and searches persisted channels", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const typeId = presetId(companyId, "contact");
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const dialog = page.getByRole("dialog", { name: "Contact", exact: true });
  await dialog.getByRole("textbox", { name: "First name", exact: false }).fill("Identity");
  await dialog.getByRole("textbox", { name: "Last name", exact: false }).fill("Person");
  const channel = dialog.getByRole("combobox", { name: "Add channel", exact: true });
  await channel.fill("Person@Example.test");
  await page.getByRole("option").filter({ hasText: "Person@Example.test" }).click();
  await expect(dialog.getByText("person@example.test", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const stored = await database.query(
    'SELECT i.id,l."recordId",i.value FROM "RecordIdentity" i JOIN "RecordIdentityLink" l ON l."companyId"=i."companyId" AND l."identityId"=i.id WHERE i."companyId"=$1',
    [companyId],
  );
  expect(stored.rows).toHaveLength(1);
  expect(stored.rows[0].value).toBe("person@example.test");
  const recordId = stored.rows[0].recordId;
  await page.reload();
  await expect(page.getByRole("columnheader", { name: /^Channels / })).toBeVisible();
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await expect(page.getByRole("menu").getByText("person@example.test", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: testInfo.outputPath("record-identity-table.png"),
    animations: "disabled",
    fullPage: true,
  });
  await openRecordDetails(page, "Identity Person");
  await expect(dialog.getByText("person@example.test", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Unlink Email", exact: false }).click();
  await expect(dialog.getByText("person@example.test", { exact: true })).not.toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const discard = page.getByRole("alertdialog");
  await expect(discard).toBeVisible();
  await expect(dialog).toBeVisible();
  await discard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(discard).not.toBeVisible();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "More actions for Identity Person", exact: true })).toBeFocused();
  await page.reload();
  await openRecordDetails(page, "Identity Person");
  await expect(dialog.getByText("person@example.test", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await dialog.getByText("person@example.test", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("record-identity-channels.png"),
    animations: "disabled",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  const response = await page.request.post("/api/v1/records/search", { data: { searchTerm: "person@example.test" } });
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toMatchObject({ results: [{ ref: { typeId, recordId } }] });
  const unchanged = await database.query('SELECT id FROM "RecordIdentity" WHERE "companyId"=$1', [companyId]);
  expect(unchanged.rows).toEqual([{ id: stored.rows[0].id }]);
  expect(errors).toEqual([]);
});
