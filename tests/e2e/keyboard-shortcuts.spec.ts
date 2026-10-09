import type { Client } from "pg";
import type { Page } from "@playwright/test";

import { expect, isAppConsoleError, isBenignPageError, test } from "./fixtures";

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message) && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) errors.push(message.text());
  });
  return errors;
}

async function openApp(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const hydrated = (element: HTMLElement | null) =>
      element !== null && Object.keys(element).some((key) => key.startsWith("__reactProps"));
    return (
      hydrated(document.getElementById("sidebar-trigger")) && hydrated(document.getElementById("scroll-container"))
    );
  });
}

async function modifierKey(page: Page) {
  const mac = await page.evaluate(() => {
    const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    return /mac|iphone|ipad|ipod/i.test(data?.platform || navigator.platform || navigator.userAgent);
  });
  return mac ? { key: "Meta", label: "⌘" } : { key: "Control", label: "Ctrl+" };
}

async function storedPreference(database: Client, userId: string) {
  const result = await database.query<{ settings: unknown }>(
    'SELECT settings FROM "P13n" WHERE "userId"=$1 AND "p13nId"=\'keyboard\'',
    [userId],
  );
  return result.rows[0]?.settings ?? null;
}

const addPicker = (page: Page) => page.getByRole("dialog", { name: "Create new…" });
const viewPicker = (page: Page) => page.getByRole("dialog", { name: "Switch view" });
const shortcutsDialog = (page: Page) => page.getByRole("dialog", { name: "Keyboard shortcuts" });

test("global shortcuts, G navigation, the shortcuts dialog and the single-key preference", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop keyboard journey");
  const errors = collectErrors(page);
  await openApp(page, "/en/dashboard");
  const mod = await modifierKey(page);

  await expect(page.locator("#nav-search [data-shortcut=search]")).toHaveText(`${mod.label}K`);
  await expect(page.locator("#nav-add [data-shortcut=add]")).toHaveText("C");

  await page.keyboard.press(`${mod.key}+k`);
  await expect(page.locator("#global-search-input")).toBeVisible();
  await expect(page.locator('[cmdk-item] [data-shortcut="goDashboard"]')).toContainText("then");
  await expect(page.locator('[cmdk-item] [data-shortcut="add"]')).toHaveText("C");
  await page.keyboard.press("c");
  await expect(addPicker(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#global-search-input")).toBeHidden();

  await page.keyboard.press("c");
  await expect(addPicker(page)).toBeVisible();
  await page.keyboard.press("g");
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.keyboard.press("Escape");
  await expect(addPicker(page)).toBeHidden();

  await page.keyboard.press("g");
  await page.keyboard.press("1");
  await expect(page).toHaveURL(/\/records\/[^/]+$/);
  const firstList = page.url();
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("f");
  const typingField = page.locator("#filter-palette-search").getByRole("combobox");
  await expect(typingField).toBeFocused();
  await page.keyboard.type("gd c/v");
  await expect(typingField).toHaveValue("gd c/v");
  await expect(page).toHaveURL(firstList);
  await expect(addPicker(page)).toHaveCount(0);
  await expect(viewPicker(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#filter-palette-search")).toHaveCount(0);

  await page.keyboard.press("v");
  await expect(viewPicker(page)).toBeVisible();
  await page.keyboard.type("All");
  await page.keyboard.press("Enter");
  await expect(viewPicker(page)).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).pathname).toBe(new URL(firstList).pathname);

  await page.keyboard.press(`${mod.key}+k`);
  await expect(page.locator('[cmdk-item][data-value^="palette-view-"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("/");
  await expect(page.locator("#global-search-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.keyboard.press("g");
  await page.keyboard.press("d");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.keyboard.press("g");
  await page.waitForTimeout(1200);
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.keyboard.press("g");
  await page.keyboard.press("s");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("?");
  const dialog = shortcutsDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-shortcut-row=search] [data-shortcut=search]")).toHaveText(`${mod.label}K`);
  await expect(dialog.locator("[data-shortcut-row=goDashboard] kbd")).toHaveText(["G", "D"]);
  await expect(dialog.locator("[data-shortcut-row=goDashboard]")).toContainText("then");
  await expect(dialog.locator("[data-shortcut-row=goList] kbd")).toHaveText(["G", "1–9"]);
  await expect(dialog.locator("[data-shortcut-row=save] kbd")).toHaveText(mod.key === "Meta" ? "⌘↵" : "Ctrl+Enter");
  await dialog.getByRole("searchbox", { name: "Search shortcuts" }).fill("view");
  await expect(dialog.locator("[data-shortcut-row]")).toHaveCount(1);
  await expect(dialog.locator("[data-shortcut-row=switchView] kbd")).toHaveText("V");
  await page.keyboard.press("c");
  await expect(addPicker(page)).toHaveCount(0);

  await dialog.getByRole("switch", { name: "Single-key shortcuts" }).click();
  await expect.poll(() => storedPreference(database, workspace.userId)).toEqual({ singleKeyShortcuts: false });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await expect(page.locator("#nav-add [data-shortcut=add]")).toHaveCount(0);
  await page.keyboard.press("c");
  await page.keyboard.press("g");
  await page.keyboard.press("d");
  await page.keyboard.press("?");
  await expect(addPicker(page)).toHaveCount(0);
  await expect(shortcutsDialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.keyboard.press(`${mod.key}+k`);
  await expect(page.locator("#global-search-input")).toBeVisible();
  await page.keyboard.press("Escape");

  await openApp(page, page.url());
  await page.locator("#nav-personal-menu").click();
  await page.getByRole("menuitem", { name: "Keyboard shortcuts" }).click();
  await expect(shortcutsDialog(page)).toBeVisible();
  const toggle = shortcutsDialog(page).getByRole("switch", {
    name: "Single-key shortcuts",
  });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect.poll(() => storedPreference(database, workspace.userId)).toEqual({ singleKeyShortcuts: true });
  await page.keyboard.press("Escape");

  await page.keyboard.press("c");
  await expect(addPicker(page)).toBeVisible();
  await page.keyboard.press("Escape");

  expect(errors).toEqual([]);
});

test("Cmd/Ctrl+\\ toggles the sidebar and the sidebar trigger tooltip names it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop keyboard journey");
  await openApp(page, "/en/dashboard");
  const mod = await modifierKey(page);
  const sidebar = page.locator('[data-slot="sidebar"][data-state]').first();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await page.keyboard.press(`${mod.key}+Backslash`);
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.locator("#sidebar-trigger").hover();
  await expect(page.getByRole("tooltip")).toContainText(`${mod.label}\\`);
  await page.keyboard.press(`${mod.key}+Backslash`);
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
});

test("touch layouts show no key hints and keys do not break the page", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Touch journey");
  const errors = collectErrors(page);
  await openApp(page, "/en/dashboard");
  await page.locator("#sidebar-trigger").click();
  await expect(page.locator("#nav-add")).toBeVisible();
  await expect(page.locator("#nav-search [data-shortcut=search]")).toBeHidden();
  await expect(page.locator("#nav-add [data-shortcut=add]")).toBeHidden();
  await page.locator("#nav-add").click();
  await expect(addPicker(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("c");
  await page.keyboard.press("?");
  await expect(page.locator("#sidebar-trigger")).toBeVisible();
  expect(errors).toEqual([]);
});
