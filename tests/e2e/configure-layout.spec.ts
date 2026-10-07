import type { Locator, Page } from "@playwright/test";
import type { Client } from "pg";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { addFromConfigure, backToConfigureGraph, openConfigureTab, configureDrawer, configureListCard, configureRow, configureTopBar, createConfiguredList, openConfigure, openConfigureRow, openListAction, saveDrawer, saveGeneral, selectConfigureList, setShowArchived } from "./configure";
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
  const icon = general.getByRole("button", { name: "Icon", exact: true });
  await expect(icon).toContainText("Growth");
  await icon.click();
  await expect(page.getByRole("toolbar", { name: "Choose icon", exact: true }).getByRole("button", { name: "Growth", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(general).not.toContainText("Selection unavailable");
  await expect(configureTopBar(page).getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  await general.getByRole("textbox", { name: "Description", exact: true }).fill("Open opportunities");
  await expect(configureTopBar(page).getByRole("button", { name: "Reset", exact: true })).toBeVisible();
  await expect(configureTopBar(page).getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(pane.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(pane.getByRole("button", { name: "Reset", exact: true })).toBeVisible();

  const leaveDeals = () => configureTopBar(page).getByRole("link", { name: "Configure", exact: true }).click();
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

  await general.getByRole("textbox", { name: "Plural name", exact: true }).fill("Opportunities");
  const paneSave = pane.getByRole("button", { name: "Save", exact: true });
  const paneReset = pane.getByRole("button", { name: "Reset", exact: true });
  const ready = pane.getByRole("status").filter({ hasText: "Ready to apply" });
  await paneSave.click();
  await expect
    .poll(async () => ((await ready.isVisible()) && (await paneSave.isEnabled())) || !(await paneReset.isVisible()))
    .toBe(true);
  if (await paneReset.isVisible()) await paneSave.click();
  await expect(page.getByRole("heading", { level: 1, name: "Opportunities", exact: true })).toBeVisible();
  expect((await readModel(database, companyId)).types.find((type) => type.id === id("deal"))).toMatchObject({
    pluralLabel: "Opportunities",
    description: "Open opportunities",
  });

  await general.getByRole("textbox", { name: "Description", exact: true }).fill("Discarded draft");
  await leaveDeals();
  await guard.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.locator("[data-configure-graph]")).toBeVisible();
  await expect.poll(() => typeIdInUrl(page)).toBeNull();
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
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(1);
  await expect(dialog.locator("[data-slot='sheet-header']").getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
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

  await openConfigureTab(page, "Fields");
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
  await openConfigure(page);
  await expect(configureListCard(page, "Tasks")).toContainText("Hidden");
  await expect(configureListCard(page, "Line items")).not.toContainText("Hidden");

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

  await openConfigure(page);
  await expect(configureListCard(page, "Field trips")).toHaveCount(0);
  await setShowArchived(page, true);
  await expect(configureListCard(page, "Field trips")).toContainText("Archived");
  await selectConfigureList(page, "Field trips");
  await openListAction(page, "Restore list");
  await saveDrawer(page);
  expect((await readModel(database, companyId)).types.find((type) => type.id === tripsId)?.archived).toBe(false);
  await openConfigure(page);
  await expect(configureListCard(page, "Field trips")).not.toContainText("Archived");

  await selectConfigureList(page, "Services");
  await openListAction(page, "Shared defaults");
  await expect(dialog.getByText("Shared defaults", { exact: true }).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("shows the data model graph and edits lists, fields and relationships from it", async ({
  page,
  database,
  companyId,
}) => {
  const errors = captureErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const dialog = configureDrawer(page);
  const graph = page.locator("[data-configure-graph]");
  const fitView = () => graph.getByRole("button", { name: "Fit view", exact: true }).click();
  const openGraph = async () => {
    await backToConfigureGraph(page);
    await expect(graph.locator("[data-configure-node]")).toHaveCount(6);
    await fitView();
  };

  await test.step("the graph is the default view with list cards, counts, fields and relationships", async () => {
    await page.goto("/en/configure");
    await expect(page.locator("[data-configure-page]")).toBeVisible();
    await expect(graph.locator("[data-configure-node]")).toHaveCount(6);
    const model = await readModel(database, companyId);
    await expect(graph.locator("[data-configure-relationship]")).toHaveCount(model.relationships.length);
    const deals = graph.locator(`[data-configure-node="${id("deal")}"]`);
    const dealCount = await database.query('SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [
      companyId,
      id("deal"),
    ]);
    await expect(deals.locator("[data-configure-node-count]")).toHaveText(
      new RegExp(`^${dealCount.rows[0].count}\\s*records?$`),
    );
    await expect(deals.locator(`[data-configure-graph-field="${id("deal.name")}"]`)).toContainText("Name");
    await expect(graph.locator(`[data-configure-node="${id("lineItem")}"]`)).toContainText("Part of Deals");
    await expect(graph.locator("[data-configure-source]")).toHaveCount(1);
    await fitView();
    for (const node of await graph.locator("[data-configure-node]").all()) await expect(node).toBeInViewport();
  });

  await test.step("selecting a list card opens it in the list view", async () => {
    await graph.getByRole("button", { name: "Organizations", exact: true }).click();
    await expect.poll(() => typeIdInUrl(page)).toBe(id("organization"));
    await expect(page.getByRole("heading", { level: 1, name: "Organizations", exact: true })).toBeVisible();
  });

  await test.step("a field row opens the field editor", async () => {
    await openGraph();
    await graph.locator(`[data-configure-graph-field="${id("deal.notes")}"]`).click();
    await expect(dialog.getByText("Edit field", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Notes");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(dialog).not.toBeVisible();
  });

  await test.step("a relationship chip opens the relationship editor", async () => {
    const model = await readModel(database, companyId);
    const relation = model.relationships.find(
      (candidate) => candidate.sourceTypeId === id("deal") && candidate.targetTypeId === id("organization"),
    );
    if (!relation) throw new Error("The preset deal organization relationship is missing");
    const chip = graph.locator(`[data-configure-relationship="${relation.id}"]`);
    await expect(chip).toHaveAttribute("aria-label", new RegExp(`^${relation.sourceLabel}: Deals to Organizations, `));
    await chip.click();
    await expect(dialog.getByRole("textbox", { name: "Label on this side", exact: false })).toHaveValue(
      relation.sourceLabel,
    );
    const cardinality = dialog.getByRole("combobox", { name: "How many records link", exact: true });
    await expect(cardinality).toContainText(
      `${relation.targetCardinality === "one" ? "One" : "Many"} to ${relation.sourceCardinality}`,
    );
    await cardinality.click();
    await page.getByRole("option", { name: "One to one", exact: true }).click();
    await expect(cardinality).toContainText("One to one");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Discard", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  });

  await test.step("dragging from one list's handle to another creates a relationship", async () => {
    const before = (await readModel(database, companyId)).relationships.length;
    const services = graph.locator(`[data-configure-node="${id("service")}"]`);
    const tasks = graph.locator(`[data-configure-node="${id("task")}"]`);
    const handle = services.locator(".react-flow__handle-bottom");
    await dragBetween(page, await center(handle), await center(tasks.getByRole("button", { name: "Tasks", exact: true })));
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
    await expect(graph.locator("[data-configure-relationship]")).toHaveCount(before + 1);
  });

  await test.step("add field starts from a card and a new list from the top bar", async () => {
    await graph.getByRole("button", { name: "Add field to Services", exact: true }).click();
    await expect(dialog.getByText("Add field", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(dialog).not.toBeVisible();
    await configureTopBar(page).getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByText("Create list", { exact: true }).first()).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).first().click();
    await expect(dialog).not.toBeVisible();
  });
  expect(errors).toEqual([]);
});
