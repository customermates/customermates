import type { Request } from "@playwright/test";

import { randomUUID } from "node:crypto";

import { presetId } from "../../features/records/crm-preset";
import { collectPageErrors, expect, test } from "./fixtures";
import { addBrowserWorkspace } from "./workspace";
import { e2eAppMode } from "./workspace-switching";
import { invokesServerAction, serverActionIds } from "./server-actions";
import { extractWikiSourceDocument } from "../../ee/wiki-crawl/website-source-extract";
import { mintApiKey } from "./api-key";
import { localE2eEnvironment } from "./local-environment";
import { createConfiguredList, openConfigure, configureTopBar } from "./configure";
import { restoreFromTrash } from "./trash";

test("resizing one stacked metric persists without moving untouched metrics or writing on responsive reloads", async ({
  page,
  database,
  companyId,
  workspace,
  isMobile,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  for (const [index, id] of ids.entries())
    await database.query(
      'INSERT INTO "Widget" (id,"companyId","userId",name,measure,"displayOptions",layout,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',
      [
        id,
        companyId,
        workspace.userId,
        `Stacked metric ${index + 1}`,
        JSON.stringify({
          source: { typeId: presetId(companyId, "service"), filters: [], relationships: [] },
          aggregation: "count",
          valueFieldId: null,
          groupBy: null,
          groupLimit: 100,
        }),
        JSON.stringify({ displayType: "number", barColors: ["success1"] }),
        JSON.stringify({ lg: { i: id, x: 0, y: index * 2, w: 12, h: 2 } }),
      ],
    );
  const read = async () =>
    (await database.query('SELECT id,version,layout FROM "Widget" WHERE "companyId"=$1 ORDER BY name', [companyId]))
      .rows;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/dashboard");
  const first = page.locator(`[data-focus-target="widget:${ids[0]}"]`);
  await expect(first.locator('[data-slot="widget-number-value"]')).toHaveText("0");
  await expect(first.locator('[data-slot="widget-subtitle"]')).not.toContainText("0");
  const writes: string[] = [];
  const save = serverActionIds("app/[locale]/(protected)/dashboard/actions.ts", "updateWidgetLayoutsAction");
  page.on("request", (request) => {
    if (invokesServerAction(request, save)) writes.push(request.url());
  });
  const before = await read();
  for (const width of [880, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(first).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(first).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await read()).toEqual(before);
  }
  expect(writes).toEqual([]);
  if (!isMobile) {
    const handle = first.locator(".react-resizable-handle-e");
    const bounds = await handle.boundingBox();
    if (!bounds) throw new Error("The metric resize handle is missing");
    const x = bounds.x + 2;
    const y = bounds.y + bounds.height / 2;
    await handle.hover({ position: { x: 2, y: bounds.height / 2 } });
    await page.mouse.down();
    await page.mouse.move(x - 180, y, { steps: 10 });
    await expect(first).toHaveClass(/\bresizing\b/);
    await page.mouse.up();
    await expect.poll(async () => (await read())[0].layout.lg.w).toBeLessThan(12);
    const after = await read();
    expect(after[0].version).toBe(2);
    expect(after.slice(1)).toEqual(before.slice(1));
    await page.reload();
    await expect(first).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await read()).toEqual(after);
  }
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("saved-metric-layout.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});

test("an operator deletes an extra workspace while retaining their shared login, current workspace and session", async ({
  page,
  database,
  workspace,
}) => {
  test.skip(e2eAppMode() !== "cloud", "The operator console is cloud only");
  const errors = collectPageErrors(page);
  await database.query('UPDATE "AuthUser" SET "isPlatformOperator"=true WHERE id=$1', [workspace.authUserId]);
  const extra = await addBrowserWorkspace(database, workspace, "Extra operator workspace");
  await page.goto("/en/operator/workspaces");
  const row = page.locator(`[data-row-id="${extra.companyId}"]`);
  await row.locator('[data-slot="data-row-open"]').click();
  await page.locator("#operator-modal-delete").click();
  const confirm = page.getByRole("alertdialog");
  await confirm.locator("#operator-modal-reason").fill("Remove an extra test workspace");
  await confirm
    .getByRole("textbox", { name: "Type Extra operator workspace to confirm", exact: true })
    .fill("Extra operator workspace");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row).toHaveCount(0);
  expect((await database.query('SELECT id FROM "Company" WHERE id=$1', [extra.companyId])).rowCount).toBe(0);
  expect((await database.query('SELECT id FROM "AuthUser" WHERE id=$1', [workspace.authUserId])).rowCount).toBe(1);
  expect((await database.query('SELECT id FROM "User" WHERE id=$1', [workspace.userId])).rowCount).toBe(1);
  expect(
    (await database.query('SELECT id FROM "AuthSession" WHERE "userId"=$1', [workspace.authUserId])).rowCount,
  ).toBe(1);
  await page.reload();
  await expect(page.getByRole("table")).toBeVisible();
  expect(errors).toEqual([]);
});

test("record names and ordinary rows open the drawer while direct cell editing stays in the list", async ({
  page,
  companyId,
  database,
  isMobile,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "service");
  const path = `/en/records/${typeId}`;
  await page.goto(path);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Drawer test service");
  await drawer.getByRole("textbox", { name: "Price", exact: false }).fill("12");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  if (isMobile)
    await page
      .locator("[data-phone-rows] [data-row-id]")
      .filter({ hasText: "Drawer test service" })
      .getByText("Browser Administrator", { exact: true })
      .click();
  else await page.getByRole("link", { name: "Drawer test service", exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${path}(?:\\?|$)`));
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  if (!isMobile) {
    const row = page.locator("tbody tr").filter({ hasText: "Drawer test service" });
    const edit = row.getByRole("button", { name: "Edit Price", exact: true });
    const cell = row.locator("td").filter({ has: page.getByRole("button", { name: "Edit Price", exact: true }) });
    const cellBox = await cell.boundingBox();
    const editBox = await edit.boundingBox();
    if (!cellBox || !editBox) throw new Error("The price edit target is missing");
    expect(editBox.width).toBeLessThan(cellBox.width);
    expect(cellBox.x + cellBox.width - editBox.x - editBox.width).toBeLessThanOrEqual(20);
    const idleShadow = await edit.evaluate((element) => getComputedStyle(element).boxShadow);
    await edit.hover();
    await expect.poll(() => edit.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(idleShadow);
    await page.screenshot({ path: testInfo.outputPath("inline-cell-highlight.png"), animations: "disabled" });
    await edit.click();
    await expect(drawer).toHaveCount(0);
    const input = row.getByRole("textbox");
    await input.fill("24");
    await input.press("Enter");
    await expect(row.locator("[data-in-place-editor]")).toHaveCount(0);
    await expect(edit).toHaveText("€24.00");
    await expect
      .poll(
        async () =>
          (
            await database.query(
              'SELECT "decimalValue"::double precision AS value FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2',
              [companyId, presetId(companyId, "service.amount")],
            )
          ).rows[0]?.value,
      )
      .toBe(24);
    await expect(drawer).toHaveCount(0);
    await row.locator("time").first().click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("textbox", { name: "Price", exact: false })).toHaveValue("24");
  }
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  const dealType = presetId(companyId, "deal");
  await page.goto(`/en/records/${dealType}`);
  await page.locator("#records-add").click();
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Drawer test deal");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.goto(`/en/records/${dealType}?viewMode=card&groupBy=${presetId(companyId, "deal.stage")}`);
  const card = page.locator("[data-item-id]").filter({ hasText: "Drawer test deal" }).first();
  await expect(card).toBeVisible();
  await card.focus();
  await card.press("Enter");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Drawer test deal");
  await expect(page).toHaveURL(new RegExp(`/en/records/${dealType}\\?`));
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await card.locator(":scope > a").click({ position: { x: 8, y: 8 } });
  await expect(drawer).toBeVisible();
  expect(errors).toEqual([]);
});

test("website headings stay clean when a new workspace reads, edits and saves its imported knowledge", async ({
  page,
  playwright,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const source = extractWikiSourceDocument(
    "## Getting started [#getting-started]\n\nStart with your customers.\n\n## Our product {#our-product}\n\nA shared workspace.",
    "https://example.com/guide.md",
    "text/markdown",
  );
  const { key } = await mintApiKey(database, workspace, "Imported heading regression");
  const api = await playwright.request.newContext({
    baseURL: localE2eEnvironment().baseUrl,
    extraHTTPHeaders: { "x-api-key": key },
  });
  try {
    const response = await api.post("/api/v1/wiki/create", {
      data: { pages: [{ title: "Website onboarding guide", markdown: source.text }] },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const [created] = await response.json();
    await page.goto(`/en/wiki?page=${created.id}`);
    const headings = page.locator(".tiptap h2");
    await expect(headings).toHaveText(["Getting started", "Our product"]);
    await headings.first().click();
    await page.keyboard.press("End");
    await page.keyboard.type(" updated");
    const refreshes: Request[] = [];
    const pending = new Set<Request>();
    page.on("request", (request) => {
      const headers = request.headers();
      if (headers["rsc"] !== "1" || headers["next-router-prefetch"] || new URL(request.url()).pathname !== "/en/wiki")
        return;
      refreshes.push(request);
      pending.add(request);
    });
    page.on("requestfinished", (request) => pending.delete(request));
    page.on("requestfailed", (request) => pending.delete(request));
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect
      .poll(
        async () =>
          (
            await database.query('SELECT markdown FROM "WikiPage" WHERE id=$1 AND "companyId"=$2', [
              created.id,
              workspace.companyId,
            ])
          ).rows[0].markdown,
      )
      .toContain("## Getting started updated");
    await expect.poll(() => refreshes.length > 0 && pending.size === 0).toBe(true);
    await page.reload();
    await expect(headings).toHaveText(["Getting started updated", "Our product"]);
    const saved = (
      await database.query('SELECT markdown FROM "WikiPage" WHERE id=$1 AND "companyId"=$2', [
        created.id,
        workspace.companyId,
      ])
    ).rows[0].markdown;
    expect(saved).not.toMatch(/[\[{]#/u);
    expect(errors).toEqual([]);
  } finally {
    await api.dispose();
  }
});


test("widgets delete independently and deleting a measured list moves its charts and activity to the same Trash batch", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const typeId = await createConfiguredList(page, "Measured items");
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  const measure = {
    source: { typeId, filters: [], relationships: [] },
    aggregation: "count",
    valueFieldId: null,
    groupBy: null,
    groupLimit: 100,
  };
  for (const [index, id] of ids.entries())
    await database.query(
      'INSERT INTO "Widget" (id,"companyId","userId",name,kind,measure,"activityQuery","displayOptions",layout,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())',
      [
        id,
        companyId,
        workspace.userId,
        ["Independent count", "Dependent count", "Dependent activity"][index],
        index === 2 ? "activityTimeline" : "chart",
        index === 2 ? null : JSON.stringify(measure),
        index === 2
          ? JSON.stringify({ scope: { typeIds: [typeId], records: [] }, kinds: ["record"], filters: [] })
          : null,
        JSON.stringify(index === 2 ? { showFilters: true } : { displayType: "number" }),
        JSON.stringify({ lg: { i: id, x: 0, y: index * 2, w: 12, h: index === 2 ? 4 : 2 } }),
      ],
    );
  await page.goto("/en/dashboard");
  const dialog = page.getByRole("dialog");
  const edit = page.getByRole("button", { name: "Edit Independent count", exact: true });
  await edit.focus();
  await edit.press("Enter");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Delete widget Independent count", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).not.toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(
    (
      await database.query('SELECT archived FROM "RecordTypeDefinition" WHERE id=$1 AND "companyId"=$2', [
        typeId,
        companyId,
      ])
    ).rows[0].archived,
  ).toBe(false);
  await page.reload();
  await expect(page.locator(`[data-focus-target="widget:${ids[0]}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-focus-target="widget:${ids[1]}"]`)).toBeVisible();
  await openConfigure(page, typeId);
  await configureTopBar(page).getByRole("button", { name: "List actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete list", exact: true }).click();
  await expect(confirm).toContainText("Dependent count");
  await expect(confirm).toContainText("Dependent activity");
  await expect(confirm).toContainText("move to Trash");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).not.toBeVisible();
  const trashed = (
    await database.query('SELECT kind,"targetId","batchId" FROM "TrashItem" WHERE "companyId"=$1', [companyId])
  ).rows;
  const list = trashed.find((item) => item.kind === "list" && item.targetId === typeId);
  expect(list).toBeTruthy();
  for (const id of ids.slice(1)) expect(trashed.find((item) => item.targetId === id)?.batchId).toBe(list.batchId);
  expect(
    (await database.query('SELECT id FROM "Widget" WHERE "companyId"=$1 AND "deletedAt" IS NULL', [companyId]))
      .rowCount,
  ).toBe(0);
  await page.goto("/en/dashboard");
  await expect(page.locator('[data-focus-target^="widget:"]')).toHaveCount(0);
  await restoreFromTrash(page, "Measured items");
  await restoreFromTrash(page, "Dependent count", { configuration: false });
  await restoreFromTrash(page, "Dependent activity", { configuration: false });
  await page.goto("/en/dashboard");
  await expect(page.locator(`[data-focus-target="widget:${ids[1]}"]`)).toBeVisible();
  await expect(page.locator(`[data-focus-target="widget:${ids[2]}"]`)).toBeVisible();
  await expect(page.locator(`[data-focus-target="widget:${ids[0]}"]`)).toHaveCount(0);
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
