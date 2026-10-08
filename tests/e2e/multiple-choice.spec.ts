import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { addFromConfigure, openConfigure, openDrawerTab, saveDrawer } from "./configure";
import { test, expect } from "./fixtures";

test("creates a multiple choice field and edits, filters, bulk edits and groups its values", async ({
  page,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const typeId = presetId(companyId, "organization");
  const suffix = randomUUID().slice(0, 6);
  const label = `Tags ${suffix}`;
  await openConfigure(page, typeId);
  await addFromConfigure(page, "Field");
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(label);
  await drawer.getByRole("combobox", { name: "Value type", exact: true }).click();
  await page.getByRole("option", { name: "Multiple choice", exact: true }).click();
  await expect(drawer.getByRole("combobox", { name: "Value type", exact: true })).toContainText("Multiple choice");
  await openDrawerTab(page, "Options");
  for (const [index, option] of ["Alpha", "Beta", "Gamma"].entries()) {
    await drawer.getByRole("button", { name: "Add option", exact: true }).click();
    await drawer.locator(`[id="options.${index}.label"]`).fill(option);
  }
  await drawer.locator('[id="options.0.color"]').click();
  await page.getByRole("option", { name: "Green", exact: true }).click();
  await saveDrawer(page);

  const model = RecordModelSchema.parse(await (await page.request.post("/api/v1/model/discover", { data: {}, timeout: 60000 })).json());
  const field = model.fields.find((candidate) => candidate.typeId === typeId && candidate.label === label);
  expect(field).toMatchObject({ valueType: "select", multiple: true });
  if (!field) throw new Error("The multiple choice field was not created");
  const optionId = (name: string) => field.options.find((option) => option.label === name)?.id ?? "";

  await page.goto(`/en/records/${typeId}`);
  const recordDrawer = page.getByRole("dialog", { name: "Organization", exact: true });
  const create = async (name: string, options: string[]) => {
    await page.locator("#records-add").click();
    await recordDrawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
    if (options.length) {
      await recordDrawer.getByRole("combobox", { name: label, exact: true }).click();
      for (const option of options) await page.getByRole("option", { name: option, exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(recordDrawer.getByRole("combobox", { name: label, exact: true })).toContainText(options.join(""));
    }
    await recordDrawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(recordDrawer).not.toBeVisible();
  };
  await create(`Both ${suffix}`, ["Alpha", "Beta"]);
  await create(`Inline ${suffix}`, []);

  const row = (name: string) => page.getByRole("row").filter({ hasText: name });
  const chips = (name: string) => row(name).locator('[data-slot="badge"]').filter({ hasText: /^(Alpha|Beta|Gamma)$/ });
  await expect(chips(`Both ${suffix}`).filter({ hasText: "Alpha" }).first()).toHaveAttribute("data-variant", "success");
  await expect(chips(`Both ${suffix}`).filter({ hasText: "Beta" }).first()).toBeVisible();

  await row(`Inline ${suffix}`).hover();
  await row(`Inline ${suffix}`).getByRole("button", { name: `Edit ${label}`, exact: true }).click();
  const editor = page.locator('[data-slot="popover-content"]').filter({ has: page.getByRole("combobox") });
  await editor.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: "Beta", exact: true }).click();
  await page.keyboard.press("Escape");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(chips(`Inline ${suffix}`).filter({ hasText: "Beta" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.locator(`[data-palette-field="${field.id}"]`).click();
  await page.locator(`[data-palette-value="${optionId("Alpha")}"]`).click();
  await page.locator(`[data-palette-value="${optionId("Beta")}"]`).click();
  await page.locator("[data-palette-operator-trigger]").click();
  await page.getByRole("menuitem", { name: "has all of", exact: true }).click();
  await page.locator("#filter-palette-back").click();
  await page.keyboard.press("Escape");
  await expect(row(`Both ${suffix}`)).toBeVisible();
  await expect(row(`Inline ${suffix}`)).toHaveCount(0);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("button", { name: "Remove filter", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(row(`Inline ${suffix}`)).toBeVisible();

  for (const name of [`Both ${suffix}`, `Inline ${suffix}`]) {
    const box = row(name).getByRole("checkbox", { name: /^Select row/ });
    await expect(async () => {
      await box.check();
      await expect(box).toBeChecked();
    }).toPass();
  }
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: "Gamma", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Apply to selected", exact: true }).click();
  for (const name of [`Both ${suffix}`, `Inline ${suffix}`]) {
    await expect(chips(name).filter({ hasText: "Gamma" }).first()).toBeVisible();
    await expect(chips(name).filter({ hasText: "Alpha" })).toHaveCount(0);
  }

  const grouped = await page.request.post("/api/v1/reports/query", {
    timeout: 60000,
    data: {
      source: { typeId },
      aggregation: "count",
      valueFieldId: null,
      groupBy: { fieldId: field.id, path: [] },
    },
  });
  expect(grouped.ok(), await grouped.text()).toBe(true);
  const counts = (await grouped.json()) as {
    groups: Array<{ label: { state: string; value?: { kind: string; value: string } }; result: unknown }>;
  };
  expect(
    counts.groups.find((group) => group.label.value?.kind === "select" && group.label.value.value === optionId("Gamma"))
      ?.result,
  ).toMatchObject({ state: "value", value: { kind: "decimal", value: "2" } });
  await page.screenshot({ path: testInfo.outputPath("multiple-choice.png"), animations: "disabled" });
});
