import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { test, expect } from "./fixtures";

test("records list header keeps Configure icon-only and left of the primary Add action", async ({ page }) => {
  await page.goto("/en/contacts");
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
