import type { Page } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { recordChannelsField } from "../../features/records/record-channels";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import {
  configureRow,
  configureTopBar,
  openConfigure,
  openConfigureRow,
  openConfigureTab,
  saveDrawer,
  saveGeneral,
} from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";
import { openRecordDetails } from "./record-rows";
import type { Client } from "pg";

async function readModel(database: Client, companyId: string) {
  const result = await database.query(
    'SELECT revision.snapshot FROM "RecordSchemaState" state JOIN "RecordSchemaRevision" revision ON revision."companyId" = state."companyId" AND revision.revision = state.revision WHERE state."companyId" = $1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0].snapshot);
}

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

async function center(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 6, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.move(to.x, to.y + 1, { steps: 2 });
  await page.mouse.up();
}

test("drags the Channels field in Configure and renames it like any field", async ({ page, database, companyId }) => {
  test.setTimeout(180000);
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const channelsId = id("capability.identity");
  const order = async () =>
    (await readModel(database, companyId)).fields
      .filter((field) => field.typeId === id("contact"))
      .map((field) => field.id);
  const before = await order();
  expect(before.at(-1)).toBe(channelsId);

  await openConfigure(page, id("contact"));
  await openConfigureTab(page, "Fields");
  const fields = page.getByRole("region", { name: "Fields", exact: true });
  await expect(configureRow(page, "Fields", "Channels")).toContainText("Channels · Entered manually");
  const channelsRow = fields.locator(`[data-configure-field="${channelsId}"]`);
  const nameRow = fields.locator(`[data-configure-field="${id("contact.name")}"]`);
  await channelsRow.hover();
  const handle = channelsRow.getByRole("button", { name: "Drag to reorder: Channels", exact: true });
  await expect(handle).toBeVisible();
  const start = await center(handle);
  await dragBetween(page, start, { x: start.x, y: (await center(nameRow)).y - 12 });
  const moved = [channelsId, ...before.filter((fieldId) => fieldId !== channelsId)];
  await expect
    .poll(() =>
      fields
        .locator("[data-configure-field]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-configure-field"))),
    )
    .toEqual(moved);
  await saveGeneral(page);
  await expect.poll(order).toEqual(moved);
  const positions = (await readModel(database, companyId)).fields
    .filter((field) => field.typeId === id("contact"))
    .map((field) => field.position);
  expect(new Set(positions).size).toBe(positions.length);

  await openConfigureRow(page, "Fields", "Channels");
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("combobox", { name: "Value type", exact: true })).toBeDisabled();
  await expect(drawer).toContainText(
    "Email addresses, WhatsApp phone numbers and social accounts that match messages to this record.",
  );
  await expect(drawer.getByRole("switch", { name: "Required", exact: true })).toHaveCount(0);
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Reach");
  await saveDrawer(page);
  await expect(configureRow(page, "Fields", "Reach")).toBeVisible();
  expect(recordChannelsField(await readModel(database, companyId), id("contact"))).toMatchObject({
    id: channelsId,
    label: "Reach",
    valueType: "channels",
  });
  await configureTopBar(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Channels", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("edits Channels inline on a record, pins it and copies on click", async ({ page, database, companyId }) => {
  test.setTimeout(180000);
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const channelsId = id("capability.identity");
  await page.goto(`/en/records/${id("contact")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Contact", exact: true });
  await drawer.getByRole("textbox", { name: "First name", exact: false }).fill("Inline");
  await drawer.getByRole("textbox", { name: "Last name", exact: false }).fill("Channels");
  const channel = drawer.getByRole("combobox", { name: "Add channel", exact: true });
  await channel.fill("inline@example.test");
  await page.getByRole("option").filter({ hasText: "inline@example.test" }).click();
  await expect(drawer.getByText("inline@example.test", { exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  const linked = async () =>
    (
      await database.query(
        'SELECT i.value FROM "RecordIdentity" i JOIN "RecordIdentityLink" l ON l."companyId" = i."companyId" AND l."identityId" = i.id WHERE i."companyId" = $1 ORDER BY i.value',
        [companyId],
      )
    ).rows.map((row) => row.value);
  await expect.poll(linked).toEqual(["inline@example.test"]);
  const values = await database.query('SELECT 1 FROM "RecordValue" WHERE "companyId" = $1 AND "fieldId" = $2', [
    companyId,
    channelsId,
  ]);
  expect(values.rows).toEqual([]);

  await openRecordDetails(page, "Inline Channels");
  const field = drawer.locator(`[data-entity-field="${channelsId}"]`);
  await expect(field).toContainText("inline@example.test");
  await expect(field.locator('[data-contact-action="open"]')).toHaveCount(1);
  await drawer.getByRole("button", { name: "Pin Channels to the overview", exact: true }).click();
  await expect(drawer.locator(`[data-summary-field="${channelsId}"]`)).toBeVisible();
  await expect
    .poll(async () => {
      const result = await database.query(
        'SELECT "detailOptions" FROM "P13n" WHERE "companyId" = $1 AND "p13nId" = $2',
        [companyId, `record-detail:${id("contact")}`],
      );
      return result.rows[0]?.detailOptions?.starredFieldIds;
    })
    .toEqual([channelsId]);
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();

  await openConfigure(page, id("contact"));
  await openConfigureTab(page, "Fields");
  await openConfigureRow(page, "Fields", "Channels");
  const settings = page.getByRole("dialog");
  await settings.getByRole("combobox", { name: "On click", exact: true }).click();
  await page.getByRole("option", { name: "Copy", exact: true }).click();
  await saveDrawer(page);
  await expect
    .poll(async () => recordChannelsField(await readModel(database, companyId), id("contact"))?.format?.onClick)
    .toBe("copy");
  await page.goto(`/en/records/${id("contact")}`);
  await openRecordDetails(page, "Inline Channels");
  await expect(drawer.locator(`[data-entity-field="${channelsId}"] [data-contact-action="copy"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});
