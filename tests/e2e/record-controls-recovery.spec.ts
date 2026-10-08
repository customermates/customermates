import { randomUUID } from "node:crypto";
import type { Client } from "pg";
import type { Page, Locator, Request, Route, TestInfo } from "@playwright/test";
import {
  configureRow,
  followConfigureLink,
  openConfigure,
  openConfigureRow,
  saveDrawer,
  confirmDeletion,
} from "./configure";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { invokesServerAction, serverActionIds } from "./server-actions";
import { nativeResponseCheckpointState, observeNativeResponse } from "./native-response-checkpoint";
import { presetId } from "../../features/records/crm-preset";
import {
  RecordModelSchema,
  type RecordModel,
  type RecordRef,
  type RecordScalar,
} from "../../features/records/record-model.schema";
import {
  MutateRecordSchema,
  RecordOperationResultSchema,
  type RecordMutation,
} from "../../features/records/record-query.schema";
import type { RecordActivityQuery } from "../../ee/messaging/activities/record-activities.schema";
import { ALL_VIEW_KEY, SURFACE, recordSurfaceKey } from "../../core/data-view/data-view-keys";
import english from "../../i18n/locales/en.json" with { type: "json" };

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function model(page: Page) {
  return RecordModelSchema.parse(await post(page, "/api/v1/model/discover", {}));
}
async function mutate(page: Page, current: RecordModel, mutation: RecordMutation) {
  const result = RecordOperationResultSchema.parse(
    await post(
      page,
      "/api/v1/records/mutate",
      MutateRecordSchema.parse({
        expectedRevision: current.revision,
        idempotencyKey: randomUUID(),
        mutation,
      }),
    ),
  );
  if (result.status !== "completed") throw new Error("The bounded supplemental fixture must finish synchronously");
  return result;
}
async function create(
  page: Page,
  current: RecordModel,
  typeId: string,
  fields: Array<{ fieldId: string; value: RecordScalar }>,
  extra: Omit<Extract<RecordMutation, { action: "create" }>, "action" | "typeId" | "fields"> = {},
) {
  const result = await mutate(page, current, {
    action: "create",
    typeId,
    fields,
    ...extra,
  });
  const ref = result.refs.find((ref) => ref.typeId === typeId);
  if (!ref) throw new Error("Expected the created type's record reference");
  return ref;
}
const text = (fieldId: string, value: string) => ({
  fieldId,
  value: { kind: "text" as const, value },
});
const decimal = (fieldId: string, value: string, currency: string | null = null) => ({
  fieldId,
  value: { kind: "decimal" as const, value, currency },
});

test("paginates and retries record and widget history, restores a personal timeline view and recovers the dashboard after one accepted save", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(300000);
  const evidence = transportEvidence(page);
  const current = await model(page);
  const typeId = presetId(companyId, "service");
  const priceId = presetId(companyId, "service.amount");
  const name = "Paginated recovery service";
  const ref = await create(page, current, typeId, [
    text(presetId(companyId, "service.name"), name),
    decimal(priceId, "1", "EUR"),
  ]);
  for (let price = 2; price <= 29; price += 1) {
    const record = await database.query(
      'SELECT version FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND id=$3',
      [companyId, ref.typeId, ref.recordId],
    );
    await mutate(page, current, {
      action: "update",
      ref,
      expectedVersion: record.rows[0].version,
      fields: [decimal(priceId, String(price), "EUR")],
    });
  }
  const journal = async () =>
    (
      await database.query(
        'SELECT id,kind,payload,"createdAt" FROM "EventLog" WHERE "companyId"=$1 AND "subjectTypeId"=$2 AND "subjectId"=$3 ORDER BY "createdAt",id',
        [companyId, ref.typeId, ref.recordId],
      )
    ).rows;
  const beforeJournal = await journal();
  expect(beforeJournal).toHaveLength(29);
  const faults = new Set([
    "record history",
    "older record history",
    "dashboard collection",
    "widget history",
    "older widget history",
  ]);
  let dashboardFaultArmed = false;
  await page.route("**/*", async (route) => {
    const args = nextArguments(route.request());
    if (!args) return route.fallback();
    let label: string | null = null;
    const input = args[0];
    if (args.length === 1 && typeof input === "object" && input !== null) {
      if ("record" in input && JSON.stringify(input.record) === JSON.stringify(ref)) label = "record history";
      if ("scope" in input && typeof input.scope === "object" && input.scope !== null && "cursor" in input) {
        const scope = input.scope as { records?: RecordRef[]; typeIds?: string[] };
        if (JSON.stringify(scope.records) === JSON.stringify([ref]) && input.cursor !== null)
          label = "older record history";
        if (JSON.stringify(scope.typeIds) === JSON.stringify([typeId]))
          label = input.cursor === null ? "widget history" : "older widget history";
      }
    }
    if (
      dashboardFaultArmed &&
      args.length === 0 &&
      invokesServerAction(
        route.request(),
        serverActionIds("app/[locale]/(protected)/dashboard/actions.ts", "refreshWidgetsAction"),
      )
    )
      label = "dashboard collection";
    if (label && faults.delete(label)) await evidence.failResponse(route, label);
    else await route.fallback();
  });
  await page.goto(`/en/records/${ref.typeId}/${ref.recordId}`);
  const history = page.locator('main [data-detail-panel="activities"]');
  if (!(await history.isVisible())) await page.getByRole("tab", { name: "Activities", exact: true }).click();
  const rows = history.locator("ol > li");
  const retry = history.getByRole("button", { name: english.ErrorCard.retry, exact: true });
  const older = history.getByRole("button", { name: english.EntityTimeline.loadOlder, exact: true });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(rows).toHaveCount(25);
  await expect(retry).toHaveCount(0);
  await older.click();
  await expect(retry).toBeVisible();
  await expect(rows).toHaveCount(25);
  await retry.click();
  await expect(rows).toHaveCount(25);
  await expect(retry).toHaveCount(0);
  await older.click();
  await expect(rows).toHaveCount(29);
  await expect(older).toHaveCount(0);
  await rows.last().getByRole("button").click();
  const detail = page.getByRole("dialog", { name: /^Record created at / });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("€1.00", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await history.getByRole("button", { name: english.Common.ariaLabels.tooltipFilters, exact: true }).click();
  await page.locator('[data-palette-field="timelineKind"]').click();
  await page.locator('[data-palette-value="messages"]').click();
  await page.locator("#filter-palette-back").click();
  await page.keyboard.press("Escape");
  await expect(history.getByText(english.Common.emptyState.genericFilteredBody, { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(0);
  await history.locator("#global-data-views-new").click();
  const viewName = "My message history";
  await page.locator("#view-editor-name").fill(viewName);
  await page.locator('button[form="view-editor-form"]').click();
  await expect(page.locator("#view-editor-name")).toHaveCount(0);
  const view = history.getByRole("link", { name: viewName, exact: true });
  await expect(view).toHaveAttribute("aria-current", "page");
  const storedView = async () =>
    (
      await database.query(
        'SELECT id,filters FROM "DataView" WHERE "companyId"=$1 AND "userId"=$2 AND "surfaceKey"=$3 AND name=$4',
        [companyId, workspace.userId, SURFACE.entityTimeline, viewName],
      )
    ).rows;
  await expect.poll(storedView).toHaveLength(1);
  const [savedView] = await storedView();
  expect(savedView.filters).toEqual([{ field: "timelineKind", operator: "in", value: ["messages"] }]);
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("viewSurface") === SURFACE.entityTimeline && url.searchParams.get("view") === savedView.id,
  );
  await page.reload();
  if (!(await history.isVisible())) await page.getByRole("tab", { name: "Activities", exact: true }).click();
  await expect(view).toHaveAttribute("aria-current", "page");
  await expect(history.getByText(english.Common.emptyState.genericFilteredBody, { exact: true })).toBeVisible();
  await history.locator("#global-data-views-all").click();
  await expect(history.locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
  await history.getByRole("button", { name: english.Common.ariaLabels.tooltipFilters, exact: true }).click();
  await page.getByRole("button", { name: english.Common.actions.clear, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(rows).toHaveCount(25);
  await expect(older).toBeVisible();
  expect(await storedView()).toEqual([savedView]);
  const copiedHref = await view.getAttribute("href");
  if (!copiedHref) throw new Error("Expected canonical history view link");
  const services = page.locator('[data-sidebar="menu-button"]').filter({ hasText: /^Services$/ });
  await expect(page.locator("#sidebar-trigger")).not.toHaveAttribute("aria-disabled", "true");
  if (!(await services.isVisible())) await page.locator("#sidebar-trigger").click();
  await services.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}(?:\\?.*)?$`));
  await expect(history).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT "activeViewKey",filters FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
            [companyId, workspace.userId, SURFACE.entityTimeline],
          )
        ).rows[0],
    )
    .toEqual({ activeViewKey: ALL_VIEW_KEY, filters: [] });
  const linkedPage = await page.context().newPage();
  const linkedEvidence = transportEvidence(linkedPage);
  await linkedPage.goto(copiedHref);
  const linkedHistory = linkedPage.locator('main [data-detail-panel="activities"]');
  await expect(linkedHistory).toBeVisible();
  await expect(linkedHistory.getByRole("link", { name: viewName, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(linkedHistory.getByText(english.Common.emptyState.genericFilteredBody, { exact: true })).toBeVisible();
  await expect(linkedHistory.locator("ol > li")).toHaveCount(0);
  await page.getByRole("button", { name, exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Service", exact: true });
  await expect(drawer).toBeVisible();
  const parentUrl = page.url();
  const parentPresentation = async () =>
    (
      await database.query('SELECT * FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
        companyId,
        workspace.userId,
        `records:${typeId}`,
      ])
    ).rows;
  const beforeParentPresentation = await parentPresentation();
  await drawer.getByRole("tab", { name: english.Common.actions.labelHistory, exact: true }).click();
  const drawerHistory = drawer.getByRole("tabpanel", { name: english.Common.actions.labelHistory, exact: true });
  await drawerHistory.getByRole("link", { name: viewName, exact: true }).click();
  await expect(drawerHistory.getByRole("link", { name: viewName, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(drawerHistory.getByText(english.Common.emptyState.genericFilteredBody, { exact: true })).toBeVisible();
  await expect(page).toHaveURL(parentUrl);
  expect(await drawerHistory.getByRole("link", { name: viewName, exact: true }).getAttribute("href")).toBe(copiedHref);
  await expect
    .poll(
      async () =>
        (
          await database.query(
            'SELECT "activeViewKey" FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3',
            [companyId, workspace.userId, SURFACE.entityTimeline],
          )
        ).rows[0]?.activeViewKey,
    )
    .toBe(savedView.id);
  await drawerHistory.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-ai").click();
  const contexts = page.getByTestId("agent-composer-contexts");
  await expect(contexts.getByText(name, { exact: true })).toBeVisible();
  await expect(contexts).toContainText(viewName);
  await expect(drawer).toBeVisible();
  await expect(drawerHistory.getByRole("link", { name: viewName, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveURL(parentUrl);
  await page.getByTestId("agent-panel").getByRole("button", { name: "Close", exact: true }).click();
  await drawerHistory.locator("#global-data-views-menu").click();
  await page.getByRole("menuitem", { name: english.DataView.views.duplicate, exact: true }).click();
  const temporaryViewName = "Drawer history copy";
  await page.locator("#view-editor-name").fill(temporaryViewName);
  await page.locator('button[form="view-editor-form"]').click();
  await expect(page.locator("#view-editor-name")).toHaveCount(0);
  await expect(drawerHistory.getByRole("link", { name: temporaryViewName, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await drawerHistory.locator("#global-data-views-menu").click();
  await page.getByRole("menuitem", { name: english.DataView.views.delete, exact: true }).click();
  await page.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(drawerHistory.locator("#global-data-views-all")).toHaveAttribute("aria-current", "page");
  await expect(drawerHistory.locator("#global-data-views-all")).toBeFocused();
  await expect(page).toHaveURL(parentUrl);
  expect(await storedView()).toEqual([savedView]);
  expect(await parentPresentation()).toEqual(beforeParentPresentation);
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(parentUrl);
  expect(
    (await database.query('SELECT COUNT(*)::integer AS count FROM "AgentMessage" WHERE "companyId"=$1', [companyId]))
      .rows,
  ).toEqual([{ count: 0 }]);
  await linkedHistory.locator("#global-data-views-menu").click();
  await linkedPage.getByRole("menuitem", { name: english.DataView.views.delete, exact: true }).click();
  await linkedPage.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect.poll(storedView).toEqual([]);
  await expect(linkedPage).toHaveURL(
    (url) =>
      url.searchParams.get("view") === ALL_VIEW_KEY && url.searchParams.get("viewSurface") === SURFACE.entityTimeline,
  );
  await expect(linkedHistory.locator("ol > li")).toHaveCount(25);
  await linkedPage.reload();
  await expect(linkedHistory).toBeVisible();
  await expect(linkedHistory.locator("ol > li")).toHaveCount(25);
  await linkedEvidence.verify(testInfo, []);
  await linkedPage.close();
  const dashboard = page.getByRole("link", { name: "Dashboard", exact: true });
  if (!(await dashboard.isVisible())) await page.locator("#sidebar-trigger").click();
  await dashboard.click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await page.locator("#dashboard-add-widget").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#widget-kind-activityTimeline").click();
  const widgetName = "Recoverable service history";
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(widgetName);
  await toggleMultiple(page, "#activity-scope-types", "Services");
  dashboardFaultArmed = true;
  await dialog.locator("#widget-modal-save").click();
  const storedWidget = async () =>
    (
      await database.query(
        'SELECT id,version,name,"activityQuery","displayOptions",layout FROM "Widget" WHERE "companyId"=$1 AND "userId"=$2',
        [companyId, workspace.userId],
      )
    ).rows;
  await expect.poll(storedWidget).toHaveLength(1);
  const [acceptedWidget] = await storedWidget();
  expect(acceptedWidget).toMatchObject({
    version: 1,
    name: widgetName,
    activityQuery: { scope: { typeIds: [typeId], records: [] } },
  });
  await expect(dialog.locator("#widget-modal-save")).toBeDisabled();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const dashboardError = page.locator('main [data-page-state="error"][role="alert"]');
  await expect(dashboardError).toBeVisible();
  await dashboardError.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
  await expect(dashboardError).toHaveCount(0);
  const card = page
    .locator('[data-uid="app-card"]')
    .filter({ has: page.getByRole("heading", { name: widgetName, exact: true }) });
  const widgetRows = card.locator("ol > li");
  const widgetRetry = card.getByRole("button", { name: english.ErrorCard.retry, exact: true });
  const widgetOlder = card.getByRole("button", { name: english.EntityTimeline.loadOlder, exact: true });
  await expect(widgetRetry).toBeVisible();
  await widgetRetry.click();
  await expect(widgetRows).toHaveCount(25);
  await expect(widgetRetry).toHaveCount(0);
  await widgetOlder.click();
  await expect(widgetRetry).toBeVisible();
  await expect(widgetRows).toHaveCount(25);
  await widgetRetry.click();
  await expect(widgetRows).toHaveCount(25);
  await expect(widgetRetry).toHaveCount(0);
  await widgetOlder.click();
  await expect(widgetRows).toHaveCount(29);
  await expect(widgetOlder).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await storedWidget()).toEqual([acceptedWidget]);
  expect(await journal()).toEqual(beforeJournal);
  expect(faults.size).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("paginated-recovered-service-history.png"), fullPage: true });
  await evidence.verify(testInfo, [
    "record history",
    "older record history",
    "dashboard collection",
    "widget history",
    "older widget history",
  ]);
});
function nextArguments(request: Request): unknown[] | null {
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url()).hostname) ||
    request.method() !== "POST" ||
    !request.headers()["next-action"]
  )
    return null;
  try {
    const value: unknown = JSON.parse(request.postData() ?? "null");
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
function transportEvidence(page: Page) {
  const unexpected: string[] = [];
  const expectedTransport: string[] = [];
  const faults: Array<{ label: string; pathname: string; resourceErrorAccepted: boolean }> = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) unexpected.push(error.message);
  });
  page.on("console", (message) => {
    if (!isAppConsoleError(message)) return;
    let pathname: string | null = null;
    try {
      pathname = new URL(message.location().url).pathname;
    } catch {}
    const ownedFault = faults.find((fault) => fault.pathname === pathname && !fault.resourceErrorAccepted);
    if (
      ownedFault &&
      /^Failed to load resource:/.test(message.text()) &&
      /ERR_FAILED|network connection was lost|Load failed|cancelled|canceled/.test(message.text())
    ) {
      ownedFault.resourceErrorAccepted = true;
      expectedTransport.push(message.text());
    } else unexpected.push(message.text());
  });
  return {
    faults,
    async failResponse(route: Route, label: string) {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      faults.push({ label, pathname: new URL(route.request().url()).pathname, resourceErrorAccepted: false });
      await route.abort("failed");
    },
    async verify(testInfo: TestInfo, labels: string[]) {
      expect(faults.map((fault) => fault.label).sort()).toEqual([...labels].sort());
      expect(unexpected).toEqual([]);
      await testInfo.attach("owned-transport-recovery", {
        body: JSON.stringify({ faults, expectedTransport }),
        contentType: "application/json",
      });
    },
  };
}
async function select(page: Page, selector: string, name: string, scope: Locator = page.getByRole("dialog")) {
  await scope.locator(selector).click();
  await page.getByRole("option", { name, exact: true }).click();
}
async function toggleMultiple(page: Page, selector: string, name: string) {
  await page.getByRole("dialog").locator(selector).click();
  const popover = page.locator('[data-slot="popover-content"][data-state="open"]');
  await popover.getByRole("combobox").fill(name);
  await popover.getByRole("option", { name, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
}
async function expectChartPreview(page: Page, total: string, groups: Record<string, string>) {
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(english.RecordWidgets.overall.replace("{value}", total), {
      exact: true,
    }),
  ).toBeVisible();
  for (const [label, value] of Object.entries(groups)) {
    const entry = dialog.locator("dl > div").filter({ has: page.locator("dt").getByText(label, { exact: true }) });
    await expect(entry).toHaveCount(1);
    await expect(entry.locator("dd")).toHaveText(value);
  }
  await expect(dialog.locator("svg.recharts-surface")).toBeVisible();
}
async function chartPreview(page: Page, total: string, groups: Record<string, string>) {
  await expectChartPreview(page, total, groups);
}
test("uses Average, Minimum and Maximum at record grain, groups through relationships, edits group colors and retries an owned preview", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const evidence = transportEvidence(page);
  const id = (key: string) => presetId(companyId, key);
  let current = await model(page);
  const stage = current.fields.find((field) => field.id === id("deal.stage"));
  if (!stage) throw new Error("Expected the shipped stage field");
  const applied = await post(page, "/api/v1/model/apply", {
    expectedRevision: current.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          ...Object.fromEntries(Object.entries(stage).filter(([key]) => key !== "publishedSummary")),
          options: stage.options.map((option) => ({
            ...option,
            color:
              option.id === id("deal.stage.new")
                ? "success"
                : option.id === id("deal.stage.won")
                  ? "warning"
                  : option.color,
          })),
        },
      },
    ],
  });
  expect(applied).toMatchObject({ status: "completed" });
  current = await model(page);
  const updatedStage = current.fields.find((field) => field.id === id("deal.stage"));
  expect(updatedStage?.options.find((option) => option.id === id("deal.stage.new"))?.color).toBe("success");
  expect(updatedStage?.options.find((option) => option.id === id("deal.stage.won"))?.color).toBe("warning");
  const services: RecordRef[] = [];
  for (const [name, price] of [
    ["First equal-price service", "5"],
    ["Second equal-price service", "5"],
    ["Higher-price service", "20"],
  ]) {
    services.push(
      await create(page, current, id("service"), [
        text(id("service.name"), name),
        decimal(id("service.amount"), price, "EUR"),
      ]),
    );
  }
  const newDeal = await create(page, current, id("deal"), [
    text(id("deal.name"), "New grouping deal"),
    {
      fieldId: id("deal.stage"),
      value: { kind: "select", value: id("deal.stage.new") },
    },
  ]);
  const wonDeal = await create(page, current, id("deal"), [
    text(id("deal.name"), "Won grouping deal"),
    {
      fieldId: id("deal.stage"),
      value: { kind: "select", value: id("deal.stage.won") },
    },
  ]);
  for (const [service, deal] of [
    [services[0], newDeal],
    [services[1], newDeal],
    [services[0], wonDeal],
    [services[2], wonDeal],
  ]) {
    await create(page, current, id("lineItem"), [decimal(id("lineItem.quantity"), "1")], {
      links: [
        {
          relationId: id("lineItem.deal"),
          direction: "outgoing",
          record: deal,
        },
        {
          relationId: id("lineItem.service"),
          direction: "outgoing",
          record: service,
        },
      ],
    });
  }
  expect(
    (
      await database.query(
        'SELECT trim_scale("decimalValue")::text AS amount FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 ORDER BY "decimalValue", "recordId"',
        [companyId, id("service.amount")],
      )
    ).rows,
  ).toEqual([{ amount: "5" }, { amount: "5" }, { amount: "20" }]);
  expect(
    (
      await database.query('SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [
        companyId,
        id("lineItem"),
      ])
    ).rows,
  ).toEqual([{ count: 4 }]);
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#widget-kind-chart").click();
  const name = "Related price aggregates";
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  let schemaFault = true;
  let previewFault = false;
  await page.route("**/*", async (route) => {
    const args = nextArguments(route.request());
    if (schemaFault && JSON.stringify(args) === JSON.stringify([[id("service")]])) {
      schemaFault = false;
      await evidence.failResponse(route, "widget schema");
    } else if (
      previewFault &&
      args?.length === 1 &&
      typeof args[0] === "object" &&
      args[0] !== null &&
      "aggregation" in args[0]
    ) {
      previewFault = false;
      await evidence.failResponse(route, "widget preview");
    } else await route.fallback();
  });
  await select(page, '[id="measure.source.typeId"]', "Services");
  const schemaRetry = dialog.getByRole("button", { name: english.ErrorCard.retry, exact: true });
  await expect(schemaRetry).toBeVisible();
  await schemaRetry.click();
  await expect(schemaRetry).toHaveCount(0);
  await select(page, '[id="measure.aggregation"]', english.RecordModel.reducers.average);
  await select(page, '[id="measure.valueFieldId"]', "Price");
  await select(page, "#widget-group-path", "Line items");
  await select(page, "#widget-group-path", "Deal");
  await select(page, "#widget-group-field", "Stage");
  await dialog.getByRole("tab", { name: english.Dashboard.widgetEditor.tabs.appearance, exact: true }).click();
  await expect(
    dialog.getByRole("switch", {
      name: english.Common.inputs.displayOptions.useGroupColors,
      exact: true,
    }),
  ).toBeChecked();
  await dialog
    .getByRole("switch", {
      name: english.Common.inputs.displayOptions.useGroupColors,
      exact: true,
    })
    .uncheck();
  await expect(dialog.getByRole("button", { name: "Colors", exact: true })).toBeVisible();
  await dialog
    .getByRole("switch", {
      name: english.Common.inputs.displayOptions.useGroupColors,
      exact: true,
    })
    .check();
  await expect(dialog.getByRole("button", { name: "Colors", exact: true })).toHaveCount(0);
  await expectChartPreview(page, "€10.00", { New: "€5.00", Won: "€12.50" });
  const fills = async () => [
    ...new Set(
      await dialog
        .locator(".recharts-bar-rectangle path")
        .evaluateAll((paths) => paths.map((path) => path.getAttribute("fill"))),
    ),
  ];
  await expect.poll(fills).toHaveLength(2);
  await dialog
    .getByRole("switch", {
      name: english.Common.inputs.displayOptions.useGroupColors,
      exact: true,
    })
    .uncheck();
  await expect.poll(fills).toHaveLength(1);
  await dialog
    .getByRole("switch", {
      name: english.Common.inputs.displayOptions.useGroupColors,
      exact: true,
    })
    .check();
  await expect.poll(fills).toHaveLength(2);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("tab", { name: english.Dashboard.widgetEditor.tabs.data, exact: true }).click();
  previewFault = true;
  await select(page, '[id="measure.aggregation"]', english.RecordModel.reducers.min);
  const previewError = dialog.locator("[data-preview-error]");
  await expect(previewError.getByRole("alert")).toHaveText(english.RecordWidgets.previewFailed);
  await previewError.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
  await expect(previewError).toHaveCount(0);
  await chartPreview(page, "€5.00", { New: "€5.00", Won: "€5.00" });
  await select(page, '[id="measure.aggregation"]', english.RecordModel.reducers.max);
  await chartPreview(page, "€20.00", { New: "€5.00", Won: "€20.00" });
  await select(page, '[id="measure.aggregation"]', english.RecordModel.reducers.sum);
  await chartPreview(page, "€30.00", { New: "€10.00", Won: "€25.00" });
  await expect(dialog.getByText(english.RecordWidgets.attribution, { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: english.RecordWidgets.removeFilter,
      exact: true,
    }),
  ).toHaveCount(2);
  await dialog
    .getByRole("button", {
      name: english.RecordWidgets.removeFilter,
      exact: true,
    })
    .nth(1)
    .click();
  await expect(dialog.locator("#widget-group-field")).toContainText(english.RecordWidgets.groupRecord);
  await select(page, "#widget-group-path", "Deal");
  await select(page, "#widget-group-field", "Stage");
  await select(page, '[id="measure.aggregation"]', english.RecordModel.reducers.average);
  await chartPreview(page, "€10.00", { New: "€5.00", Won: "€12.50" });
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator('[data-uid="app-card"]').filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card.getByText("Overall: €10.00", { exact: true })).toBeVisible();
  const persisted = (
    await database.query('SELECT measure,"displayOptions" FROM "Widget" WHERE "companyId"=$1 AND name=$2', [
      companyId,
      name,
    ])
  ).rows;
  expect(persisted).toHaveLength(1);
  expect(persisted[0].measure).toMatchObject({
    aggregation: "average",
    valueFieldId: id("service.amount"),
    groupBy: {
      fieldId: id("deal.stage"),
      path: [
        { relationId: id("lineItem.service"), direction: "incoming" },
        { relationId: id("lineItem.deal"), direction: "outgoing" },
      ],
    },
  });
  expect(persisted[0].displayOptions.useGroupColors).toBe(true);
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(card.getByText("Overall: €10.00", { exact: true })).toBeVisible();
  for (const [aggregation, total, groups] of [
    ["min", "€5.00", { New: "€5.00", Won: "€5.00" }],
    ["max", "€20.00", { New: "€5.00", Won: "€20.00" }],
    ["sum", "€30.00", { New: "€10.00", Won: "€25.00" }],
    ["average", "€10.00", { New: "€5.00", Won: "€12.50" }],
  ] as const) {
    const edit = page.getByRole("button", { name: `Edit ${name}`, exact: true });
    await edit.focus();
    await edit.press("Enter");
    await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue(name);
    await select(page, '[id="measure.aggregation"]', english.RecordModel.reducers[aggregation]);
    await chartPreview(page, total, groups);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const saved = await database.query('SELECT measure FROM "Widget" WHERE "companyId"=$1 AND name=$2', [
      companyId,
      name,
    ]);
    expect(saved.rows).toEqual([{ measure: { ...persisted[0].measure, aggregation } }]);
    await page.reload();
    await expect(card.getByText(`Overall: ${total}`, { exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: testInfo.outputPath("relationship-aggregate-widget.png"),
    fullPage: true,
  });
  await evidence.verify(testInfo, ["widget schema", "widget preview"]);
});

async function messageFixtures(
  database: Client,
  companyId: string,
  userId: string,
  entries: Array<{ email: string; name: string; body: string }>,
) {
  const accountId = randomUUID();
  await database.query(
    'INSERT INTO "ConnectedAccount" (id,"companyId","userId","unipileAccountId",provider,status,"hasMessaging","displayName","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'ok\',true,\'Supplemental synthetic mailbox\',NOW())',
    [accountId, companyId, userId, randomUUID()],
  );
  const threads: string[] = [];
  for (const entry of entries) {
    const threadId = randomUUID();
    threads.push(threadId);
    await database.query(
      'INSERT INTO "MessagingThread" (id,"companyId","connectedAccountId","unipileThreadId",provider,state,subject,"lastMessageAt","updatedAt") VALUES ($1,$2,$3,$4,\'mail\',\'open\',$5,NOW(),NOW())',
      [threadId, companyId, accountId, randomUUID(), entry.name],
    );
    await database.query(
      'INSERT INTO "MessagingThreadParticipant" (id,"companyId","messagingThreadId",provider,"providerUserId",identifier,"identityLookupValue","displayName","updatedAt") VALUES ($1,$2,$3,\'mail\',$4,$4,$4,$5,NOW())',
      [randomUUID(), companyId, threadId, entry.email, entry.name],
    );
    await database.query(
      'INSERT INTO "MessagingMessage" (id,"companyId","messagingThreadId","connectedAccountId","unipileMessageId",provider,direction,origin,sender,recipients,"bodyText","sentAt","updatedAt") VALUES ($1,$2,$3,$4,$5,\'mail\',\'inbound\',\'unipile\',$6,$7,$8,NOW(),NOW())',
      [
        randomUUID(),
        companyId,
        threadId,
        accountId,
        randomUUID(),
        JSON.stringify({
          attendeeId: entry.email,
          identifier: entry.email,
          displayName: entry.name,
        }),
        JSON.stringify({ to: [], cc: [], bcc: [] }),
        entry.body,
      ],
    );
  }
  return threads;
}
async function activityPreview(page: Page, present: string[], absent: string[]) {
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('[data-preview-current="true"]')).toHaveCount(1);
  if (present.length) await expect(dialog.locator('[data-slot="widget-preview"] ol')).toHaveCount(1);
  for (const body of present) await expect(dialog.getByText(body, { exact: true })).toBeVisible();
  for (const body of absent) await expect(dialog.getByText(body, { exact: true })).toHaveCount(0);
}

test("uses explicit activity record scope, event kinds, positive and negative record filters and preserves saved query semantics", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(300000);
  const evidence = transportEvidence(page);
  const id = (key: string) => presetId(companyId, key);
  const current = await model(page);
  const organization = await create(page, current, id("organization"), [
    text(id("organization.name"), "Activity scope organization"),
  ]);
  const entries = [
    {
      email: "scope-a@example.test",
      name: "Scope Ada",
      body: "Ada scoped message",
    },
    {
      email: "scope-b@example.test",
      name: "Scope Ben",
      body: "Ben scoped message",
    },
  ];
  const people: RecordRef[] = [];
  for (const entry of entries) {
    people.push(
      await create(
        page,
        current,
        id("contact"),
        [text(id("contact.firstName"), "Scope"), text(id("contact.lastName"), entry.name.split(" ")[1])],
        { identities: [{ provider: "mail", value: entry.email }] },
      ),
    );
  }
  await mutate(page, current, {
    action: "link",
    relationId: id("contact.organizations"),
    source: people[0],
    target: organization,
  });
  await messageFixtures(database, companyId, workspace.userId, entries);
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#widget-kind-activityTimeline").click();
  const name = "Record-scoped filtered activity";
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await toggleMultiple(page, "#activity-scope-types", "Contacts");
  await toggleMultiple(page, `#activity-scope-${id("contact")}`, entries[0].name);
  for (const kind of [
    english.EntityTimeline.types.record,
    english.EntityTimeline.types.audit,
    english.EntityTimeline.types.configuration,
    english.EntityTimeline.types.activities,
    english.ContactHistory.calendarMeeting,
  ])
    await toggleMultiple(page, '[id="activityQuery.kinds"]', kind);
  await activityPreview(page, [entries[0].body], [entries[1].body]);
  await select(page, "#activity-add-filter", english.RecordActivityWidgets.filterKinds.record);
  await select(page, '[id="activityQuery.filters[0].typeId"]', "Organizations");
  await activityPreview(page, [entries[0].body], [entries[1].body]);
  await select(page, '[id="activityQuery.filters[0].operator"]', english.RecordActivityWidgets.operators.hasNone);
  await activityPreview(
    page,
    [],
    entries.map((entry) => entry.body),
  );
  await expect(dialog.locator('[data-slot="widget-preview"] ol > li')).toHaveCount(0);
  await toggleMultiple(page, `#activity-scope-${id("contact")}`, entries[0].name);
  await activityPreview(page, [entries[1].body], [entries[0].body]);
  await select(page, '[id="activityQuery.filters[0].operator"]', english.RecordActivityWidgets.operators.in);
  await toggleMultiple(page, '[id="activityQuery.filters[0].recordIds"]', "Activity scope organization");
  await activityPreview(page, [entries[0].body], [entries[1].body]);
  await select(page, '[id="activityQuery.filters[0].operator"]', english.RecordActivityWidgets.operators.notIn);
  await activityPreview(page, [entries[1].body], [entries[0].body]);
  await toggleMultiple(page, '[id="activityQuery.kinds"]', english.EntityTimeline.types.record);
  await toggleMultiple(page, '[id="activityQuery.kinds"]', english.EntityTimeline.types.messages);
  await activityPreview(
    page,
    [],
    entries.map((entry) => entry.body),
  );
  await expect(dialog.getByText(entries[1].name, { exact: true })).toBeVisible();
  await toggleMultiple(page, '[id="activityQuery.kinds"]', english.EntityTimeline.types.messages);
  await toggleMultiple(page, '[id="activityQuery.kinds"]', english.EntityTimeline.types.record);
  await dialog
    .getByRole("button", {
      name: english.RecordWidgets.removeFilter,
      exact: true,
    })
    .click();
  await activityPreview(
    page,
    entries.map((entry) => entry.body),
    [],
  );
  await select(page, "#activity-add-filter", english.RecordActivityWidgets.filterKinds.record);
  await select(page, '[id="activityQuery.filters[0].typeId"]', "Organizations");
  await select(page, '[id="activityQuery.filters[0].operator"]', english.RecordActivityWidgets.operators.hasNone);
  await activityPreview(page, [entries[1].body], [entries[0].body]);
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).not.toBeVisible();
  const card = page.locator('[data-uid="app-card"]').filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card.getByText(entries[1].body, { exact: true })).toBeVisible();
  const rows = (
    await database.query('SELECT "activityQuery" FROM "Widget" WHERE "companyId"=$1 AND name=$2', [companyId, name])
  ).rows;
  expect(rows).toHaveLength(1);
  const query = rows[0].activityQuery as RecordActivityQuery;
  expect(query.scope).toEqual({ typeIds: [id("contact")], records: [] });
  expect(query.kinds).toEqual(["message"]);
  expect(query.filters).toEqual([
    {
      kind: "record",
      typeId: id("organization"),
      operator: "hasNone",
      recordIds: [],
    },
  ]);
  const result = await post(page, "/api/v1/records/activities", {
    ...query,
    cursor: null,
    limit: 25,
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0].kind).toBe("message");
  if (result.items[0].kind !== "message") throw new Error("Expected a persisted filtered message");
  expect(result.items[0].message.bodyText).toBe(entries[1].body);
  await page.reload();
  await expect(card.getByText(entries[1].body, { exact: true })).toBeVisible();
  await expect(card.getByText(entries[0].body, { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("explicit-record-scope-and-presence-filters.png"),
    fullPage: true,
  });
  await evidence.verify(testInfo, []);
});

test("retries failed participant and conversation searches and deletes a real relationship projection", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(300000);
  const evidence = transportEvidence(page);
  const id = (key: string) => presetId(companyId, key);
  const current = await model(page);
  const person = await create(
    page,
    current,
    id("contact"),
    [text(id("contact.firstName"), "Retry"), text(id("contact.lastName"), "Person")],
    { identities: [{ provider: "mail", value: "retry-target@example.test" }] },
  );
  const deal = await create(page, current, id("deal"), [text(id("deal.name"), "Retry conversation deal")]);
  const service = await create(page, current, id("service"), [
    text(id("service.name"), "Projection service"),
    decimal(id("service.amount"), "7", "EUR"),
  ]);
  await create(page, current, id("lineItem"), [decimal(id("lineItem.quantity"), "1")], {
    links: [
      {
        relationId: id("lineItem.deal"),
        direction: "outgoing",
        record: deal,
      },
      {
        relationId: id("lineItem.service"),
        direction: "outgoing",
        record: service,
      },
    ],
  });
  const threads = await messageFixtures(database, companyId, workspace.userId, [
    {
      email: "retry-sender@example.test",
      name: "Retry Sender",
      body: "Unlinked retry conversation",
    },
  ]);
  await page.goto(`/en/inbox?threadId=${threads[0]}`);
  await page
    .getByRole("button", { name: english.Inbox.settings.title, exact: true })
    .and(page.locator('[data-slot="badge"]'))
    .click();
  const settings = page.getByRole("dialog", {
    name: english.Inbox.settings.title,
    exact: true,
  });
  await settings.getByRole("button", { name: english.Inbox.participants.link, exact: true }).click();
  await expect(settings.getByRole("combobox")).toBeVisible();
  let personFault = true;
  let conversationFault = false;
  await page.route("**/*", async (route) => {
    const args = nextArguments(route.request());
    if (personFault && JSON.stringify(args) === JSON.stringify(["Retry Person"])) {
      personFault = false;
      await evidence.failResponse(route, "participant search");
    } else if (
      conversationFault &&
      args?.length === 1 &&
      typeof args[0] === "object" &&
      args[0] !== null &&
      "searchTerm" in args[0] &&
      args[0].searchTerm === "Retry conversation deal"
    ) {
      conversationFault = false;
      await evidence.failResponse(route, "conversation search");
    } else await route.fallback();
  });
  await settings.getByRole("combobox").fill("Retry Person");
  await expect(settings.getByRole("alert")).toBeVisible();
  await settings.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
  await expect(settings.getByRole("option", { name: "Retry Person", exact: true })).toBeVisible();
  await expect(settings.getByRole("alert")).toHaveCount(0);
  await settings.getByRole("option", { name: "Retry Person", exact: true }).click();
  await expect(
    settings.getByRole("button", {
      name: "Open record: Retry Person",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await database.query(
        'SELECT "recordId" FROM "RecordIdentityLink" WHERE "companyId"=$1 AND "typeId"=$2 ORDER BY "identityId"',
        [companyId, id("contact")],
      )
    ).rows,
  ).toEqual([{ recordId: person.recordId }, { recordId: person.recordId }]);
  const conversation = settings.getByRole("region", {
    name: english.Inbox.participants.conversationRecords,
    exact: true,
  });
  await conversation
    .getByRole("button", {
      name: english.Inbox.participants.linkRecord,
      exact: true,
    })
    .click();
  conversationFault = true;
  await conversation.getByRole("combobox").fill("Retry conversation deal");
  await expect(conversation.getByRole("alert")).toBeVisible();
  await conversation.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
  await expect(conversation.getByRole("option").filter({ hasText: "Retry conversation deal" })).toBeVisible();
  await expect(conversation.getByRole("alert")).toHaveCount(0);
  await conversation.getByRole("option").filter({ hasText: "Retry conversation deal" }).click();
  await expect(
    conversation.getByRole("button", {
      name: "Open record: Retry conversation deal",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (
      await database.query(
        'SELECT "threadId","typeId","recordId" FROM "MessagingThreadRecordLink" WHERE "companyId"=$1',
        [companyId],
      )
    ).rows,
  ).toEqual([{ threadId: threads[0], typeId: deal.typeId, recordId: deal.recordId }]);
  await page.keyboard.press("Escape");
  await expect(settings).not.toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await page.goto(`/en/records/${service.typeId}/${service.recordId}`);
  const projection = page.getByRole("region", { name: "Deals", exact: true });
  await projection
    .getByRole("button", {
      name: english.RecordModel.openRecord.replace("{name}", "Retry conversation deal"),
      exact: true,
    })
    .click();
  const openedDeal = page.getByRole("dialog", {
    name: current.types.find((type) => type.id === deal.typeId)?.label,
    exact: true,
  });
  await expect(openedDeal.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Retry conversation deal");
  await page.screenshot({
    path: testInfo.outputPath("related-record-projection.png"),
    fullPage: true,
  });
  await openConfigure(page, id("service"));
  await openConfigureRow(page, "Relationships", "Deals");
  await page.getByRole("dialog").getByRole("button", { name: "Delete column", exact: true }).click();
  await confirmDeletion(page);
  await expect(configureRow(page, "Relationships", "Deals")).toHaveCount(0);
  const latest = await model(page);
  expect(
    latest.types
      .find((type) => type.id === id("service"))
      ?.relationshipPaths?.some((path) => path.id === id("service.deals.path")),
  ).toBe(false);
  expect(
    (
      await database.query(
        'SELECT COUNT(*)::integer AS count FROM "RecordLink" WHERE "companyId"=$1 AND "relationId" IN ($2,$3)',
        [companyId, id("lineItem.deal"), id("lineItem.service")],
      )
    ).rows,
  ).toEqual([{ count: 2 }]);
  await page.goto(`/en/records/${service.typeId}/${service.recordId}`);
  await expect(page.getByRole("region", { name: "Deals", exact: true })).toHaveCount(0);
  await evidence.verify(testInfo, ["participant search", "conversation search"]);
});

test("retains readable list content after a failed refresh and retries the empty-list error without changing persisted records", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  const evidence = transportEvidence(page);
  const id = (key: string) => presetId(companyId, key);
  const current = await model(page);
  const name = "List recovery service";
  const service = await create(page, current, id("service"), [
    text(id("service.name"), name),
    decimal(id("service.amount"), "12.125", "EUR"),
  ]);
  const values = () =>
    database.query(
      'SELECT "fieldId", state, "textValue", trim_scale("decimalValue")::text AS decimal FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 ORDER BY "fieldId"',
      [companyId, service.typeId, service.recordId],
    );
  const before = (await values()).rows;
  await page.goto(`/en/records/${service.typeId}`);
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  const search = page.locator("#records-search");
  if ((page.viewportSize()?.width ?? 0) < 1024)
    await page.getByRole("button", { name: english.Common.table.search, exact: true }).click();
  await expect(search).toBeVisible();
  await expect(search).toBeEnabled();
  let retainedFault = true;
  let emptyFault = true;
  let matchingReads = 0;
  await page.route("**/*", async (route) => {
    const args = nextArguments(route.request());
    if (
      args?.length === 2 &&
      args[0] === service.typeId &&
      typeof args[1] === "object" &&
      args[1] !== null &&
      "searchTerm" in args[1]
    ) {
      if (args[1].searchTerm === "retained-response-failure" && retainedFault) {
        retainedFault = false;
        await evidence.failResponse(route, "retained list refresh");
        return;
      }
      if (args[1].searchTerm === name) {
        matchingReads += 1;
        if (emptyFault) {
          emptyFault = false;
          await evidence.failResponse(route, "empty list refresh");
          return;
        }
      }
    }
    await route.fallback();
  });
  await search.fill("retained-response-failure");
  await expect.poll(() => evidence.faults.length).toBe(1);
  await expect(page.locator('[data-page-state="loading"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(page.locator('[data-page-state="error"]')).toHaveCount(0);
  await expect(search).toHaveValue("retained-response-failure");
  await search.fill("completed-empty-search");
  await expect(
    page.getByText(english.Common.emptyState.filteredTitle, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(page.locator('[data-page-state="error"]')).toHaveCount(0);
  const surfaceKey = recordSurfaceKey(service.typeId);
  const saveAction = serverActionIds("app/actions.ts", "saveDataViewStateAction");
  const saveCompletion = await observeNativeResponse(page, {
    ids: [...saveAction],
    origin: new URL(page.url()).origin,
    surfaceKey,
    viewKey: ALL_VIEW_KEY,
    searchTerm: name,
  });
  const searchSaved = page.waitForResponse(
    (response) => {
      if (!invokesServerAction(response.request(), saveAction)) return false;
      const args = nextArguments(response.request());
      const input = args?.[0];
      return (
        args?.length === 1 &&
        typeof input === "object" &&
        input !== null &&
        "surfaceKey" in input &&
        input.surfaceKey === surfaceKey &&
        "viewKey" in input &&
        input.viewKey === ALL_VIEW_KEY &&
        "state" in input &&
        typeof input.state === "object" &&
        input.state !== null &&
        "searchTerm" in input.state &&
        input.state.searchTerm === name
      );
    },
    { timeout: 15000 },
  );
  await search.fill(name);
  const error = page.locator('[data-page-state="error"][role="alert"]');
  await expect(error).toBeVisible();
  await expect(error.getByRole("heading", { name: english.ErrorCard.title, exact: true })).toBeVisible();
  await expect(search).toHaveValue(name);
  await error.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(error).toHaveCount(0);
  expect(matchingReads).toBe(2);
  expect((await values()).rows).toEqual(before);
  const savedResponse = await searchSaved;
  expect(savedResponse.status()).toBe(200);
  await expect
    .poll(async () => nativeResponseCheckpointState(await saveCompletion.snapshot()), { timeout: 15000 })
    .toBe("complete");
  const completedSave = await saveCompletion.stop();
  expect(completedSave).toMatchObject({
    requests: 1,
    status: 200,
    fetchErrors: 0,
    readErrors: 0,
    readerCancels: 0,
    streamCancels: 0,
    earlyReleases: 0,
    observationErrors: 0,
  });
  expect(completedSave.bytes).toBeGreaterThan(0);
  expect(completedSave.chunks).toBeGreaterThan(0);
  expect(completedSave.eof).toBeGreaterThan(0);
  expect(
    (
      await database.query('SELECT "searchTerm" FROM "P13n" WHERE "companyId"=$1 AND "userId"=$2 AND "p13nId"=$3', [
        companyId,
        workspace.userId,
        surfaceKey,
      ])
    ).rows,
  ).toEqual([{ searchTerm: name }]);
  await page.unrouteAll({ behavior: "wait" });
  await expect(page).toHaveURL((url) => url.searchParams.get("searchTerm") === name);
  await page.reload();
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(search).toHaveValue(name);
  await page.screenshot({
    path: testInfo.outputPath("recovered-list-error-state.png"),
    fullPage: true,
  });
  await evidence.verify(testInfo, ["retained list refresh", "empty list refresh"]);
});

test("retries relationship reads and accepted record, bulk and schema refreshes without repeating writes", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const evidence = transportEvidence(page);
  const id = (key: string) => presetId(companyId, key);
  const current = await model(page);
  const service = await create(page, current, id("service"), [
    text(id("service.name"), "Recovery service"),
    decimal(id("service.amount"), "10", "EUR"),
  ]);
  const second = await create(page, current, id("service"), [
    text(id("service.name"), "Recovery second"),
    decimal(id("service.amount"), "30", "EUR"),
  ]);
  const deal = await create(page, current, id("deal"), [text(id("deal.name"), "Recovery linked deal")]);
  await create(page, current, id("lineItem"), [decimal(id("lineItem.quantity"), "1")], {
    links: [
      { relationId: id("lineItem.service"), direction: "outgoing", record: service },
      { relationId: id("lineItem.deal"), direction: "outgoing", record: deal },
    ],
  });
  const receiptCount = async () =>
    (
      await database.query('SELECT COUNT(*)::integer AS count FROM "RecordMutationReceipt" WHERE "companyId"=$1', [
        companyId,
      ])
    ).rows[0].count;
  const sourceRows = async () =>
    (
      await database.query(
        'SELECT record.id,record.version,trim_scale(value."decimalValue")::text AS amount FROM "CrmRecord" record JOIN "RecordValue" value ON value."companyId"=record."companyId" AND value."typeId"=record."typeId" AND value."recordId"=record.id AND value."fieldId"=$3 WHERE record."companyId"=$1 AND record."typeId"=$2 ORDER BY record.id',
        [companyId, service.typeId, id("service.amount")],
      )
    ).rows;
  let linkedFault = true;
  let pathFault = true;
  let editorFault = false;
  let bulkFaultsRemaining = 0;
  let modelFault = false;
  let acceptedNavigationReads = 0;
  const navigationAction = serverActionIds("app/[locale]/(protected)/records/actions.ts", "getRecordNavigationAction");
  const modelAction = serverActionIds("app/[locale]/(protected)/records/actions.ts", "getRecordModelAction");
  await page.route("**/*", async (route) => {
    const args = nextArguments(route.request());
    const input = args?.length === 1 && typeof args[0] === "object" && args[0] !== null ? args[0] : null;
    if (
      linkedFault &&
      input &&
      "linkedTo" in input &&
      JSON.stringify(input.linkedTo) ===
        JSON.stringify({ ref: service, relationId: id("lineItem.service"), direction: "incoming" })
    ) {
      linkedFault = false;
      await evidence.failResponse(route, "linked records");
    } else if (
      pathFault &&
      input &&
      "throughPath" in input &&
      JSON.stringify(input.throughPath) === JSON.stringify({ ref: service, pathId: id("service.deals.path") })
    ) {
      pathFault = false;
      await evidence.failResponse(route, "relationship projection");
    } else if (
      editorFault &&
      input &&
      "typeId" in input &&
      "recordId" in input &&
      input.typeId === service.typeId &&
      input.recordId === service.recordId
    ) {
      editorFault = false;
      await evidence.failResponse(route, "accepted record refresh");
    } else if (bulkFaultsRemaining > 0 && args?.length === 2 && args[0] === service.typeId) {
      bulkFaultsRemaining -= 1;
      await evidence.failResponse(
        route,
        bulkFaultsRemaining === 1 ? "accepted bulk refresh" : "accepted bulk fallback refresh",
      );
    } else if (modelFault && acceptedNavigationReads === 0 && invokesServerAction(route.request(), navigationAction)) {
      acceptedNavigationReads += 1;
      await evidence.failResponse(route, "accepted navigation refresh");
    } else if (modelFault && args?.length === 0 && invokesServerAction(route.request(), modelAction)) {
      modelFault = false;
      await evidence.failResponse(route, "accepted schema refresh");
    } else await route.fallback();
  });
  await page.goto(`/en/records/${service.typeId}/${service.recordId}`);
  const main = page.getByRole("main");
  const linked = main.locator(`[data-entity-field="relationship:${id("lineItem.service")}:incoming"]`);
  const projection = main.getByRole("region", { name: "Deals", exact: true });
  for (const region of [linked, projection]) {
    await expect(region.getByRole("alert")).toBeVisible();
    await region.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
    await expect(region.getByRole("alert")).toHaveCount(0);
  }
  await expect(
    linked.getByRole("button", { name: english.RecordModel.openRecord.replace("{name}", "Line item"), exact: true }),
  ).toBeVisible();
  await expect(
    projection.getByRole("button", {
      name: english.RecordModel.openRecord.replace("{name}", "Recovery linked deal"),
      exact: true,
    }),
  ).toBeVisible();
  const linkRows = (
    await database.query(
      'SELECT "relationId","sourceId","targetId" FROM "RecordLink" WHERE "companyId"=$1 ORDER BY "relationId"',
      [companyId],
    )
  ).rows;
  expect(linkRows).toHaveLength(2);
  const beforeSave = await receiptCount();
  const beforeSaveRows = await sourceRows();
  expect(beforeSaveRows.map((row) => row.id).sort()).toEqual([service.recordId, second.recordId].sort());
  const price = main.getByRole("textbox", { name: "Price", exact: false });
  await price.fill("20");
  editorFault = true;
  await main.getByRole("button", { name: "Save", exact: true }).click();
  const retryRecord = main.getByRole("status").getByRole("button", { name: english.ErrorCard.retry, exact: true });
  await expect(retryRecord).toBeVisible();
  await expect(main.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  expect(await receiptCount()).toBe(beforeSave + 1);
  const afterSave = await sourceRows();
  expect(afterSave).toEqual(
    beforeSaveRows.map((row) =>
      row.id === service.recordId ? { ...row, version: row.version + 1, amount: "20" } : row,
    ),
  );
  await retryRecord.click();
  await expect(retryRecord).toHaveCount(0);
  await expect(price).toHaveValue("20");
  await expect(price).toBeEditable();
  await expect(main.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(await receiptCount()).toBe(beforeSave + 1);
  expect(await sourceRows()).toEqual(afterSave);
  await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.goto(`/en/records/${service.typeId}`);
  for (const name of ["Recovery service", "Recovery second"]) {
    await page
      .getByRole("row")
      .filter({ has: page.getByRole("button", { name, exact: true }) })
      .getByRole("checkbox")
      .check();
  }
  const mass = page.locator("[data-record-mass-actions]");
  await mass.getByRole("button", { name: "Update", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Update", exact: true })
    .getByRole("button", { name: "Price", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Price", exact: false }).fill("17.125");
  const beforeBulk = await receiptCount();
  bulkFaultsRemaining = 2;
  await page.getByRole("button", { name: "Apply to selected", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Update", exact: true })).not.toBeVisible();
  await expect(mass.getByRole("button", { name: english.ErrorCard.retry, exact: true })).toBeVisible();
  expect(await receiptCount()).toBe(beforeBulk + 1);
  const afterBulk = await sourceRows();
  expect(afterBulk).toEqual(afterSave.map((row) => ({ ...row, version: row.version + 1, amount: "17.125" })));
  await mass.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
  await expect(mass).toHaveCount(0);
  expect(await receiptCount()).toBe(beforeBulk + 1);
  expect(await sourceRows()).toEqual(afterBulk);
  await followConfigureLink(page);
  const fields = page.getByRole("region", { name: english.RecordModel.fields, exact: true });
  await openConfigureRow(page, "Fields", "Price");
  const dialog = page.getByRole("dialog");
  await dialog.locator("#label").fill("Recovered price");
  await dialog.getByRole("button", { name: english.Common.actions.save, exact: true }).first().click();
  await expect(dialog.getByRole("status")).toContainText("Ready to apply");
  const beforeSchema = await receiptCount();
  modelFault = true;
  await dialog.getByRole("button", { name: english.Common.actions.save, exact: true }).first().click();
  await expect(dialog).not.toBeVisible();
  const schemaError = page.getByRole("alert").filter({ hasText: english.ErrorCard.title });
  await expect(schemaError).toBeVisible();
  expect(acceptedNavigationReads).toBe(1);
  expect(await receiptCount()).toBe(beforeSchema + 1);
  const navigationRetry = page.locator("#nav-record-navigation-retry");
  if (!(await navigationRetry.isVisible())) await page.locator("#sidebar-trigger").click();
  await expect(navigationRetry).toBeVisible();
  await navigationRetry.click();
  await expect(navigationRetry).toHaveCount(0);
  if (testInfo.project.name === "mobile") {
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-slot="sidebar"][data-mobile="true"]')).not.toBeVisible();
  }
  expect(await receiptCount()).toBe(beforeSchema + 1);
  const accepted = await model(page);
  expect(accepted.fields.find((field) => field.id === id("service.amount"))?.label).toBe("Recovered price");
  await schemaError.getByRole("button", { name: english.ErrorCard.retry, exact: true }).click();
  await expect(schemaError).toHaveCount(0);
  await expect(fields.getByText("Recovered price", { exact: true })).toBeVisible();
  expect(await receiptCount()).toBe(beforeSchema + 1);
  expect((await model(page)).revision).toBe(accepted.revision);
  expect(await sourceRows()).toEqual(afterBulk);
  expect(
    (
      await database.query(
        'SELECT "relationId","sourceId","targetId" FROM "RecordLink" WHERE "companyId"=$1 ORDER BY "relationId"',
        [companyId],
      )
    ).rows,
  ).toEqual(linkRows);
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(fields.getByText("Recovered price", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("recovered-post-write-controls.png"), fullPage: true });
  await evidence.verify(testInfo, [
    "linked records",
    "relationship projection",
    "accepted record refresh",
    "accepted bulk refresh",
    "accepted bulk fallback refresh",
    "accepted schema refresh",
    "accepted navigation refresh",
  ]);
});

test("recovers a parent after an embedded save without repeating the child mutation or losing recalculated totals", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const evidence = transportEvidence(page);
  const id = (key: string) => presetId(companyId, key);
  const current = await model(page);
  const service = await create(page, current, id("service"), [
    text(id("service.name"), "Nested recovery service"),
    decimal(id("service.amount"), "100", "EUR"),
  ]);
  const stage = current.fields
    .find((field) => field.id === id("deal.stage"))
    ?.options?.find((option) => option.label === "Proposal");
  if (!stage) throw new Error("Missing Proposal stage");
  const notes = current.fields.find((field) => field.typeId === id("deal") && field.valueType === "richText");
  if (!notes) throw new Error("Missing Notes field");
  const deal = await create(page, current, id("deal"), [
    text(id("deal.name"), "Nested recovery deal"),
    { fieldId: id("deal.stage"), value: { kind: "select", value: stage.id } },
    {
      fieldId: notes.id,
      value: {
        kind: "richText",
        documentJson: JSON.stringify({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Previously stored notes" }] }],
        }),
      },
    },
  ]);
  const line = await create(
    page,
    current,
    id("lineItem"),
    [text(id("lineItem.name"), "Recovery line"), decimal(id("lineItem.quantity"), "1")],
    {
      links: [
        { relationId: id("lineItem.service"), direction: "outgoing", record: service },
        { relationId: id("lineItem.deal"), direction: "outgoing", record: deal },
      ],
    },
  );
  const receipts = async () =>
    (
      await database.query('SELECT COUNT(*)::integer AS count FROM "RecordMutationReceipt" WHERE "companyId"=$1', [
        companyId,
      ])
    ).rows[0].count;
  const persisted = async () => ({
    versions: (await database.query('SELECT id,version FROM "CrmRecord" WHERE "companyId"=$1 ORDER BY id', [companyId]))
      .rows,
    values: (
      await database.query(
        'SELECT "fieldId",trim_scale("decimalValue")::text AS amount FROM "RecordValue" WHERE "companyId"=$1 AND "recordId"=$2 AND "fieldId"=ANY($3::text[]) ORDER BY "fieldId"',
        [companyId, deal.recordId, [id("deal.totalValue"), id("deal.totalQuantity"), id("deal.weightedValue")]],
      )
    ).rows,
    links: (
      await database.query(
        'SELECT "relationId","sourceId","targetId" FROM "RecordLink" WHERE "companyId"=$1 ORDER BY "relationId"',
        [companyId],
      )
    ).rows,
  });
  let fault = false;
  await page.route("**/*", async (route) => {
    const args = nextArguments(route.request());
    if (fault && args?.length === 1 && JSON.stringify(args[0]) === JSON.stringify(deal)) {
      fault = false;
      await evidence.failResponse(route, "accepted nested parent refresh");
    } else await route.fallback();
  });
  await page.goto(`/en/records/${deal.typeId}/${deal.recordId}`);
  const main = page.getByRole("main");
  const embedded = main.getByRole("region", { name: "Line items", exact: true });
  const notesTab = main.getByRole("tab", { name: english.EntityDetail.sections.notes, exact: true });
  await notesTab.click();
  await expect(main.getByRole("textbox", { name: notes.label, exact: true })).toHaveText("Previously stored notes");
  await main.getByRole("tab", { name: english.EntityDetail.overview, exact: true }).click();
  const latestDeal = await post(page, "/api/v1/records/read", deal);
  await mutate(page, current, {
    action: "update",
    ref: deal,
    expectedVersion: latestDeal.version,
    fields: [{ fieldId: notes.id, value: null }],
  });
  await expect(main.locator(`[data-entity-field="${id("deal.totalValue")}"]`)).toContainText("€100.00");
  await embedded.getByRole("button", { name: "Recovery line", exact: true }).click();
  const child = page.getByRole("dialog");
  await child.getByRole("textbox", { name: "Quantity", exact: false }).fill("2");
  const before = await persisted();
  const beforeReceipts = await receipts();
  fault = true;
  await child.getByRole("button", { name: "Save", exact: true }).click();
  await expect(child).not.toBeVisible();
  const retry = main.getByRole("status").getByRole("button", { name: english.ErrorCard.retry, exact: true });
  await expect(retry).toBeVisible();
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).not.toBeEditable();
  await expect(main.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(embedded.getByRole("button", { name: "Add Line item", exact: true })).toHaveCount(0);
  const accepted = await persisted();
  expect(await receipts()).toBe(beforeReceipts + 1);
  expect(accepted.links).toEqual(before.links);
  expect(accepted.versions.find((row) => row.id === line.recordId)?.version).toBe(
    before.versions.find((row) => row.id === line.recordId)?.version + 1,
  );
  expect(Object.fromEntries(accepted.values.map((row) => [row.fieldId, row.amount]))).toEqual({
    [id("deal.totalValue")]: "200",
    [id("deal.totalQuantity")]: "2",
    [id("deal.weightedValue")]: "120",
  });
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).toBeEditable();
  await expect(main.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(main.locator(`[data-entity-field="${id("deal.totalValue")}"]`)).toContainText("€200.00");
  await expect(main.locator(`[data-entity-field="${id("deal.weightedValue")}"]`)).toContainText("€120.00");
  const row = embedded
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name: "Recovery line", exact: true }) });
  await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await notesTab.click();
  await expect(main.getByRole("textbox", { name: notes.label, exact: true })).toHaveText("");
  await expect(main.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(await receipts()).toBe(beforeReceipts + 1);
  expect(await persisted()).toEqual(accepted);
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(main.locator(`[data-entity-field="${id("deal.totalValue")}"]`)).toContainText("€200.00");
  expect(await persisted()).toEqual(accepted);
  await evidence.verify(testInfo, ["accepted nested parent refresh"]);
});
