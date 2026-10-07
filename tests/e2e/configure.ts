import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export type ConfigureAddItem = "List" | "Field" | "Calculation" | "Relationship" | "Channels" | "Activity connection";
export type ConfigureSection = "Fields" | "Relationships" | "Activity connections";

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function configureDrawer(page: Page) {
  return page.getByRole("dialog");
}

export function configureTopBar(page: Page) {
  return page.locator("header").first();
}

export async function openConfigure(page: Page, typeId?: string) {
  if (page.url() !== "about:blank") await page.waitForLoadState("networkidle");
  await page.goto(typeId ? `/en/configure?typeId=${typeId}` : "/en/configure");
  await expect(page.locator("[data-configure-page]")).toBeVisible();
  if (typeId) await expect(page.locator("[data-configure-list-pane]")).toBeVisible();
  else await expect(page.locator("[data-configure-graph] [data-configure-node]").first()).toBeAttached();
}

export function configureListCard(page: Page, label: string) {
  return page.locator("[data-configure-graph]").getByRole("button", { name: label, exact: true });
}

export async function backToConfigureGraph(page: Page) {
  await configureTopBar(page).getByRole("link", { name: "Configure", exact: true }).click();
  await expect(page.locator("[data-configure-graph] [data-configure-node]").first()).toBeAttached();
}

export async function selectConfigureList(page: Page, label: string) {
  await expect(page.locator("[data-configure-page]")).toBeVisible();
  if (await page.locator("[data-configure-list-pane]").isVisible()) await backToConfigureGraph(page);
  await configureListCard(page, label).dispatchEvent("click");
  await expect(page.getByRole("heading", { level: 1, name: label, exact: true })).toBeVisible();
}

export async function addFromConfigure(page: Page, item: ConfigureAddItem) {
  await configureTopBar(page).getByRole("button", { name: "Add", exact: true }).click();
  const onGraph = item === "List" && !(await page.locator("[data-configure-list-pane]").isVisible());
  if (!onGraph) await page.getByRole("menuitem", { name: item, exact: true }).click();
  await expect(configureDrawer(page)).toBeVisible();
}

export async function openListAction(page: Page, item: "Shared defaults" | "Archive list" | "Restore list") {
  await configureTopBar(page).getByRole("button", { name: "List actions", exact: true }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
  await expect(configureDrawer(page)).toBeVisible();
}

export function configureRow(page: Page, section: ConfigureSection, label: string) {
  return page
    .getByRole("region", { name: section, exact: true })
    .getByRole("button", { name: new RegExp(`^${escapePattern(label)}(?:\\s|$)`) });
}

export async function openDrawerTab(page: Page, name: string) {
  const tab = configureDrawer(page).getByRole("tab", { name, exact: true });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

export async function openConfigureTab(page: Page, section: ConfigureSection | "General") {
  const tab = page.locator("[data-configure-list-pane]").getByRole("tab", { name: section, exact: true });
  await expect(async () => {
    if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1000 });
  }).toPass();
}

export async function openConfigureRow(page: Page, section: ConfigureSection, label: string) {
  await openConfigureTab(page, section);
  await configureRow(page, section, label).click();
  await expect(configureDrawer(page)).toBeVisible();
}

export async function configureRevision(page: Page) {
  return Number(await page.locator("[data-configure-page]").getAttribute("data-configure-revision"));
}

export async function expectConfigureRevisionAfter(page: Page, revision: number) {
  await expect
    .poll(async () => configureRevision(page), { message: "the page shows the saved configuration revision" })
    .toBeGreaterThan(revision);
}

export async function saveDrawer(page: Page) {
  const revision = await configureRevision(page);
  const dialog = configureDrawer(page);
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(dialog.getByRole("status").last()).toContainText("Ready to apply");
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  await expectConfigureRevisionAfter(page, revision);
}

export async function saveGeneral(page: Page) {
  const revision = await configureRevision(page);
  const topBar = configureTopBar(page);
  const save = topBar.getByRole("button", { name: "Save", exact: true });
  const reset = topBar.getByRole("button", { name: "Reset", exact: true });
  const ready = page.locator("[data-configure-list-pane]").getByRole("status").filter({ hasText: "Ready to apply" });
  await save.click();
  await expect
    .poll(async () => ((await ready.isVisible()) && (await save.isEnabled())) || !(await reset.isVisible()))
    .toBe(true);
  if (await reset.isVisible()) await save.click();
  await expect(reset).toHaveCount(0);
  await expectConfigureRevisionAfter(page, revision);
}

export async function setShowArchived(page: Page, visible: boolean) {
  await expect(page.locator("[data-configure-graph] [data-configure-node]").first()).toBeAttached();
  await configureTopBar(page).getByRole("button", { name: "List actions", exact: true }).click();
  const item = page.getByRole("menuitem", { name: visible ? "Show archived" : "Hide archived", exact: true });
  await expect(item.or(page.getByRole("menuitem", { name: visible ? "Hide archived" : "Show archived" }))).toBeVisible();
  if (await item.isVisible()) await item.click();
  else await page.keyboard.press("Escape");
}

export async function setShowArchivedParts(page: Page, visible: boolean) {
  const pane = page.locator("[data-configure-list-pane]");
  const toggle = pane.getByRole("button", { name: visible ? "Show archived" : "Hide archived", exact: true });
  const done = pane.getByRole("button", { name: visible ? "Hide archived" : "Show archived", exact: true });
  await expect(toggle.or(done)).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
  await expect(done).toBeVisible();
}

export async function createConfiguredList(page: Page, name: string, { channels = false } = {}) {
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const dialog = configureDrawer(page);
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill(name);
  await expect(dialog.getByRole("switch", { name: "Enable channels", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  if (!typeId) throw new Error("The created list route did not contain its identity");
  if (channels) {
    await addChannelsField(page, typeId);
    await page.goto(`/en/records/${typeId}`);
  }
  return typeId;
}

export async function addChannelsField(page: Page, typeId: string) {
  await openConfigure(page, typeId);
  await addFromConfigure(page, "Channels");
  const dialog = configureDrawer(page);
  await expect(dialog.getByRole("combobox", { name: "Value type", exact: true })).toContainText("Channels");
  await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveCount(0);
  await saveDrawer(page);
  await openConfigureTab(page, "Fields");
  await expect(configureRow(page, "Fields", "Channels")).toBeVisible();
}

export async function followConfigureLink(page: Page) {
  await page.getByRole("link", { name: "Configure", exact: true }).and(page.locator("#records-configure")).click();
  await expect(page).toHaveURL(/\/en\/configure\?typeId=[a-f0-9-]+$/);
  await expect(page.locator("[data-configure-list-pane]")).toBeVisible();
}
