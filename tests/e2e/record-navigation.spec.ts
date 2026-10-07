import { presetId } from "../../features/records/crm-preset";
import { followConfigureLink, saveGeneral } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

test("answers the removed fixed-entity routes with not found", async ({ page, companyId }) => {
  for (const path of ["contacts", "organizations", "deals", "services", "tasks"]) {
    const response = await page.goto(`/en/${path}/${presetId(companyId, "contact")}`);
    expect(response?.status(), path).toBe(404);
  }
});

test("uses configured navigation, quick creation, rename-safe routes, and hidden types", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const serviceId = presetId(companyId, "service");
  await page.goto(`/en/records/${serviceId}`);
  const openSidebar = async () => {
    if (!(await page.locator("#nav-add").isVisible())) await page.locator("#sidebar-trigger").click();
    await expect(page.locator("#nav-add")).toBeVisible();
  };
  await openSidebar();
  for (const [key, label] of [
    ["contact", "Contacts"],
    ["organization", "Organizations"],
    ["deal", "Deals"],
    ["service", "Services"],
    ["task", "Tasks"],
  ]) {
    const link = page.locator(`[id="nav-records:${presetId(companyId, key)}"]`);
    await expect(link).toHaveText(label);
    await expect(link).toHaveAttribute("href", `/en/records/${presetId(companyId, key)}`);
  }
  await page.locator("#nav-add").click();
  await page.getByRole("dialog").getByRole("button", { name: "Add Service", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Quick catalog entry");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Quick catalog entry", exact: true })).toBeVisible();
  const saved = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, serviceId],
  );
  expect(saved.rows).toEqual([{ count: 1 }]);
  await openSidebar();
  await page.locator("#nav-add").click();
  await page.getByRole("dialog").getByRole("button", { name: "Create list", exact: true }).click();
  await editor.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
  await editor.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page).toHaveURL(/\/records\/[a-f0-9-]+$/);
  await expect(editor).not.toBeVisible();
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  const navLink = page.locator(`[id="nav-records:${typeId}"]`);
  await openSidebar();
  await expect(navLink).toHaveText("Projects");
  await navLink.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
  await expect(page.locator("#records-add")).toBeVisible();
  await followConfigureLink(page);
  const general = page.getByRole("region", { name: "General", exact: true });
  await general.getByRole("textbox", { name: "Name", exact: false }).first().fill("Engagement");
  await general.getByRole("textbox", { name: "Plural name", exact: true }).fill("Engagements");
  await saveGeneral(page);
  await openSidebar();
  await expect(navLink).toHaveText("Engagements");
  await expect(navLink).toHaveAttribute("href", `/en/records/${typeId}`);
  await navLink.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
  await expect(page.locator("#records-add")).toBeVisible();
  await followConfigureLink(page);
  await general.getByRole("switch", { name: "Show in navigation", exact: true }).uncheck();
  await saveGeneral(page);
  await openSidebar();
  await expect(navLink).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator("#records-add")).toBeVisible();
  await openSidebar();
  await expect(page.locator("#nav-assistant")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await openSidebar();
  await expect(navLink).toHaveCount(0);
  const type = await database.query('SELECT definition FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2', [
    companyId,
    typeId,
  ]);
  expect(type.rows[0].definition).toMatchObject({
    pluralLabel: "Engagements",
    navigationVisible: false,
    archived: false,
  });
  await page.screenshot({
    path: testInfo.outputPath("configured-navigation.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
