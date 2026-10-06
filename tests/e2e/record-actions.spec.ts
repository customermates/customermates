import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { test, expect } from "./fixtures";

test("records list header keeps Configure icon-only and left of the primary Add action", async ({ page, companyId }) => {
  await page.goto(`/en/records/${presetId(companyId, "contact")}`);
  const header = page.locator("header.sticky");
  const configure = header.locator("#records-configure");
  const add = header.locator("#records-add");
  await expect(configure).toBeVisible();
  await expect(add).toBeVisible();
  await expect(configure).toHaveAccessibleName("Configure");
  await expect(configure).toHaveText("");
  const [configureBox, addBox] = await Promise.all([configure.boundingBox(), add.boundingBox()]);
  expect(configureBox!.x).toBeLessThan(addBox!.x);
  await configure.hover();
  await expect(page.getByRole("tooltip", { name: "Configure" })).toBeVisible();
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

  await page.getByRole("button", { name, exact: true }).click();
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
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
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

test("relationship inputs keep linked chips and the record search inside one field", async ({ page, companyId }) => {
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
  await expect(field).not.toContainText("Link a record");
  const [chipBox, comboboxBox] = await Promise.all([chip.boundingBox(), combobox.boundingBox()]);
  expect(Math.abs(chipBox!.y + chipBox!.height / 2 - (comboboxBox!.y + comboboxBox!.height / 2))).toBeLessThan(4);
  await field.getByRole("button", { name: "Unlink Example organization", exact: false }).click();
  await expect(chip).toHaveCount(0);
  await expect(field).toContainText("Link a record");
});

test("record tables edit cells in place, open linked chips and offer row actions", async ({ page, companyId }) => {
  test.setTimeout(180000);
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

  await row.getByRole("button", { name: "Open Example organization", exact: true }).click();
  const organization = page.getByRole("dialog", { name: "Organization", exact: true });
  await expect(organization.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Example organization");
  await organization.getByRole("button", { name: "Close", exact: true }).click();
  await expect(organization).not.toBeVisible();

  const actions = row.locator("[data-record-row-actions]");
  await expect(actions).toHaveCSS("opacity", "0");
  await row.getByRole("button", { name: `Open details for ${name}`, exact: true }).focus();
  await expect(actions).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue(name);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await row.hover();
  await row.getByRole("button", { name: `More actions for ${name}`, exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Open page", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
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
  const editor = page.locator('[data-slot="popover-content"]');
  await editor.getByRole("textbox", { name: "Price", exact: false }).fill("250");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(row).toContainText("250");
  await expect(drawer).not.toBeVisible();
});
