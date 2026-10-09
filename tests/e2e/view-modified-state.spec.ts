import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("keeps filter changes temporary until saved to the view, resets them and keeps them for the browser session", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const typeId = presetId(companyId, "deal");
  const members = await database.query(
    'SELECT id FROM "User" WHERE "companyId"=$1',
    [companyId],
  );
  const member: string = members.rows[0].id;
  const storedFilters = async () =>
    (
      await database.query(
        'SELECT filters FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2',
        [companyId, `records:${typeId}`],
      )
    ).rows[0]?.filters ?? [];
  const all = page.locator("#global-data-views-all");
  const reset = page.locator("#records-filter-reset");
  const save = page.locator("#records-filter-save");
  const applyAssignee = async () => {
    await page.locator("#records-filter").click();
    await page.locator('[data-palette-field="system:assignedTo"]').click();
    await page.locator(`[data-palette-value="${member}"]`).click();
    await page.locator("#filter-palette-back").click();
  };

  await page.goto(`/en/records/${typeId}`);
  await expect(all).toHaveAttribute("aria-current", "page");
  await expect(all).not.toHaveAttribute("data-view-modified");

  await applyAssignee();
  await expect(all).toHaveAttribute("data-view-modified", "");
  await expect(save).toBeVisible();
  await reset.click();
  await expect(all).not.toHaveAttribute("data-view-modified");
  await expect(reset).toHaveCount(0);
  await expect(save).toHaveCount(0);
  await expect(page.locator("[data-palette-active-filters]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL((url) => !url.searchParams.has("filters"));
  expect(await storedFilters()).toEqual([]);

  await applyAssignee();
  await page.keyboard.press("Escape");
  await expect(all).toHaveAttribute("data-view-modified", "");
  const sidebarLink = (name: string) =>
    page
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: new RegExp(`^${name}$`) });
  if (!(await sidebarLink("Contacts").isVisible()))
    await page.locator("#sidebar-trigger").click();
  await sidebarLink("Contacts").click();
  await expect(page).toHaveURL(
    new RegExp(`/en/records/${presetId(companyId, "contact")}(?:\\?.*)?$`),
  );
  if (!(await sidebarLink("Deals").isVisible()))
    await page.locator("#sidebar-trigger").click();
  await sidebarLink("Deals").click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}(?:\\?.*)?$`));
  await expect(all).toHaveAttribute("data-view-modified", "");
  await expect(page).toHaveURL((url) => url.searchParams.has("filters"));
  await page.reload();
  await expect(all).toHaveAttribute("data-view-modified", "");
  expect(await storedFilters()).toEqual([]);

  const otherSession = await page.context().newPage();
  await otherSession.goto(`/en/records/${typeId}`);
  await expect(otherSession.locator("#global-data-views-all")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    otherSession.locator("#global-data-views-all"),
  ).not.toHaveAttribute("data-view-modified");
  await otherSession.close();

  await page.locator("#records-filter").click();
  await save.click();
  await expect(all).not.toHaveAttribute("data-view-modified");
  await expect(save).toHaveCount(0);
  await expect
    .poll(storedFilters)
    .toEqual([{ field: "system:assignedTo", operator: "in", value: [member] }]);
  await page.screenshot({
    path: testInfo.outputPath("view-saved.png"),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");

  const savedSession = await page.context().newPage();
  await savedSession.goto(`/en/records/${typeId}`);
  await expect(savedSession.locator("#global-data-views-all")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    savedSession.locator("#global-data-views-all"),
  ).not.toHaveAttribute("data-view-modified");
  await savedSession.locator("#records-filter").click();
  await expect(
    savedSession.locator("[data-palette-active-filters]"),
  ).toBeVisible();
  await savedSession.close();
  expect(errors).toEqual([]);
});
