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
  const rail = drawer.locator("#record-header-actions");
  await expect(rail.getByRole("button", { name: "Customize", exact: true })).toBeVisible();
  await expect(rail.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await page.getByRole("button", { name, exact: true }).click();
  const customize = rail.getByRole("button", { name: "Customize", exact: true });
  await expect(customize).toHaveText("");
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
  const field = drawer.locator("[data-relationship-field]").filter({ has: combobox });
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
