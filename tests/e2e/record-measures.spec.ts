import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("keeps source totals separate from filtered widget groups across save and reload", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const dialogs = page.getByRole("dialog");
  const typeId = presetId(companyId, "service");
  await page.goto(`/en/records/${typeId}`);
  for (const [name, price] of [
    ["Shown service", "25"],
    ["Other service", "75"],
  ]) {
    await page.locator("#records-add").click();
    await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    await dialogs.getByRole("textbox", { name: "Price", exact: false }).fill(price);
    await dialogs.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialogs).not.toBeVisible();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await page.goto("/en/dashboard");
  await page.locator("#dashboard-add-widget").click();
  await dialogs.locator("#widget-kind-chart").click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Selected service prices");
  await dialogs.getByRole("combobox", { name: "Records from", exact: true }).click();
  await page.locator('[data-slot="popover-content"]').getByRole("combobox").fill("Services");
  await page.getByRole("option", { name: "Services", exact: true }).click();
  await dialogs.getByRole("combobox", { name: "Measure", exact: true }).click();
  await page.getByRole("option", { name: "Sum", exact: true }).click();
  await dialogs.getByRole("combobox", { name: "Value field", exact: false }).click();
  await page.getByRole("option", { name: "Price", exact: true }).click();
  await dialogs.getByRole("combobox", { name: "Group by", exact: true }).click();
  await page.getByRole("option", { name: "Each record", exact: true }).click();
  await expect(dialogs.getByRole("heading", { name: "Filters, none active", exact: true })).toBeVisible();
  const groupFilters = dialogs.getByRole("region", { name: "Group filters", exact: true });
  await groupFilters.getByRole("combobox", { name: "Add filter", exact: true }).click();
  await page.getByRole("option", { name: "Name", exact: true }).click();
  await groupFilters.getByRole("combobox", { name: "Condition", exact: true }).click();
  await page.getByRole("option", { name: "Equals", exact: true }).click();
  await groupFilters.getByLabel("Value", { exact: true }).fill("Shown service");
  await dialogs.getByRole("button", { name: "Preview measure", exact: true }).click();
  await expect(dialogs.getByText("Overall: €100.00", { exact: true })).toBeVisible();
  await expect(dialogs.locator("dt").filter({ hasText: "Shown service" })).toHaveCount(1);
  await expect(dialogs.locator("dt").filter({ hasText: "Other service" })).toHaveCount(0);
  await expect(dialogs.locator("dd").getByText("€25.00", { exact: true })).toHaveCount(1);
  await dialogs.locator("#widget-modal-save").click();
  await expect(dialogs).not.toBeVisible();
  const saved = await database.query('SELECT measure FROM "Widget" WHERE "companyId"=$1 AND name=$2', [
    companyId,
    "Selected service prices",
  ]);
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0].measure).toMatchObject({
    source: { typeId, filters: [] },
    aggregation: "sum",
    valueFieldId: presetId(companyId, "service.amount"),
    groupBy: {
      path: [],
      fieldId: null,
      filter: {
        filters: [
          {
            fieldId: presetId(companyId, "service.name"),
            operator: "eq",
            value: { kind: "text", value: "Shown service" },
          },
        ],
      },
    },
  });
  const records = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId],
  );
  expect(records.rows[0].count).toBe(2);
  await page.reload();
  const widget = page
    .locator('[data-uid="app-card"]')
    .filter({ has: page.getByRole("heading", { name: "Selected service prices", exact: true }) });
  await expect(widget.getByText("Overall: €100.00", { exact: true })).toBeVisible();
  await expect(widget.locator("dt").filter({ hasText: "Shown service" })).toHaveCount(1);
  await expect(widget.locator("dt").filter({ hasText: "Other service" })).toHaveCount(0);
  await expect(
    widget.getByText("Groups are filtered. The overall total includes all matching source records.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await widget.locator(".recharts-bar-rectangle path").first().boundingBox())?.height ?? 0)
    .toBeGreaterThan(100);
  await widget.screenshot({ path: testInfo.outputPath("filtered-widget-groups.png") });
  expect(errors).toEqual([]);
});
