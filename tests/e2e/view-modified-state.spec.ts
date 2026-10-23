import { test, expect, collectPageErrors } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { openSidebar } from "./sidebar";
import { submitViewEditor } from "./view-changes";

test("keeps filter changes on All temporary until saved as a view, resets them and keeps them for the browser session", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
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
  const allView = page.locator("#global-data-views-all");
  const unsavedWithoutView = page.locator("#global-data-views-all[data-view-modified]");
  const withoutView = async (target = page) => {
    await expect(target.locator("#global-data-views-new")).toBeVisible();
    await expect(target.locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
    await expect(target.locator("#global-data-views-all[data-view-modified]")).toHaveCount(0);
  };
  const cancel = page.locator("#records-filter-cancel");
  const save = page.locator("#records-filter-save");
  const applyAssignee = async () => {
    await page.locator("#records-filter").click();
    await page.locator('[data-palette-field="system:assignedTo"]').click();
    await page.locator(`[data-palette-value="${member}"]`).click();
    await page.locator("#filter-palette-back").click();
  };

  await page.goto(`/en/records/${typeId}`);
  await withoutView();

  await applyAssignee();
  await expect(allView).toHaveAttribute("data-view-modified", "");
  await expect(allView.locator('span[aria-hidden="true"]')).toBeInViewport({ ratio: 1 });
  await expect(save).toBeVisible();
  const filterBar = page.locator('[role="dialog"] [data-slot="unsaved-changes-bar"]');
  await expect(filterBar).toBeVisible();
  await expect(filterBar.getByRole("button", { name: "Save as view", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(filterBar.getByRole("button", { name: "Cancel", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[role="dialog"] [data-view-changes-notice]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("view-modified-light.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: testInfo.outputPath("view-modified-dark.png"), animations: "disabled" });
  await page.emulateMedia({ colorScheme: "light" });
  await cancel.click();
  await expect(unsavedWithoutView).toHaveCount(0);
  await expect(cancel).toHaveCount(0);
  await expect(save).toHaveCount(0);
  await expect(page.locator("[data-palette-active-filters]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL((url) => !url.searchParams.has("filters"));
  expect(await storedFilters()).toEqual([]);

  await applyAssignee();
  await page.keyboard.press("Escape");
  await expect(allView).toHaveAttribute("data-view-modified", "");
  const sidebarLink = (name: string) =>
    page
      .locator('[data-sidebar="menu-button"]')
      .filter({ hasText: new RegExp(`^${name}$`) });
  await openSidebar(page);
  await sidebarLink("Contacts").click();
  await expect(page).toHaveURL(
    new RegExp(`/en/records/${presetId(companyId, "contact")}(?:\\?.*)?$`),
  );
  await openSidebar(page);
  await sidebarLink("Deals").click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}(?:\\?.*)?$`));
  await expect(allView).toHaveAttribute("data-view-modified", "");
  await expect(page).toHaveURL((url) => url.searchParams.has("filters"));
  await page.reload();
  await expect(allView).toHaveAttribute("data-view-modified", "");
  expect(await storedFilters()).toEqual([]);

  const otherSession = await page.context().newPage();
  await otherSession.goto(`/en/records/${typeId}`);
  await withoutView(otherSession);
  await otherSession.close();

  await page.locator("#records-filter").click();
  await save.click();
  await expect(save).toHaveCount(0);
  const viewName = await submitViewEditor(page);
  await expect(unsavedWithoutView).toHaveCount(0);
  await expect(page.locator("#global-data-views [data-view-modified]")).toHaveCount(0);
  const createdView = async () =>
    (
      await database.query('SELECT id, filters FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey"=$2 AND name=$3', [
        companyId,
        `records:${typeId}`,
        viewName,
      ])
    ).rows;
  await expect
    .poll(async () => (await createdView()).map((row) => row.filters))
    .toEqual([[{ field: "system:assignedTo", operator: "in", value: [member] }]]);
  expect(await storedFilters()).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("view-saved.png"),
    animations: "disabled",
  });

  const savedSession = await page.context().newPage();
  await savedSession.goto(`/en/records/${typeId}?view=${(await createdView())[0].id}`);
  await expect(
    savedSession.locator("#global-data-views").getByRole("link", { name: viewName, exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await savedSession.locator("#records-filter").click();
  await expect(
    savedSession.locator("[data-palette-active-filters]"),
  ).toBeVisible();
  await savedSession.keyboard.press("Escape");
  await savedSession.locator("#global-data-views-all").click();
  await withoutView(savedSession);
  await savedSession.locator("#records-filter").click();
  await expect(savedSession.locator("[data-palette-active-filters]")).toHaveCount(0);
  await savedSession.close();
  expect(errors).toEqual([]);
});

test("keeps an Activities rail filter temporary with the modified dot on the All tab, Reset and Save as view in the views menu", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
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
  const menu = history.locator("#global-data-views-menu");
  const allView = history.locator("#global-data-views-all");
  const unsavedWithoutView = history.locator("#global-data-views-all[data-view-modified]");
  await expect(history.locator("#global-data-views-new")).toBeVisible();
  await expect(allView).toHaveAttribute("aria-current", "page");
  await expect(unsavedWithoutView).toHaveCount(0);
  await expect(menu).not.toHaveAttribute("data-view-modified");
  const storedFilters = async () =>
    (
      await database.query('SELECT filters FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
        companyId,
        workspace.userId,
        "entity-timeline",
      ])
    ).rows[0]?.filters ?? [];
  const filterMessages = async () => {
    await history.getByRole("button", { name: "Filters", exact: true }).click();
    await page.locator('[data-palette-field="timelineKind"]').click();
    await page.locator('[data-palette-value="messages"]').click();
    await page.locator("#filter-palette-back").click();
    await page.keyboard.press("Escape");
    await expect(allView).toHaveAttribute("data-view-modified", "");
    await expect(menu).not.toHaveAttribute("data-view-modified");
  };
  const viewsMenu = async () => {
    await menu.click();
    await expect(page.locator("#global-data-views-save-as")).toBeVisible();
    await expect(page.locator("#global-data-views-reset")).toBeVisible();
    await expect(page.locator("#global-data-views-save")).toHaveCount(0);
  };

  await filterMessages();
  await viewsMenu();
  await page.locator("#global-data-views-reset").click();
  await expect(unsavedWithoutView).toHaveCount(0);
  expect(await storedFilters()).toEqual([]);

  await filterMessages();
  await viewsMenu();
  await page.locator("#global-data-views-save-as").click();
  const viewName = await submitViewEditor(page, "Messages only", history);
  await expect(history.locator("#global-data-views [data-view-modified]")).toHaveCount(0);
  await expect
    .poll(async () =>
      (
        await database.query(
          'SELECT filters FROM "DataView" WHERE "companyId"=$1 AND "userId"=$2 AND "surfaceKey"=$3 AND name=$4',
          [companyId, workspace.userId, "entity-timeline", viewName],
        )
      ).rows,
    )
    .toEqual([{ filters: [{ field: "timelineKind", operator: "in", value: ["messages"] }] }]);
  expect(await storedFilters()).toEqual([]);
  await menu.click();
  await expect(page.locator("#global-data-views-save")).toHaveCount(0);
  await expect(page.locator("#global-data-views-save-as")).toHaveCount(0);
  await expect(page.locator("#global-data-views-reset")).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("opens an assistant proposal in the modified state and saves All layout, offers Save as view for All filters and saves a new view", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "deal");
  const surfaceKey = `records:${typeId}`;
  const members = await database.query('SELECT id FROM "User" WHERE "companyId"=$1', [companyId]);
  const assignee = { field: "system:assignedTo", operator: "in", value: [members.rows[0].id] };
  const propose = (
    viewKey: string,
    proposal: Record<string, unknown>,
    state: Record<string, unknown> = { filters: [assignee] },
  ) =>
    page.evaluate(
      ([key, value]) => window.sessionStorage.setItem(key, value),
      [
        `customermates:view-query-draft:${companyId}:${workspace.userId}:${surfaceKey}:${viewKey}`,
        JSON.stringify({ ...(state.filters ? { filters: state.filters } : {}), proposal: { state, ...proposal } }),
      ] as const,
    );
  const viewsMenu = page.locator("#global-data-views-menu");
  const allView = page.locator("#global-data-views-all");
  const activeView = page.locator('#global-data-views [data-focus-target^="view:"][aria-current="page"]');
  const storedAll = async () =>
    (
      await database.query(
        'SELECT filters, pagination FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
        [companyId, workspace.userId, surfaceKey],
      )
    ).rows[0];

  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator("#global-data-views-new")).toBeVisible();
  await expect(allView).toHaveAttribute("aria-current", "page");
  await page.waitForLoadState("networkidle");
  await propose("__all__", { isNew: false }, { pageSize: 5 });
  await page.reload();
  await expect(allView).toHaveAttribute("data-view-modified", "");
  await expect(viewsMenu).not.toHaveAttribute("data-view-modified");
  await viewsMenu.click();
  await expect(page.locator("#global-data-views-save-as")).toHaveCount(0);
  await page.locator("#global-data-views-save").click();
  await expect(page.locator("#global-data-views-all[data-view-modified]")).toHaveCount(0);
  await expect.poll(async () => (await storedAll())?.pagination).toMatchObject({ pageSize: 5 });
  expect((await storedAll())?.filters ?? []).toEqual([]);

  await page.waitForLoadState("networkidle");
  await propose("__all__", { isNew: true });
  await page.reload();
  await expect(allView).toHaveAttribute("data-view-modified", "");
  await expect(allView).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#global-data-views-proposed")).toHaveCount(0);
  await viewsMenu.click();
  await expect(page.locator("#global-data-views-save-as")).toBeVisible();
  await expect(page.locator("#global-data-views-save")).toHaveCount(0);
  await page.locator("#global-data-views-reset").click();
  await expect(page.locator("#global-data-views-all[data-view-modified]")).toHaveCount(0);
  expect((await storedAll())?.filters ?? []).toEqual([]);

  await page.waitForLoadState("networkidle");
  await propose("__all__", { isNew: true, name: "Assigned to me" });
  await page.reload();
  const proposed = page.locator("#global-data-views-proposed");
  await expect(proposed).toHaveText(/Assigned to me/);
  await expect(proposed).toHaveAttribute("data-view-modified", "");
  await expect(proposed.locator('span[aria-hidden="true"]')).toBeInViewport({ ratio: 1 });
  await expect(proposed).toHaveAttribute("aria-current", "page");
  await expect(activeView).toHaveCount(0);
  await expect(page.locator("#global-data-views-all[data-view-modified]")).toHaveCount(0);
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

  const createdId = (
    await database.query('SELECT id FROM "DataView" WHERE "companyId"=$1 AND "userId"=$2 AND "surfaceKey"=$3 AND name=$4', [
      companyId,
      workspace.userId,
      surfaceKey,
      "Assigned to me",
    ])
  ).rows[0].id;
  await page.reload();
  await expect(page.locator(`[data-focus-target="view:${createdId}"]`)).toHaveAttribute("aria-current", "page");
  await page.waitForLoadState("networkidle");
  await propose(createdId, { isNew: false, name: "Mine" });
  await page.reload();
  const renamed = page.locator(`[data-focus-target="view:${createdId}"]`);
  await expect(renamed).toHaveText(/Assigned to me/);
  await expect(renamed).toHaveAttribute("data-view-modified", "");
  await expect(renamed.locator('span[aria-hidden="true"]')).toBeInViewport({ ratio: 1 });
  await page.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-save").click();
  await expect(renamed).toHaveText(/^Mine$/);
  await expect(renamed).not.toHaveAttribute("data-view-modified");
  await expect
    .poll(async () => (await database.query('SELECT name FROM "DataView" WHERE id=$1', [createdId])).rows[0]?.name)
    .toBe("Mine");
  expect(errors).toEqual([]);
});

test("keeps appearance changes temporary with the shared bottom save bar and the existing filter actions", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "deal");
  const stage = presetId(companyId, "deal.stage");
  const storedGrouping = async () =>
    (
      await database.query('SELECT grouping FROM "P13n" WHERE "companyId"=$1 AND "p13nId"=$2', [
        companyId,
        `records:${typeId}`,
      ])
    ).rows[0]?.grouping ?? null;
  const allView = page.locator("#global-data-views-all");
  const unsavedWithoutView = page.locator("#global-data-views-all[data-view-modified]");
  const withoutView = async (target = page) => {
    await expect(target.locator("#global-data-views-new")).toBeVisible();
    await expect(target.locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
    await expect(target.locator("#global-data-views-all[data-view-modified]")).toHaveCount(0);
  };
  const groupBy = page.getByRole("combobox", { name: "Group By", exact: true });
  const appearanceSave = page.locator("#records-display-options-view-save");
  const appearanceCancel = page.locator("#records-display-options-view-cancel");
  const appearanceBar = page.locator('[role="dialog"] [data-slot="unsaved-changes-bar"]');
  const filterSave = page.locator("#records-filter-save");
  const filterCancel = page.locator("#records-filter-cancel");
  const openAppearance = async () => {
    await page.locator("#records-display-options").click();
    await expect(groupBy).toBeVisible();
  };
  const closeAppearance = async () => {
    if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
    else await page.keyboard.press("Escape");
    await expect(groupBy).not.toBeVisible();
  };
  const groupByStage = async () => {
    await openAppearance();
    await groupBy.click();
    await page.getByRole("option", { name: "Stage", exact: true }).click();
    await expect(groupBy).toContainText("Stage");
  };

  await page.goto(`/en/records/${typeId}`);
  await withoutView();
  await openAppearance();
  await expect(appearanceSave).toHaveCount(0);
  await expect(appearanceBar).toHaveCount(0);
  await closeAppearance();

  await groupByStage();
  await expect(allView).toHaveAttribute("data-view-modified", "");
  await expect(appearanceSave).toBeVisible();
  await expect(appearanceCancel).toBeVisible();
  await expect(appearanceBar).toBeVisible();
  await expect(page.locator('[role="dialog"] [data-view-changes-notice]')).toHaveCount(0);
  const barBounds = await appearanceBar.evaluate((element) => {
    const bar = element.getBoundingClientRect();
    const panel = element.closest('[role="dialog"]')!.getBoundingClientRect();
    const clipped = [...element.querySelectorAll(".truncate")].some(
      (label) => label.clientWidth > 0 && label.scrollWidth > label.clientWidth + 1,
    );
    return { inside: bar.left >= panel.left && bar.right <= panel.right && bar.bottom <= panel.bottom, clipped };
  });
  expect(barBounds).toEqual({ inside: true, clipped: false });
  const scrollTop = await groupBy.evaluate((element) => {
    const scroller = element.closest('[role="dialog"]')!.querySelector<HTMLElement>(".overflow-y-auto");
    if (!scroller) throw new Error("The Appearance scroll region is missing");
    scroller.scrollTop = scroller.scrollHeight;
    return scroller.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(0);
  await expect(appearanceSave).toBeInViewport({ ratio: 1 });
  await expect(appearanceCancel).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: testInfo.outputPath("appearance-modified.png"), animations: "disabled" });
  await closeAppearance();
  await page.locator("#records-filter").click();
  await expect(filterSave).toBeVisible();
  await expect(filterCancel).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("filters-appearance-modified.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(filterSave).toHaveCount(0);
  expect(await storedGrouping()).toBeNull();

  await page.reload();
  await expect(allView).toHaveAttribute("data-view-modified", "");
  await openAppearance();
  await expect(groupBy).toContainText("Stage");
  await appearanceSave.click();
  await expect(unsavedWithoutView).toHaveCount(0);
  await expect(appearanceSave).toHaveCount(0);
  await expect(appearanceBar).toHaveCount(0);
  await expect.poll(storedGrouping).toMatchObject({ field: stage });

  await groupBy.click();
  await page.getByRole("option", { name: "None", exact: true }).click();
  await expect(allView).toHaveAttribute("data-view-modified", "");
  await appearanceCancel.click();
  await expect(groupBy).toContainText("Stage");
  await expect(unsavedWithoutView).toHaveCount(0);
  await closeAppearance();
  await expect.poll(storedGrouping).toMatchObject({ field: stage });

  const otherSession = await page.context().newPage();
  await otherSession.goto(`/en/records/${typeId}`);
  await withoutView(otherSession);
  await otherSession.locator("#records-display-options").click();
  await expect(otherSession.getByRole("combobox", { name: "Group By", exact: true })).toContainText("Stage");
  await otherSession.close();
  expect(errors).toEqual([]);
});
