import type { Locator, Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { addFromConfigure, configureDrawer, configureRailLink, configureRow, configureTopBar, createConfiguredList, openConfigure, openConfigureRow, openListAction, saveDrawer, saveGeneral, selectConfigureList, setShowArchived } from "./configure";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

async function readModel(database: Client, companyId: string) {
  const result = await database.query(
    'SELECT snapshot FROM "RecordSchemaRevision" WHERE "companyId"=$1 ORDER BY revision DESC LIMIT 1',
    [companyId],
  );
  return RecordModelSchema.parse(result.rows[0]?.snapshot);
}

function captureErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

const isWide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;
const typeIdInUrl = (page: Page) => new URL(page.url()).searchParams.get("typeId");

async function center(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element has no layout box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragBetween(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 4, from.y + 6, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 16 });
  await page.mouse.move(to.x, to.y + 1, { steps: 2 });
  await page.mouse.up();
}

test("lists every list flat with embedded lists under their parent, searches and remembers the last list", async ({
  page,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);

  await test.step("Configure opens the list named in its parameters", async () => {
    await page.goto(`/en/configure?typeId=${id("service")}`);
    await expect(page.getByRole("heading", { level: 1, name: "Services", exact: true })).toBeVisible();
  });

  await test.step("the page has a plain title and no section breadcrumb", async () => {
    const topBar = configureTopBar(page);
    await expect(topBar.getByText("Configure", { exact: true })).toBeVisible();
    await expect(topBar.getByRole("link", { name: "My Company" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "All lists", exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Configure views", exact: true })).toBeVisible();
  });

  await test.step("the rail is one flat list with Line items under Deals", async () => {
    if (!isWide(page)) await page.getByRole("button", { name: "All lists", exact: true }).click();
    const rail = page.locator("[data-configure-rail]");
    await expect(rail).toBeVisible();
    await expect(rail.locator("[data-configure-list]")).toHaveCount(6);
    const order = await rail
      .locator("[data-configure-list]")
      .evaluateAll((links) => links.map((link) => link.getAttribute("data-configure-list")));
    expect(order).toEqual(
      ["contact", "organization", "deal", "lineItem", "service", "task"].map((key) => id(key)),
    );
    const indent = async (key: string) =>
      (await rail.locator(`[data-configure-list="${id(key)}"]`).boundingBox())?.x ?? 0;
    const lineItemIcon = rail.locator(`[data-configure-list="${id("lineItem")}"] svg`);
    const dealIcon = rail.locator(`[data-configure-list="${id("deal")}"] svg`);
    expect(((await lineItemIcon.boundingBox())?.x ?? 0) - ((await dealIcon.boundingBox())?.x ?? 0)).toBeGreaterThan(8);
    expect(await indent("lineItem")).toBe(await indent("deal"));
    await expect(rail.getByText("Starter", { exact: false })).toHaveCount(0);
    await expect(rail.getByText("Custom", { exact: false })).toHaveCount(0);
    await expect(rail.getByRole("button", { name: "New list", exact: true })).toBeVisible();
  });

  await test.step("search narrows the rail", async () => {
    const search = page.getByRole("searchbox", { name: "Search lists", exact: true });
    await search.fill("line");
    await expect(page.locator("[data-configure-rail] [data-configure-list]")).toHaveCount(1);
    await expect(configureRailLink(page, "Line items")).toBeVisible();
    await search.fill("no such list");
    await expect(page.locator("[data-configure-rail]")).toContainText("No lists match your search.");
    await search.fill("");
    await expect(page.locator("[data-configure-rail] [data-configure-list]")).toHaveCount(6);
  });

  await test.step("selection lives in the URL and the last opened list is restored", async () => {
    await selectConfigureList(page, "Deals");
    expect(typeIdInUrl(page)).toBe(id("deal"));
    await page.goto("/en/configure");
    if (isWide(page)) {
      await expect.poll(() => typeIdInUrl(page)).toBe(id("deal"));
      await expect(page.getByRole("heading", { level: 1, name: "Deals", exact: true })).toBeVisible();
    } else {
      await expect(page.locator("[data-configure-rail]")).toBeVisible();
      expect(typeIdInUrl(page)).toBeNull();
      await selectConfigureList(page, "Deals");
      await page.getByRole("button", { name: "All lists", exact: true }).click();
      await expect(page.locator("[data-configure-rail]")).toBeVisible();
      expect(typeIdInUrl(page)).toBeNull();
    }
    await page.goBack();
    await expect.poll(() => typeIdInUrl(page)).toBe(id("deal"));
    await expect(page.getByRole("heading", { level: 1, name: "Deals", exact: true })).toBeVisible();
  });
  expect(errors).toEqual([]);
});

test("edits General in place, guards unsaved edits and saves from the top bar and the bottom", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  await openConfigure(page, id("deal"));
  const pane = page.locator("[data-configure-list-pane]");
  const general = page.getByRole("region", { name: "General", exact: true });
  await expect(pane).toContainText(/\d+ fields · \d+ relationships · \d+ activity connections/);
  await expect(general.getByRole("combobox", { name: "Icon", exact: true })).toContainText("Growth");
  await expect(general).not.toContainText("Selection unavailable");
  await expect(configureTopBar(page).getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  await general.getByRole("textbox", { name: "Description", exact: true }).fill("Open opportunities");
  await expect(configureTopBar(page).getByRole("button", { name: "Reset", exact: true })).toBeVisible();
  await expect(configureTopBar(page).getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(pane.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(pane.getByRole("button", { name: "Reset", exact: true })).toBeVisible();

  const leaveDeals = async () => {
    if (isWide(page)) await configureRailLink(page, "Contacts").click();
    else await page.getByRole("button", { name: "All lists", exact: true }).click();
  };
  await leaveDeals();
  const guard = page.getByRole("alertdialog");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(guard).not.toBeVisible();
  expect(typeIdInUrl(page)).toBe(id("deal"));
  await expect(pane).toBeVisible();
  await expect(general.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("Open opportunities");

  await saveGeneral(page);
  await expect
    .poll(async () => (await readModel(database, companyId)).types.find((type) => type.id === id("deal"))?.description)
    .toBe("Open opportunities");

  await general.getByRole("textbox", { name: "Navigation label", exact: true }).fill("Opportunities");
  await pane.getByRole("button", { name: "Save", exact: true }).click();
  const apply = pane.getByRole("button", { name: "Apply changes", exact: true });
  const paneReset = pane.getByRole("button", { name: "Reset", exact: true });
  await expect
    .poll(async () => ((await apply.isVisible()) && (await apply.isEnabled())) || !(await paneReset.isVisible()))
    .toBe(true);
  if (await paneReset.isVisible()) await apply.click();
  await expect(page.getByRole("heading", { level: 1, name: "Opportunities", exact: true })).toBeVisible();
  expect((await readModel(database, companyId)).types.find((type) => type.id === id("deal"))).toMatchObject({
    pluralLabel: "Opportunities",
    description: "Open opportunities",
  });

  await general.getByRole("textbox", { name: "Description", exact: true }).fill("Discarded draft");
  await leaveDeals();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  if (isWide(page)) {
    await expect(page.getByRole("heading", { level: 1, name: "Contacts", exact: true })).toBeVisible();
    expect(typeIdInUrl(page)).toBe(id("contact"));
  } else {
    await expect(page.locator("[data-configure-rail]")).toBeVisible();
    await expect.poll(() => typeIdInUrl(page)).toBeNull();
  }
  expect((await readModel(database, companyId)).types.find((type) => type.id === id("deal"))?.description).toBe(
    "Open opportunities",
  );
  expect(errors).toEqual([]);
});

test("adds and edits definitions in a side drawer and reorders fields with drag and drop", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const dialog = configureDrawer(page);
  await openConfigure(page, id("deal"));

  await configureTopBar(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "List",
    "Field",
    "Calculation",
    "Relationship",
    "Activity connection",
  ]);
  await page.keyboard.press("Escape");

  await addFromConfigure(page, "Calculation");
  await expect(dialog.getByText("Add field", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Value source", exact: true })).toContainText("Calculated");
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).last().click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("[data-configure-list-pane]")).toBeVisible();

  for (const [item, title] of [
    ["Field", "Add field"],
    ["Relationship", "Relationship"],
    ["Activity connection", "Activity connections"],
    ["List", "Create list"],
  ] as const) {
    await addFromConfigure(page, item);
    await expect(dialog.getByText(title, { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(dialog).not.toBeVisible();
  }

  const fields = page.getByRole("region", { name: "Fields", exact: true });
  await expect(configureRow(page, "Fields", "Notes")).toContainText("Formatted text · Entered manually");
  await expect(fields).toContainText("Money · Total from Line items");
  await openConfigureRow(page, "Fields", "Notes");
  await expect(dialog.getByText("Edit field", { exact: true })).toBeVisible();
  await expect(page.locator("[data-configure-list-pane]")).toBeAttached();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Deal notes");
  await saveDrawer(page);
  await expect(configureRow(page, "Fields", "Deal notes")).toBeVisible();
  expect((await readModel(database, companyId)).fields.find((field) => field.id === id("deal.notes"))?.label).toBe(
    "Deal notes",
  );

  const before = (await readModel(database, companyId)).fields
    .filter((field) => field.typeId === id("deal"))
    .map((field) => field.id);
  expect(before.slice(0, 2)).toEqual([id("deal.name"), id("deal.notes")]);
  const notesRow = fields.locator(`[data-configure-field="${id("deal.notes")}"]`);
  const nameRow = fields.locator(`[data-configure-field="${id("deal.name")}"]`);
  await notesRow.hover();
  const handle = notesRow.getByRole("button", { name: "Drag to reorder: Deal notes", exact: true });
  await expect(handle).toBeVisible();
  const start = await center(handle);
  const target = await center(nameRow);
  await dragBetween(page, start, { x: start.x, y: target.y - 12 });
  await expect
    .poll(() => fields.locator("[data-configure-field]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-configure-field"))))
    .toEqual([id("deal.notes"), id("deal.name"), ...before.slice(2)]);
  await expect(configureTopBar(page).getByRole("button", { name: "Reset", exact: true })).toBeVisible();
  await saveGeneral(page);
  await expect
    .poll(async () =>
      (await readModel(database, companyId)).fields.filter((field) => field.typeId === id("deal")).map((field) => field.id),
    )
    .toEqual([id("deal.notes"), id("deal.name"), ...before.slice(2)]);
  const positions = (await readModel(database, companyId)).fields
    .filter((field) => field.typeId === id("deal"))
    .map((field) => field.position);
  expect(positions).toEqual([...positions].sort((left, right) => left - right));
  await page.reload();
  await expect
    .poll(() => fields.locator("[data-configure-field]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-configure-field"))))
    .toEqual([id("deal.notes"), id("deal.name"), ...before.slice(2)]);
  expect(errors).toEqual([]);
});

test("archives and restores a list from the list actions and labels hidden and archived lists", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const dialog = configureDrawer(page);
  await openConfigure(page, id("task"));
  const general = page.getByRole("region", { name: "General", exact: true });
  await general.getByRole("switch", { name: "Show in navigation", exact: true }).click();
  await saveGeneral(page);
  expect((await readModel(database, companyId)).types.find((type) => type.id === id("task"))?.navigationVisible).toBe(
    false,
  );
  if (!isWide(page)) await page.getByRole("button", { name: "All lists", exact: true }).click();
  await expect(configureRailLink(page, "Tasks")).toContainText("Hidden");
  await expect(configureRailLink(page, "Line items")).not.toContainText("Hidden");

  const tripsId = await createConfiguredList(page, "Field trips");
  await openConfigure(page, tripsId);
  await openConfigureRow(page, "Activity connections", "Field trips");
  await dialog.getByRole("switch", { name: "Archive connection", exact: true }).check();
  await saveDrawer(page);
  await configureTopBar(page).getByRole("button", { name: "List actions", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Shared defaults", "Archive list"]);
  await page.keyboard.press("Escape");
  await openListAction(page, "Archive list");
  await expect(dialog).toContainText("Archiving hides this list");
  await saveDrawer(page);
  expect((await readModel(database, companyId)).types.find((type) => type.id === tripsId)?.archived).toBe(true);
  await expect(page.locator("[data-configure-list-pane]")).toContainText("Archived");
  if (isWide(page)) await expect(configureRailLink(page, "Field trips")).toContainText("Archived");

  await selectConfigureList(page, "Contacts");
  if (!isWide(page)) await page.getByRole("button", { name: "All lists", exact: true }).click();
  await expect(configureRailLink(page, "Field trips")).toHaveCount(0);
  await setShowArchived(page, true);
  await expect(configureRailLink(page, "Field trips")).toContainText("Archived");
  await selectConfigureList(page, "Field trips");
  await openListAction(page, "Restore list");
  await saveDrawer(page);
  expect((await readModel(database, companyId)).types.find((type) => type.id === tripsId)?.archived).toBe(false);
  await setShowArchived(page, false);
  if (!isWide(page)) await page.getByRole("button", { name: "All lists", exact: true }).click();
  await expect(configureRailLink(page, "Field trips")).not.toContainText("Archived");

  await selectConfigureList(page, "Services");
  await openListAction(page, "Shared defaults");
  await expect(dialog.getByText("Shared defaults", { exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("opens lists and relationships from the map and connects two lists by dragging", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const dialog = configureDrawer(page);
  await openConfigure(page, id("contact"));
  await page.getByRole("navigation", { name: "Configure views", exact: true }).getByRole("link", { name: "Map" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBe("map");
  const map = page.locator("[data-configure-map]");
  await expect(map).toBeVisible();
  await expect(map.locator("[data-configure-node]")).toHaveCount(6);
  const model = await readModel(database, companyId);
  await expect(map.locator("[data-configure-relationship]")).toHaveCount(model.relationships.length);

  await map.getByRole("button", { name: "Organizations", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("view")).toBeNull();
  expect(typeIdInUrl(page)).toBe(id("organization"));
  await expect(page.getByRole("heading", { level: 1, name: "Organizations", exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Configure views", exact: true }).getByRole("link", { name: "Map" }).click();
  await expect(map).toBeVisible();
  await map.getByRole("button", { name: "Deals", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Deals", exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Configure views", exact: true }).getByRole("link", { name: "Map" }).click();
  const relation = model.relationships.find(
    (candidate) => candidate.sourceTypeId === id("deal") && candidate.targetTypeId === id("organization"),
  );
  if (!relation) throw new Error("The preset deal organization relationship is missing");
  const edge = map.locator(`[data-configure-relationship="${relation.id}"]`);
  await edge.scrollIntoViewIfNeeded();
  const point = await edge.locator("path").first().evaluate((path: SVGPathElement) => {
    const middle = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM();
    if (!matrix) throw new Error("The relationship line is not rendered");
    const screen = new DOMPoint(middle.x, middle.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.move(point.x, point.y);
  await expect(edge.locator("text")).toHaveText(relation.sourceLabel);
  await page.mouse.click(point.x, point.y);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Label on this side", exact: false })).toHaveValue(
    relation.sourceLabel,
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();

  const services = map.getByRole("button", { name: "Services", exact: true });
  const tasks = map.getByRole("button", { name: "Tasks", exact: true });
  await tasks.scrollIntoViewIfNeeded();
  await services.scrollIntoViewIfNeeded();
  await dragBetween(page, await center(services), await center(tasks));
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Link to", exact: true })).toContainText("Tasks");
  await dialog.getByRole("textbox", { name: "Label on this side", exact: false }).fill("Follow-up task");
  await dialog.getByRole("textbox", { name: "Label on the other side", exact: false }).fill("Related service");
  await saveDrawer(page);
  await expect
    .poll(async () =>
      (await readModel(database, companyId)).relationships.find((candidate) => candidate.sourceLabel === "Follow-up task"),
    )
    .toMatchObject({ sourceTypeId: id("service"), targetTypeId: id("task"), targetLabel: "Related service" });
  await expect(map.locator("[data-configure-relationship]")).toHaveCount(model.relationships.length + 1);
  expect(errors).toEqual([]);
});
