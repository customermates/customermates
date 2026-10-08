import type { Page } from "@playwright/test";

import { expect, isAppConsoleError, isBenignPageError } from "./fixtures";

export function collectErrors(page: Page, ignoredResourceOrigins: readonly string[] = []) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    const source = message.location().url;
    if (isAppConsoleError(message) && !ignoredResourceOrigins.some((origin) => source.startsWith(origin)))
      errors.push(message.text());
  });
  return errors;
}

export async function openSidebar(page: Page) {
  await page.waitForFunction(() =>
    ["sidebar-trigger", "scroll-container"].every((id) => {
      const element = document.getElementById(id);
      return element !== null && Object.keys(element).some((key) => key.startsWith("__reactProps"));
    }),
  );
  await page.waitForFunction(() => !document.querySelector('[data-mobile="true"][data-state="closed"]'));
  if (!(await page.locator("#nav-workspace-menu").isVisible())) await page.locator("#sidebar-trigger").click();
  await expect(page.locator("#nav-workspace-menu")).toBeVisible();
}

export async function openMenu(page: Page, trigger: "#nav-workspace-menu" | "#nav-personal-menu") {
  await page.waitForLoadState("networkidle");
  await openSidebar(page);
  const menu = page.getByRole("menu");
  await expect(async () => {
    if (!(await menu.isVisible())) await page.locator(trigger).click();
    await expect(menu).toBeVisible({ timeout: 1000 });
    await expect(page.locator(trigger)).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass();
  return menu;
}

export async function openCustomize(page: Page) {
  const menu = await openMenu(page, "#nav-personal-menu");
  await menu.getByRole("menuitem", { name: "Customize sidebar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Customize sidebar" });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function sidebarOrder(page: Page) {
  return page
    .locator("[data-sidebar-section]")
    .evaluateAll((sections) =>
      sections.flatMap((section) => [
        `#${section.getAttribute("data-sidebar-section-label")}`,
        ...[...section.querySelectorAll<HTMLElement>("[data-sidebar-item]")]
          .filter((item) => item.offsetParent !== null)
          .map((item) => item.querySelector("span.truncate")?.textContent?.trim() ?? ""),
      ]),
    );
}

export function sidebarItem(page: Page, label: string) {
  return page.locator("[data-sidebar-item]").filter({ has: page.getByText(label, { exact: true }) });
}

export function sidebarSection(page: Page, label: string) {
  return page.locator(`[data-sidebar-section-label="${label}"]`);
}

export async function itemMenu(page: Page, label: string) {
  const item = sidebarItem(page, label);
  await item.hover();
  await item.getByRole("button", { name: `Options for ${label}`, exact: true }).click();
  return page.getByRole("menu");
}

export async function sectionMenu(page: Page, label: string) {
  const section = sidebarSection(page, label);
  await section.hover();
  await section.getByRole("button", { name: `Options for ${label}`, exact: true }).click();
  return page.getByRole("menu");
}
