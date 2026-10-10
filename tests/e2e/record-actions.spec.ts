import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import type { Page } from "@playwright/test";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { test, expect } from "./fixtures";
import { openRecordDetails } from "./record-rows";

async function api(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function setListColor(page: Page, typeId: string, color: string) {
  const model = RecordModelSchema.parse(await api(page, "/api/v1/model/discover", {}));
  const type = model.types.find((candidate) => candidate.id === typeId);
  if (!type) throw new Error(`List ${typeId} is missing`);
  await api(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [{ operation: "putType", type: { ...type, color } }],
  });
}

test("records list top bar orders Filter, Appearance and More actions before Add and keeps Configure in the menu", async ({
  page,
  companyId,
}) => {
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  const header = page.locator("header.sticky");
  const controls = ["#records-filter", "#records-display-options", "#records-more", "#records-add"].map((id) =>
    header.locator(id),
  );
  for (const control of controls) await expect(control).toBeVisible();
  await expect(header.locator("#records-search")).toHaveCount(0);
  await expect(header.locator("#records-configure")).toHaveCount(0);
  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  for (let index = 1; index < boxes.length; index += 1) expect(boxes[index - 1]!.x).toBeLessThan(boxes[index]!.x);
  const more = header.locator("#records-more");
  await expect(more).toHaveAccessibleName("More actions");
  await more.hover();
  await expect(page.getByRole("tooltip", { name: "More actions" })).toBeVisible();
  await more.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "Export", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Configure Contacts", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("record drawer keeps record actions icon-only in the header row next to Close", async ({ page, companyId }) => {
  const typeId = presetId(companyId, "organization");
  const name = `Header actions ${randomUUID().slice(0, 8)}`;
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  const rail = drawer.locator('[data-slot="app-modal-actions"]');
  await expect(rail.getByRole("button", { name: "Customize", exact: true })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await openRecordDetails(page, name);
  const customize = rail.getByRole("button", { name: "Customize", exact: true });
  await expect(customize).toHaveText("");
  await expect(customize).toHaveAttribute("aria-pressed", "false");
  await customize.hover();
  await expect(page.getByRole("tooltip", { name: "Customize" })).toBeVisible();
  await expect(rail.getByRole("link", { name: "Open page", exact: true })).toBeVisible();
  const close = drawer.getByRole("button", { name: "Close", exact: true });
  const [railBox, closeBox] = await Promise.all([rail.boundingBox(), close.boundingBox()]);
  expect(Math.abs(railBox!.y + railBox!.height / 2 - (closeBox!.y + closeBox!.height / 2))).toBeLessThan(2);
  expect(railBox!.x + railBox!.width).toBeLessThan(closeBox!.x);
  await expect(drawer.locator('[data-slot="card-footer"]').getByRole("button", { name: "Delete" })).toHaveCount(0);

  await rail.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
});

test("single select inputs show the selected option as a chip", async ({ page, companyId }) => {
  await page.goto(`/en/records/${presetId(companyId, "deal")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Deal", exact: true });
  const stage = drawer.getByRole("combobox", { name: "Stage", exact: false });
  await stage.click();
  await expect(page.getByRole("option", { name: "Qualified", exact: true }).locator('[data-slot="badge"]')).toBeVisible();
  await page.getByRole("option", { name: "Qualified", exact: true }).click();
  await expect(stage.locator('[data-slot="badge"]')).toHaveText("Qualified");
  await expect(stage.locator('[data-slot="badge"]')).toHaveAttribute("data-variant", "secondary");
});

test("relationship inputs keep linked chips and the record search inside one field", async ({
  page,
  companyId,
}) => {
  await setListColor(page, presetId(companyId, "organization"), "info");
  await page.goto(`/en/records/${presetId(companyId, "deal")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Deal", exact: true });
  const combobox = drawer.getByRole("combobox", { name: "Organizations", exact: true });
  const field = combobox.locator("xpath=ancestor::*[@data-relationship-field][1]");
  await expect(field).toContainText("Link a record");
  await combobox.click();
  await page.getByRole("option", { name: "Example organization", exact: true }).click();
  const chip = field.locator("[data-relationship-chip]");
  await expect(chip).toHaveText("Example organization");
  await expect(chip).toHaveAttribute("data-variant", "info");
  await expect(field).not.toContainText("Link a record");
  const [chipBox, comboboxBox] = await Promise.all([chip.boundingBox(), combobox.boundingBox()]);
  expect(Math.abs(chipBox!.y + chipBox!.height / 2 - (comboboxBox!.y + comboboxBox!.height / 2))).toBeLessThan(4);
  await field.getByRole("button", { name: "Unlink Example organization", exact: false }).click();
  await expect(chip).toHaveCount(0);
  await expect(field).toContainText("Link a record");
});

test("record tables edit cells in place, open linked chips and offer row actions", async ({
  page,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  await setListColor(page, presetId(companyId, "organization"), "info");
  const name = `Inline deal ${randomUUID().slice(0, 8)}`;
  await page.goto(`/en/records/${presetId(companyId, "deal")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Deal", exact: true });
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await drawer.getByRole("combobox", { name: "Stage", exact: true }).click();
  await page.getByRole("option", { name: "New", exact: true }).click();
  await drawer.getByRole("combobox", { name: "Organizations", exact: true }).click();
  await page.getByRole("option", { name: "Example organization", exact: true }).click();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: "Edit Stage", exact: true }).click();
  await page.getByRole("menuitem", { name: "Qualified", exact: true }).click();
  await expect(row.getByRole("button", { name: "Edit Stage", exact: true })).toHaveText("Qualified");
  await expect(row.getByRole("button", { name: "Edit Value", exact: true })).toHaveCount(0);
  await expect(drawer).not.toBeVisible();

  const organizations = row.getByRole("button", { name: "Edit Organizations", exact: true });
  await expect(organizations.locator('[data-slot="badge"]')).toHaveAttribute("data-variant", "info");
  await organizations.click();
  const picker = page.locator('[data-slot="popover-content"][data-state="open"]');
  await expect(picker.getByRole("option").last()).toHaveText("Open Example organization");
  await picker.getByRole("option", { name: "Open Example organization", exact: true }).click();
  const organization = page.getByRole("dialog", { name: "Organization", exact: true });
  await expect(organization.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Example organization");
  await organization.getByRole("button", { name: "Close", exact: true }).click();
  await expect(organization).not.toBeVisible();
  await organizations.locator('[data-chip-id]').first().click({ modifiers: ["ControlOrMeta"] });
  await expect(organization.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Example organization");
  await expect(picker).toHaveCount(0);
  await organization.getByRole("button", { name: "Close", exact: true }).click();
  await expect(organization).not.toBeVisible();

  const actions = row.locator("[data-record-row-actions]");
  await expect(actions).toHaveCSS("opacity", testInfo.project.name === "mobile" ? "1" : "0");
  await row.getByRole("button", { name: `More actions for ${name}`, exact: true }).focus();
  await expect(actions).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem")).toHaveText(["Open details", "Delete"]);
  await page.getByRole("menuitem", { name: "Open details", exact: true }).press("Enter");
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue(name);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await row.hover();
  await row.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect(row).toHaveCount(0);
});

test("record tables edit number fields in place without opening the drawer", async ({ page, companyId }) => {
  const name = `Inline service ${randomUUID().slice(0, 8)}`;
  await page.goto(`/en/records/${presetId(companyId, "service")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Service", exact: true });
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: name });
  await row.hover();
  await row.getByRole("button", { name: "Edit Price", exact: true }).click();
  const editor = row.locator("[data-in-place-editor]");
  await expect(editor.locator("input")).toBeFocused();
  await editor.locator("input").fill("250");
  await editor.locator("input").press("Enter");
  await expect(editor).toHaveCount(0);
  await expect(row).toContainText("250");
  await expect(drawer).not.toBeVisible();
});

test("linked record chips collapse into a +N stack so rows and cards keep one height", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const id = (key: string) => presetId(companyId, key);
  const model = RecordModelSchema.parse(await api(page, "/api/v1/model/discover", {}));
  const create = async (typeKey: string, name: string, links: unknown[] = []) => {
    const result = await api(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id(typeKey),
        fields: [{ fieldId: id(`${typeKey}.name`), value: { kind: "text", value: name } }],
        links,
      },
    });
    return result.refs.find((ref: { typeId: string }) => ref.typeId === id(typeKey));
  };
  const suffix = randomUUID().slice(0, 6);
  const crowded = await create("deal", `Crowded deal ${suffix}`);
  const quiet = await create("deal", `Quiet deal ${suffix}`);
  await create("organization", `Single organization ${suffix}`, [
    { relationId: id("deal.organizations"), direction: "incoming", record: quiet },
  ]);
  for (let index = 1; index <= 8; index += 1)
    await create("organization", `Stacked organization with a long name ${index} ${suffix}`, [
      { relationId: id("deal.organizations"), direction: "incoming", record: crowded },
    ]);

  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto(`/en/records/${id("deal")}`);
  const crowdedRow = page.getByRole("row").filter({ hasText: `Crowded deal ${suffix}` });
  const quietRow = page.getByRole("row").filter({ hasText: `Quiet deal ${suffix}` });
  const organizations = crowdedRow.getByRole("button", { name: "Edit Organizations", exact: true });
  const more = organizations
    .locator('[data-slot="badge"]:not([aria-hidden="true"] *)')
    .filter({ hasText: /^\+\d+$/ });
  await expect(more).toHaveCount(1);
  await expect(more).toBeVisible();
  await expect
    .poll(async () => {
      const shown = await organizations.locator('[data-chip-id]:not([aria-hidden="true"] *)').count();
      return shown + Number((await more.innerText()).slice(1));
    })
    .toBe(8);
  const [crowdedBox, quietBox] = await Promise.all([crowdedRow.boundingBox(), quietRow.boundingBox()]);
  expect(Math.abs(crowdedBox!.height - quietBox!.height)).toBeLessThan(2);
  await organizations.click();
  const picker = page.locator('[data-slot="popover-content"][data-state="open"]');
  await expect(picker.getByRole("option").filter({ hasText: /^Open Stacked organization/ })).toHaveCount(8);
  await page.keyboard.press("Escape");
});

test("record drawer tabs remember the last tab and flag invalid fields on other tabs", async ({ page, companyId }) => {
  const id = (key: string) => presetId(companyId, key);
  await page.goto(`/en/records/${id("organization")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  const tabs = drawer.getByRole("tablist", { name: "Overview", exact: true });
  await expect(tabs.getByRole("tab")).toHaveText(["Overview", "Notes"]);
  await tabs.getByRole("tab", { name: "Notes" }).click();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  const overview = tabs.getByRole("tab", { name: /^Overview/ });
  await expect(overview).toHaveAttribute("data-invalid", "true");
  await expect(overview.locator("[data-tab-error-dot]")).toBeVisible();
  await expect(drawer).toBeVisible();
  await overview.click();
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(`Tabbed ${randomUUID().slice(0, 6)}`);
  await tabs.getByRole("tab", { name: "Notes" }).click();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await openRecordDetails(page, "Example organization");
  await expect(drawer.getByRole("tab", { name: "Notes" })).toHaveAttribute("data-state", "active");
  await page.setViewportSize({ width: 360, height: 800 });
  const list = drawer.locator('[data-slot="segmented-control-list"]');
  expect(await list.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
