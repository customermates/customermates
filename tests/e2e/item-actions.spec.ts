import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { presetId } from "../../features/records/crm-preset";
import { expect, test } from "./fixtures";
import {
  expectTriggerVisuallyHidden,
  FINE_HOVER,
  itemMenuLabels,
  openItemContextMenu,
  openItemMenu,
  usesTouch,
} from "./item-actions";
import { recordItem } from "./record-rows";
import { collectErrors, openSidebar, sidebarItem } from "./sidebar";

async function createRecord(page: Page, companyId: string) {
  const name = `Menu pattern ${randomUUID().slice(0, 8)}`;
  await page.goto(`/en/records/${presetId(companyId, "organization")}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.waitForLoadState("networkidle");
  return name;
}

test.describe("item menus on a fine pointer", () => {
  test.skip(() => usesTouch(), "Right-click and the hover trigger belong to fine pointers; touch is covered below");

  test("right-click on a record row opens the same items as its More actions trigger", async ({ page, companyId }) => {
    const errors = collectErrors(page);
    const name = await createRecord(page, companyId);
    const row = recordItem(page, name);
    const more = row.getByRole("button", { name: `More actions for ${name}`, exact: true });
    const moreSurface = row.locator("[data-record-row-actions]");

    await page.mouse.move(0, 0);
    await expect(moreSurface).toHaveCSS("opacity", "0");
    await row.hover();
    await expect(moreSurface).toHaveCSS("opacity", "1");
    const fromTrigger = await itemMenuLabels(page, await openItemMenu(page, more));
    expect(fromTrigger).toEqual(["Open in new tab", "Open details", "Delete"]);

    const fromRightClick = await itemMenuLabels(page, await openItemContextMenu(page, row));
    expect(fromRightClick).toEqual(fromTrigger);

    await row.getByRole("link", { name, exact: true }).focus();
    await page.keyboard.press("Shift+F10");
    const fromKeyboard = page.getByRole("menu");
    await expect(fromKeyboard.getByRole("menuitem").first()).toBeFocused();
    expect(await itemMenuLabels(page, fromKeyboard)).toEqual(fromTrigger);

    const opened = await openItemContextMenu(page, row);
    await expect(opened.getByRole("menuitem", { name: "Open in new tab", exact: true })).toHaveAttribute(
      "target",
      "_blank",
    );
    await expect(opened.getByRole("menuitem", { name: "Open in new tab", exact: true })).toHaveAttribute(
      "href",
      /^\/en\/records\/[^/]+\/[^/]+$/,
    );
    await opened.getByRole("menuitem", { name: "Open details", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("textbox", { name: "Name", exact: false })).toHaveValue(name);
    expect(errors).toEqual([]);
  });

  test("right-click on a sidebar item opens the same items as its options trigger", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/en/dashboard");
    await page.waitForLoadState("networkidle");
    await openSidebar(page);
    const item = sidebarItem(page, "Contacts");
    const options = item.getByRole("button", { name: "Options for Contacts", exact: true });

    await page.mouse.move(0, 0);
    await expect(options).toHaveCSS("opacity", "0");
    await item.hover();
    await expect(options).toHaveCSS("opacity", "1");
    const fromTrigger = await itemMenuLabels(page, await openItemMenu(page, options));
    expect(fromTrigger).toEqual(["Open in new tab", "Move up", "Move down", "Move to section", "Hide from sidebar"]);

    const fromRightClick = await itemMenuLabels(page, await openItemContextMenu(page, item));
    expect(fromRightClick).toEqual(fromTrigger);
    expect(errors).toEqual([]);
  });
});

test.describe("item menus on touch", () => {
  test.skip(() => !usesTouch(), "Touch long press replaces the visible trigger only on touch devices");

  test("sidebar items, record rows and view chips show no trigger and still open their menu", async ({
    page,
    companyId,
  }) => {
    const errors = collectErrors(page);
    await page.goto("/en/dashboard");
    const media = await page.evaluate(
      (queries) => Object.fromEntries(queries.map((query) => [query, window.matchMedia(query).matches])),
      [FINE_HOVER, "(pointer: coarse)", "(hover: none)", "(any-pointer: coarse)"],
    );
    test.info().annotations.push({ type: "media", description: JSON.stringify(media) });
    expect(media[FINE_HOVER]).toBe(false);

    const name = await createRecord(page, companyId);
    const row = recordItem(page, name);
    await expectTriggerVisuallyHidden(row.getByRole("button", { name: `More actions for ${name}`, exact: true }));
    const rowMenu = await openItemContextMenu(page, row);
    expect(await itemMenuLabels(page, rowMenu)).toEqual(["Open in new tab", "Open details", "Delete"]);

    const chip = page.locator("[data-view-chip]").first();
    await expect(chip).toBeVisible();
    await expect(chip.locator("button")).toHaveCount(0);
    await expect(page.locator("[data-data-view-rail] [data-item-actions-trigger]")).toHaveCount(0);
    const chipMenu = await openItemContextMenu(page, chip);
    const chipLabels = await itemMenuLabels(page, chipMenu);
    expect(chipLabels[0]).toBe("Open in new tab");
    expect(chipLabels).toContain("Copy link");

    await page.goto("/en/dashboard");
    await page.waitForLoadState("networkidle");
    await openSidebar(page);
    const item = sidebarItem(page, "Contacts");
    await expectTriggerVisuallyHidden(item.getByRole("button", { name: "Options for Contacts", exact: true }));
    const itemMenu = await openItemContextMenu(page, item);
    expect(await itemMenuLabels(page, itemMenu)).toEqual([
      "Open in new tab",
      "Move up",
      "Move down",
      "Move to section",
      "Hide from sidebar",
    ]);
    expect(errors).toEqual([]);
  });
});
