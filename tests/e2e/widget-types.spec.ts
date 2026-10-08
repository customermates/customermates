import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";

import type { Locator, Page, TestInfo } from "@playwright/test";
import type { Client } from "pg";
import type { RecordMutation } from "../../features/records/record-query.schema";
import type { RecordRef } from "../../features/records/record-model.schema";

import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { presetId } from "../../features/records/crm-preset";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

const TIME_ZONE = "Europe/Berlin";
test.use({ timezoneId: TIME_ZONE });

const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 20 }).format(value);
const percent = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(value);

type DealSpec = {
  name: string;
  stage: "new" | "qualified" | "proposal" | "won" | "lost";
  close?: string;
  organization?: string;
  lines?: Array<["Consulting" | "Support", number]>;
};

const SERVICES = { Consulting: 1000, Support: 250.5 } as const;
const VALUED_DEALS: DealSpec[] = [
  { name: "Alpha expansion", stage: "won", close: "2026-01-15", organization: "Acme", lines: [["Consulting", 2]] },
  { name: "Beta renewal", stage: "won", close: "2026-01-28", organization: "Beta", lines: [["Support", 1]] },
  {
    name: "Gamma pilot",
    stage: "won",
    close: "2026-04-03",
    organization: "Acme",
    lines: [
      ["Consulting", 1],
      ["Support", 2],
    ],
  },
  { name: "Theta rollout", stage: "won", organization: "Gamma", lines: [["Support", 4]] },
  { name: "Delta proposal", stage: "proposal", organization: "Beta", lines: [["Consulting", 3]] },
  { name: "Epsilon qualification", stage: "qualified", organization: "Gamma", lines: [["Support", 1]] },
  { name: "Zeta lead", stage: "new", lines: [["Consulting", 1]] },
  { name: "Eta lost", stage: "lost", close: "2026-02-10", lines: [["Consulting", 5]] },
];
const DEALS: DealSpec[] = [
  ...VALUED_DEALS,
  ...Array.from({ length: 5 }, (_, index) => ({ name: `Open lead ${index + 1}`, stage: "new" as const })),
  ...Array.from({ length: 4 }, (_, index) => ({ name: `Open qualified ${index + 1}`, stage: "qualified" as const })),
  ...Array.from({ length: 3 }, (_, index) => ({ name: `Open proposal ${index + 1}`, stage: "proposal" as const })),
];
const dealValue = (deal: DealSpec) =>
  (deal.lines ?? []).reduce((sum, [service, quantity]) => sum + SERVICES[service] * quantity, 0);
const STAGES = ["new", "qualified", "proposal", "won", "lost"] as const;
const STAGE_LABELS = { new: "New", qualified: "Qualified", proposal: "Proposal", won: "Won", lost: "Lost" };
const TASK_STATUSES = [
  { id: "open", label: "Open" },
  { id: "progress", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "archived", label: "Archived" },
];

async function post(page: Page, path: string, data: unknown): Promise<unknown> {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function mutate(page: Page, mutation: Extract<RecordMutation, { action: "create" }>): Promise<RecordRef> {
  const model = RecordModelSchema.parse(await post(page, "/api/v1/model/discover", {}));
  const result = RecordOperationResultSchema.parse(
    await post(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation,
    }),
  );
  if (result.status !== "completed") throw new Error("The synthetic record mutation must complete synchronously");
  const ref = result.refs.find((candidate) => candidate.typeId === mutation.typeId);
  if (!ref) throw new Error("The synthetic record reference is missing");
  return ref;
}

async function seedPipeline(page: Page, database: Client, companyId: string, userId: string) {
  const id = (key: string) => presetId(companyId, key);
  const closeDateId = randomUUID();
  const statusId = randomUUID();
  const model = RecordModelSchema.parse(await post(page, "/api/v1/model/discover", {}));
  const field = (fieldId: string, typeId: string, label: string, valueType: string, options: object[] = []) => ({
    operation: "putField",
    field: {
      id: fieldId,
      typeId,
      label,
      valueType,
      behavior: { kind: "input" },
      required: false,
      archived: false,
      options,
      position: 40,
    },
  });
  await post(page, "/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      field(closeDateId, id("deal"), "Close date", "date"),
      field(
        statusId,
        id("task"),
        "Status",
        "select",
        TASK_STATUSES.map((status) => ({ ...status, color: null, attributes: [] })),
      ),
    ],
  });
  const role = await database.query('SELECT "roleId" FROM "User" WHERE id=$1', [userId]);
  const secondUserId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Nora\',\'Second\',\'active\',true,NOW(),\'en\',\'en\',NOW())',
    [secondUserId, companyId, role.rows[0].roleId, `second-${secondUserId}@example.test`],
  );
  const services = new Map<string, RecordRef>();
  for (const [name, price] of Object.entries(SERVICES)) {
    services.set(
      name,
      await mutate(page, {
        action: "create",
        typeId: id("service"),
        fields: [
          { fieldId: id("service.name"), value: { kind: "text", value: name } },
          { fieldId: id("service.amount"), value: { kind: "decimal", value: String(price), currency: "EUR" } },
        ],
      }),
    );
  }
  const organizations = new Map<string, RecordRef>();
  for (const name of ["Acme", "Beta", "Gamma"]) {
    organizations.set(
      name,
      await mutate(page, {
        action: "create",
        typeId: id("organization"),
        fields: [{ fieldId: id("organization.name"), value: { kind: "text", value: name } }],
      }),
    );
  }
  for (const deal of DEALS) {
    const organization = deal.organization ? organizations.get(deal.organization) : undefined;
    const ref = await mutate(page, {
      action: "create",
      typeId: id("deal"),
      fields: [
        { fieldId: id("deal.name"), value: { kind: "text", value: deal.name } },
        { fieldId: id("deal.stage"), value: { kind: "select", value: id(`deal.stage.${deal.stage}`) } },
        ...(deal.close ? [{ fieldId: closeDateId, value: { kind: "date" as const, value: deal.close } }] : []),
      ],
      ...(organization
        ? { links: [{ relationId: id("deal.organizations"), direction: "outgoing" as const, record: organization }] }
        : {}),
    });
    for (const [service, quantity] of deal.lines ?? []) {
      const serviceRef = services.get(service);
      if (!serviceRef) throw new Error(`The ${service} service is missing`);
      await mutate(page, {
        action: "create",
        typeId: id("lineItem"),
        fields: [
          { fieldId: id("lineItem.quantity"), value: { kind: "decimal", value: String(quantity), currency: null } },
        ],
        links: [
          { relationId: id("lineItem.deal"), direction: "outgoing", record: ref },
          { relationId: id("lineItem.service"), direction: "outgoing", record: serviceRef },
        ],
      });
    }
  }
  const tasks: Array<[string, string | null, string[]]> = [
    ["Call Acme", "open", [userId]],
    ["Prepare proposal", "progress", [userId, secondUserId]],
    ["Send invoice", "done", [userId]],
    ["Unassigned follow-up", "open", []],
    ["Old cleanup", "archived", [secondUserId]],
    ["Check renewal", "open", [secondUserId]],
    ["Plan workshop", null, [userId]],
  ];
  for (const [name, status, assignees] of tasks) {
    await mutate(page, {
      action: "create",
      typeId: id("task"),
      fields: [
        { fieldId: id("task.name"), value: { kind: "text", value: name } },
        ...(status ? [{ fieldId: statusId, value: { kind: "select" as const, value: status } }] : []),
      ],
      assignedUserIds: assignees,
    });
  }
  const values = await database.query(
    `SELECT name.\"textValue\" AS name, value.\"decimalValue\"::text AS value FROM "CrmRecord" deal
      JOIN "RecordValue" name ON name."companyId"=deal."companyId" AND name."recordId"=deal.id AND name."fieldId"=$2
      JOIN "RecordValue" value ON value."companyId"=deal."companyId" AND value."recordId"=deal.id AND value."fieldId"=$3
      WHERE deal."companyId"=$1 AND deal."typeId"=$4`,
    [companyId, id("deal.name"), id("deal.totalValue"), id("deal")],
  );
  expect(Object.fromEntries(values.rows.map((row) => [row.name, Number(row.value)]))).toEqual(
    Object.fromEntries(DEALS.map((deal) => [deal.name, dealValue(deal)])),
  );
  return { id, closeDateId, statusId, secondUserId };
}

function card(page: Page, name: string): Locator {
  return page.locator('[data-uid="app-card"]').filter({ has: page.getByRole("heading", { name, exact: true }) });
}

async function definitionList(widget: Locator) {
  const terms = await widget.locator("dl dt").allTextContents();
  const details = await widget.locator("dl dd").allTextContents();
  return terms.map((term, index) => [term, details[index]]);
}

async function rankedRows(widget: Locator) {
  return widget
    .locator('[data-slot="widget-ranked-table"] tbody tr')
    .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll("td, th")].map((cell) => cell.textContent)));
}

async function readWidget(database: Client, companyId: string, name: string) {
  const rows = await database.query(
    'SELECT id, measure, "displayOptions", version FROM "Widget" WHERE "companyId"=$1 AND name=$2',
    [companyId, name],
  );
  expect(rows.rows).toHaveLength(1);
  return rows.rows[0] as {
    id: string;
    measure: Record<string, unknown>;
    displayOptions: { displayType: string };
    version: number;
  };
}

async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole("dialog").getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function showTab(page: Page, name: "Data" | "Appearance") {
  await page.getByRole("dialog").getByRole("tab", { name, exact: true }).click();
}

async function startChart(page: Page, name: string, source: string) {
  const dialog = page.getByRole("dialog");
  await page.locator("#dashboard-add-widget").click();
  await dialog.locator("#widget-kind-chart").click();
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await dialog.getByRole("combobox", { name: "Records from", exact: true }).click();
  await page.locator('[data-slot="popover-content"]').getByRole("combobox").fill(source);
  await page.getByRole("option", { name: source, exact: true }).click();
}

async function openEditor(page: Page, name: string) {
  const opener = page.getByRole("button", { name: `Edit ${name}`, exact: true });
  await opener.focus();
  await opener.press("Enter");
  await expect(page.getByRole("dialog").getByRole("textbox", { name: "Name", exact: false })).toHaveValue(name);
}

async function save(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("#widget-modal-save").click();
  await expect(dialog).toHaveCount(0);
}

async function expectWholeTicks(widget: Locator, axis: "xAxis" | "yAxis") {
  const ticks = widget.locator(`.recharts-${axis}-tick-labels text`);
  await expect(ticks.first()).toBeVisible();
  const values = await ticks.allTextContents();
  expect(values.length).toBeGreaterThan(1);
  for (const value of values) expect(value, values.join(", ")).toMatch(/^\d+$/);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

async function keepShot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`);
  const viewport = page.viewportSize();
  if (viewport) await page.setViewportSize({ width: viewport.width, height: viewport.width < 600 ? 2600 : 1400 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  if (viewport) await page.setViewportSize(viewport);
  await mkdir(".runs/widget-shots", { recursive: true });
  await copyFile(path, `.runs/widget-shots/${testInfo.project.name}-${name}.png`);
}

test("builds, edits and renders number, time series, ranked table and funnel widgets from seeded records", async ({
  page,
  database,
  companyId,
  workspace,
  isMobile,
}, testInfo) => {
  test.setTimeout(420000);
  const errors = await trackErrors(page);
  const dialog = page.getByRole("dialog");
  await page.goto("/en/dashboard");
  const { id, closeDateId } = await seedPipeline(page, database, companyId, workspace.userId);
  const total = DEALS.reduce((sum, deal) => sum + dealValue(deal), 0);
  await page.reload();

  await test.step("offer only the display types the configuration supports", async () => {
    await startChart(page, "Pipeline total", "Deals");
    await selectOption(page, "Measure", "Sum");
    await dialog.getByRole("combobox", { name: "Value field", exact: false }).click();
    await page.getByRole("option", { name: "Value", exact: true }).click();
    const type = (displayType: string) => dialog.locator(`[id="display-type-${displayType}"]`);
    await showTab(page, "Appearance");
    await expect(type("number")).toBeEnabled();
    for (const displayType of ["areaChart", "rankedTable", "funnelChart"])
      await expect(type(displayType)).toBeDisabled();
    await expect(dialog.locator('label[for="display-type-areaChart"]')).toContainText(
      "Group by a date field and choose a time interval.",
    );
    await showTab(page, "Data");
    await selectOption(page, "Group by", "Stage");
    await showTab(page, "Appearance");
    await expect(type("number")).toBeDisabled();
    await expect(dialog.locator('label[for="display-type-number"]')).toContainText(
      "Set Group by to No grouping to show one number.",
    );
    await expect(type("funnelChart")).toBeEnabled();
    await expect(type("rankedTable")).toBeEnabled();
    await expect(type("areaChart")).toBeDisabled();
    await showTab(page, "Data");
    await expect(dialog.getByRole("combobox", { name: "Time interval", exact: true })).toHaveCount(0);
    await selectOption(page, "Group by", "No grouping");
    await showTab(page, "Appearance");
    await type("number").check();
    await expect(dialog.locator('[data-slot="widget-number"]')).toContainText(money(total));
    await save(page);
    const saved = await readWidget(database, companyId, "Pipeline total");
    expect(saved.displayOptions.displayType).toBe("number");
    expect(saved.measure).toMatchObject({
      source: { typeId: id("deal") },
      aggregation: "sum",
      valueFieldId: id("deal.totalValue"),
      groupBy: null,
    });
    const widget = card(page, "Pipeline total");
    await expect(widget.locator('[data-slot="widget-number"] p').first()).toHaveText(money(total));
    await expect(widget.locator('[data-slot="widget-number"]')).toContainText(`${DEALS.length} records`);
  });

  await test.step("bucket deals by close month, fill empty months and switch to quarters", async () => {
    await startChart(page, "Deals closed", "Deals");
    await selectOption(page, "Group by", "Close date");
    await selectOption(page, "Time interval", "Month");
    await showTab(page, "Appearance");
    await dialog.locator('[id="display-type-areaChart"]').check();
    await save(page);
    const saved = await readWidget(database, companyId, "Deals closed");
    expect(saved.displayOptions.displayType).toBe("areaChart");
    expect(saved.measure).toMatchObject({
      aggregation: "count",
      groupBy: { path: [], fieldId: closeDateId, dateInterval: "month", timeZone: TIME_ZONE },
      groupLimit: 1000,
    });
    const dated = DEALS.filter((deal) => deal.close);
    const months = ["2026-01", "2026-02", "2026-03", "2026-04"].map((month) => {
      const count = dated.filter((deal) => deal.close?.startsWith(month)).length;
      const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${month}-01T00:00:00Z`),
      );
      return [label, String(count)];
    });
    expect(months.map(([, count]) => count)).toEqual(["2", "1", "0", "1"]);
    const widget = card(page, "Deals closed");
    await expect(widget.locator("svg.recharts-surface")).toBeVisible();
    await expect.poll(() => definitionList(widget)).toEqual(months);
    await expectWholeTicks(widget, "yAxis");
    await expect(widget.locator(".recharts-xAxis-tick-labels text").first()).toHaveText("Jan 2026");
    await expect(widget.locator('[data-slot="widget-chart-notes"]')).toHaveText(
      `${DEALS.length - dated.length} records have no date and are not shown.`,
    );
    await openEditor(page, "Deals closed");
    await selectOption(page, "Time interval", "Quarter");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await readWidget(database, companyId, "Deals closed")).measure)
      .toMatchObject({ groupBy: { dateInterval: "quarter", timeZone: TIME_ZONE } });
    await expect
      .poll(() => definitionList(widget))
      .toEqual([
        ["Q1 2026", "3"],
        ["Q2 2026", "1"],
      ]);
    await expect(widget.locator(".recharts-xAxis-tick-labels text")).toHaveText(["Q1 2026", "Q2 2026"]);
    await expectWholeTicks(widget, "yAxis");
  });

  await test.step("rank every deal by value with shares and a truncation summary", async () => {
    await startChart(page, "Deal ranking", "Deals");
    await selectOption(page, "Measure", "Sum");
    await dialog.getByRole("combobox", { name: "Value field", exact: false }).click();
    await page.getByRole("option", { name: "Value", exact: true }).click();
    await selectOption(page, "Group by", "Each record");
    await showTab(page, "Appearance");
    await dialog.locator('[id="display-type-rankedTable"]').check();
    await save(page);
    expect((await readWidget(database, companyId, "Deal ranking")).displayOptions.displayType).toBe("rankedTable");
    const expected = [...DEALS]
      .sort((left, right) => dealValue(right) - dealValue(left) || left.name.localeCompare(right.name, "en-US"))
      .slice(0, 10)
      .map((deal, index) => [String(index + 1), deal.name, money(dealValue(deal)), percent(dealValue(deal) / total)]);
    const widget = card(page, "Deal ranking");
    await expect.poll(() => rankedRows(widget)).toEqual(expected);
    await expect(widget.getByText(`+ ${DEALS.length - 10} more`, { exact: true })).toBeVisible();
    await openEditor(page, "Deal ranking");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  await test.step("order forward stage steps with conversion and keep the lost stage outside", async () => {
    await startChart(page, "Stage funnel", "Deals");
    await selectOption(page, "Group by", "Stage");
    await showTab(page, "Appearance");
    await dialog.locator('[id="display-type-funnelChart"]').check();
    await save(page);
    const saved = await readWidget(database, companyId, "Stage funnel");
    expect(saved.displayOptions.displayType).toBe("funnelChart");
    expect(saved.measure).toMatchObject({ groupBy: { path: [], fieldId: id("deal.stage") } });
    const steps = STAGES.filter((stage) => stage !== "lost");
    const counts = steps.map((stage) => DEALS.filter((deal) => deal.stage === stage).length);
    const expected = steps.map((stage, index) => [
      STAGE_LABELS[stage],
      index === 0
        ? String(counts[index])
        : `${counts[index]} (${percent(counts[index] / counts[index - 1])} of the previous step)`,
    ]);
    const widget = card(page, "Stage funnel");
    await expect(widget.locator('[data-slot="widget-funnel"]')).toBeVisible();
    await expect.poll(() => definitionList(widget)).toEqual(expected);
    const rows = widget.locator('[data-slot="widget-funnel-step"]');
    await expect(rows).toHaveText([
      `New${counts[0]}`,
      `Qualified${counts[1]} · ${percent(counts[1] / counts[0])}`,
      `Proposal${counts[2]} · ${percent(counts[2] / counts[1])}`,
      `Won${counts[3]} · ${percent(counts[3] / counts[2])}`,
    ]);
    await expect(widget.locator('[data-slot="widget-chart-notes"]')).toHaveText(
      `Lost: ${DEALS.filter((deal) => deal.stage === "lost").length}, a lost stage shown outside the funnel.`,
    );
  });

  await page.reload();
  for (const name of ["Pipeline total", "Deals closed", "Deal ranking", "Stage funnel"])
    await expect(card(page, name)).toBeVisible();
  if (isMobile) await expectNoHorizontalOverflow(page);
  await keepShot(page, testInfo, "custom-widgets");
  expect(errors).toEqual([]);
});

test("adds every starter template resolved against the model and keeps them editable", async ({
  page,
  database,
  companyId,
  workspace,
  isMobile,
}, testInfo) => {
  test.setTimeout(420000);
  const errors = await trackErrors(page);
  const dialog = page.getByRole("dialog");
  await page.goto("/en/dashboard");
  const { id, closeDateId, statusId, secondUserId } = await seedPipeline(page, database, companyId, workspace.userId);
  await page.reload();
  const won = DEALS.filter((deal) => deal.stage === "won");
  const open = DEALS.filter((deal) => !["won", "lost"].includes(deal.stage));
  const wonTotal = won.reduce((sum, deal) => sum + dealValue(deal), 0);

  const templates = [
    { key: "openValueTotal", name: "Open Value", displayType: "number" },
    { key: "stageFunnel", name: "Deals by Stage", displayType: "funnelChart" },
    { key: "wonValueOverTime", name: "Won Value per month", displayType: "areaChart" },
    { key: "topRelatedByWonValue", name: "Top Organizations by won Value", displayType: "rankedTable" },
    { key: "openCountPerAssignee", name: "Open Tasks per assignee", displayType: "horizontalBarChart" },
  ];
  for (const template of templates) {
    await page.locator("#dashboard-add-widget").click();
    await expect(dialog.locator("#widget-gallery-heading")).toHaveText("Recommended for your data");
    await dialog.locator(`#widget-gallery-${template.key}`).click();
    await expect(dialog.getByRole("textbox", { name: "Name", exact: false })).toHaveValue(template.name);
    await showTab(page, "Appearance");
    await expect(dialog.locator(`[id="display-type-${template.displayType}"]`)).toBeChecked();
    await save(page);
    expect((await readWidget(database, companyId, template.name)).displayOptions.displayType).toBe(
      template.displayType,
    );
  }
  const select = (operator: string, values: string[]) => ({
    operator,
    value: null,
    values: values.map((value) => ({ kind: "select", value })),
  });
  expect((await readWidget(database, companyId, "Open Value")).measure).toMatchObject({
    source: {
      typeId: id("deal"),
      filters: [{ fieldId: id("deal.stage"), ...select("notIn", [id("deal.stage.won"), id("deal.stage.lost")]) }],
    },
    aggregation: "sum",
    valueFieldId: id("deal.totalValue"),
    groupBy: null,
  });
  expect((await readWidget(database, companyId, "Deals by Stage")).measure).toMatchObject({
    source: { filters: [{ fieldId: id("deal.stage"), ...select("notIn", [id("deal.stage.lost")]) }] },
    aggregation: "count",
    groupBy: { path: [], fieldId: id("deal.stage") },
  });
  expect((await readWidget(database, companyId, "Won Value per month")).measure).toMatchObject({
    source: { filters: [{ fieldId: id("deal.stage"), ...select("in", [id("deal.stage.won")]) }] },
    aggregation: "sum",
    groupBy: { path: [], fieldId: closeDateId, dateInterval: "month", timeZone: TIME_ZONE },
    groupLimit: 1000,
  });
  expect((await readWidget(database, companyId, "Top Organizations by won Value")).measure).toMatchObject({
    groupBy: { path: [{ relationId: id("deal.organizations"), direction: "outgoing" }], fieldId: null },
  });
  expect((await readWidget(database, companyId, "Open Tasks per assignee")).measure).toMatchObject({
    source: { typeId: id("task"), filters: [{ fieldId: statusId, ...select("notIn", ["done", "archived"]) }] },
    aggregation: "count",
    groupBy: { path: [], fieldId: "system:assignedTo" },
  });

  const pipeline = card(page, "Open Value");
  await expect(pipeline.locator('[data-slot="widget-number"] p').first()).toHaveText(
    money(open.reduce((sum, deal) => sum + dealValue(deal), 0)),
  );
  await expect(pipeline.locator('[data-slot="widget-number"]')).toContainText(`${open.length} records`);

  const stages = ["new", "qualified", "proposal", "won"] as const;
  const stageCounts = stages.map((stage) => DEALS.filter((deal) => deal.stage === stage).length);
  await expect
    .poll(() => definitionList(card(page, "Deals by Stage")))
    .toEqual(
      stages.map((stage, index) => [
        STAGE_LABELS[stage],
        index === 0
          ? String(stageCounts[0])
          : `${stageCounts[index]} (${percent(stageCounts[index] / stageCounts[index - 1])} of the previous step)`,
      ]),
    );

  const monthly = ["2026-01", "2026-02", "2026-03", "2026-04"].map((month) => [
    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00Z`),
    ),
    money(won.filter((deal) => deal.close?.startsWith(month)).reduce((sum, deal) => sum + dealValue(deal), 0)),
  ]);
  expect(monthly.map(([, value]) => value)).toEqual([money(2250.5), money(0), money(0), money(1501)]);
  const series = card(page, "Won Value per month");
  await expect.poll(() => definitionList(series)).toEqual(monthly);
  await expect(series.locator('[data-slot="widget-chart-notes"]')).toHaveText(
    `${won.filter((deal) => !deal.close).length} record has no date and is not shown.`,
  );

  const byOrganization = new Map<string, number>();
  for (const deal of won) {
    if (deal.organization)
      byOrganization.set(deal.organization, (byOrganization.get(deal.organization) ?? 0) + dealValue(deal));
  }
  const ranked = [...byOrganization]
    .sort((left, right) => right[1] - left[1])
    .map(([name, value], index) => [String(index + 1), name, money(value), percent(value / wonTotal)]);
  expect(ranked.map((row) => row[1])).toEqual(["Acme", "Gamma", "Beta"]);
  await expect.poll(() => rankedRows(card(page, "Top Organizations by won Value"))).toEqual(ranked);
  await expect(card(page, "Top Organizations by won Value")).toContainText(`Overall: ${money(wonTotal)}`);

  const tasks = card(page, "Open Tasks per assignee");
  await expect(tasks.locator("svg.recharts-surface")).toBeVisible();
  await expect
    .poll(async () => Object.fromEntries(await definitionList(tasks)))
    .toEqual({
      "Browser Administrator": "3",
      "Nora Second": "2",
      [englishMessages.Diagrams.noGroup]: "1",
    });
  expect(secondUserId).toBeTruthy();
  await expectWholeTicks(tasks, "xAxis");
  await expect(tasks).toContainText("Overall: 5");
  await expect(tasks).toContainText("A record can appear in several groups.");

  await openEditor(page, "Open Value");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).fill("Open deal count");
  await selectOption(page, "Measure", "Count");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const edited = await readWidget(database, companyId, "Open deal count");
  expect(edited.version).toBe(2);
  expect(edited.measure).toMatchObject({ aggregation: "count", valueFieldId: null, groupBy: null });
  await expect(card(page, "Open deal count").locator('[data-slot="widget-number"] p').first()).toHaveText(
    String(open.length),
  );

  await page.reload();
  for (const name of [
    "Open deal count",
    "Deals by Stage",
    "Won Value per month",
    "Top Organizations by won Value",
    "Open Tasks per assignee",
  ]) {
    const widget = card(page, name);
    await widget.scrollIntoViewIfNeeded();
    await expect(widget).toBeVisible();
    if (isMobile) {
      const bounds = await widget.boundingBox();
      expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= (page.viewportSize()?.width ?? 0)).toBe(true);
    }
  }
  if (isMobile) await expectNoHorizontalOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await keepShot(page, testInfo, "starter-widgets-light");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(card(page, "Won Value per month").locator("svg.recharts-surface")).toBeVisible();
  await keepShot(page, testInfo, "starter-widgets-dark");
  expect(errors).toEqual([]);
});
