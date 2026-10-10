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
  await page.screenshot({ path: testInfo.outputPath("view-modified-light.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("view-modified-dark.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "light" });
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

test("keeps an Activities rail filter temporary with the modified dot, Reset and Save in the views menu", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const typeId = presetId(companyId, "service");
  const name = "Rail filter service";
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const record = await database.query(
    'SELECT "recordId" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3 AND "textValue"=$4',
    [companyId, typeId, presetId(companyId, "service.name"), name],
  );
  await page.goto(`/en/records/${typeId}/${record.rows[0].recordId}`);
  const history = page.locator('main [data-detail-panel="activities"]');
  if (!(await history.isVisible())) await page.getByRole("tab", { name: "Activities", exact: true }).click();
  const all = history.locator("#global-data-views-all");
  await expect(all).toHaveAttribute("aria-current", "page");
  await expect(all).not.toHaveAttribute("data-view-modified");
  const storedFilters = async () =>
    (
      await database.query('SELECT filters FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
        companyId,
        workspace.userId,
        "entity-timeline",
      ])
    ).rows[0]?.filters ?? null;
  const filterMessages = async () => {
    await history.getByRole("button", { name: "Filters", exact: true }).click();
    await page.locator('[data-palette-field="timelineKind"]').click();
    await page.locator('[data-palette-value="messages"]').click();
    await page.locator("#filter-palette-back").click();
    await page.keyboard.press("Escape");
    await expect(all).toHaveAttribute("data-view-modified", "");
  };
  const viewsMenu = async () => {
    await history.locator("#global-data-views-menu").click();
    await expect(page.locator("#global-data-views-save")).toBeVisible();
    await expect(page.locator("#global-data-views-reset")).toBeVisible();
  };

  await filterMessages();
  await viewsMenu();
  await page.locator("#global-data-views-reset").click();
  await expect(all).not.toHaveAttribute("data-view-modified");
  expect(await storedFilters()).toBeNull();

  await filterMessages();
  await viewsMenu();
  await page.locator("#global-data-views-save").click();
  await expect(all).not.toHaveAttribute("data-view-modified");
  await expect
    .poll(storedFilters)
    .toEqual([{ field: "timelineKind", operator: "in", value: ["messages"] }]);
  await history.locator("#global-data-views-menu").click();
  await expect(page.locator("#global-data-views-save")).toHaveCount(0);
  await expect(page.locator("#global-data-views-reset")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("opens an assistant proposal in the modified state and saves it as an update and as a new view", async ({
  page,
  database,
  companyId,
  workspace,
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
  const surfaceKey = `records:${typeId}`;
  const members = await database.query('SELECT id FROM "User" WHERE "companyId"=$1', [companyId]);
  const assignee = { field: "system:assignedTo", operator: "in", value: [members.rows[0].id] };
  const propose = (viewKey: string, proposal: Record<string, unknown>) =>
    page.evaluate(
      ([key, value]) => window.sessionStorage.setItem(key, value),
      [
        `customermates:view-query-draft:${companyId}:${workspace.userId}:${surfaceKey}:${viewKey}`,
        JSON.stringify({ filters: [assignee], proposal: { state: { filters: [assignee] }, ...proposal } }),
      ] as const,
    );
  const all = page.locator("#global-data-views-all");

  await page.goto(`/en/records/${typeId}`);
  await expect(all).toHaveAttribute("aria-current", "page");
  await propose("__all__", { isNew: false });
  await page.reload();
  await expect(all).toHaveAttribute("data-view-modified", "");
  await page.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-save").click();
  await expect(all).not.toHaveAttribute("data-view-modified");
  await expect
    .poll(async () =>
      (
        await database.query('SELECT filters FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
          companyId,
          workspace.userId,
          surfaceKey,
        ])
      ).rows[0]?.filters,
    )
    .toEqual([assignee]);

  await propose("__all__", { isNew: true, name: "Assigned to me" });
  await page.reload();
  const proposed = page.locator("#global-data-views-proposed");
  await expect(proposed).toHaveText(/Assigned to me/);
  await expect(proposed).toHaveAttribute("data-view-modified", "");
  await expect(all).not.toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: testInfo.outputPath("proposal-new-view-light.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("proposal-new-view-dark.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-save").click();
  await expect(page.locator("#global-data-views-proposed")).toHaveCount(0);
  const created = page.locator("#global-data-views").getByRole("link", { name: "Assigned to me", exact: true });
  await expect(created).toHaveAttribute("aria-current", "page");
  await expect(created).not.toHaveAttribute("data-view-modified");
  await expect
    .poll(async () =>
      (
        await database.query(
          'SELECT filters FROM "DataView" WHERE "companyId"=$1 AND "userId"=$2 AND "surfaceKey"=$3 AND name=$4',
          [companyId, workspace.userId, surfaceKey, "Assigned to me"],
        )
      ).rows,
    )
    .toEqual([{ filters: [assignee] }]);
  expect(errors).toEqual([]);
});
