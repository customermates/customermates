import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

async function revision(page: Page) {
  const response = await page.request.post("/api/v1/model/discover", { data: {} });
  expect(response.status()).toBe(200);
  return RecordModelSchema.parse(await response.json()).revision;
}

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const response = await page.request.post(path, { data: { expectedRevision: await revision(page), ...data } });
  expect(response.status(), await response.text()).toBe(200);
  return response;
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

test("rounds an average widget to the measured currency field's cents", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const errors = collectErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const prefix = `Avg ${randomUUID().slice(0, 6)}`;
  for (const [index, amount] of ["10", "20", "20"].entries()) {
    await post(page, "/api/v1/records/mutate", {
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id("service"),
        fields: [
          { fieldId: id("service.name"), value: { kind: "text", value: `${prefix} ${index}` } },
          { fieldId: id("service.amount"), value: { kind: "decimal", value: amount, currency: "EUR" } },
        ],
      },
    });
  }
  const name = `${prefix} average`;
  await post(page, "/api/v1/widgets/save", {
    idempotencyKey: randomUUID(),
    name,
    isTemplate: false,
    measure: {
      source: {
        typeId: id("service"),
        filters: [{ fieldId: id("service.name"), operator: "startsWith", value: { kind: "text", value: prefix } }],
        relationships: [],
      },
      aggregation: "average",
      valueFieldId: id("service.amount"),
      groupBy: null,
      groupLimit: 100,
    },
    displayOptions: { displayType: "number" },
    viewId: null,
  });

  await page.goto("/en/dashboard");
  const card = page.locator('[data-slot="card"]').filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card.locator('[data-slot="widget-number"]')).toContainText("€16.67");
  await expect(card).not.toContainText("16.666");
  expect(errors).toEqual([]);
});

test("shows a list ungrouped when a link groups it by a multiple choice field, which Group by never offers", async ({
  page,
  companyId,
}) => {
  test.setTimeout(180000);
  const errors = collectErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("contact");
  const roleId = randomUUID();
  const label = `Role ${roleId.slice(0, 6)}`;
  const options = ["Decision maker", "Champion"].map((option) => ({
    id: randomUUID(),
    label: option,
    color: null,
    attributes: [],
  }));
  await post(page, "/api/v1/model/apply", {
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: roleId,
          typeId,
          label,
          valueType: "select",
          multiple: true,
          behavior: { kind: "input" },
          required: false,
          archived: false,
          options,
          position: 40,
        },
      },
    ],
  });
  const contact = `Ada ${roleId.slice(0, 6)}`;
  await post(page, "/api/v1/records/mutate", {
    idempotencyKey: randomUUID(),
    mutation: {
      action: "create",
      typeId,
      fields: [
        { fieldId: id("contact.firstName"), value: { kind: "text", value: contact } },
        { fieldId: roleId, value: { kind: "selectList", value: options.map((option) => option.id) } },
      ],
    },
  });

  await page.goto(`/en/records/${typeId}?groupBy=${roleId}`);
  await expect(page.locator("#records-add")).toBeEnabled();
  await expect(page.getByText(contact, { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: englishMessages.Common.ariaLabels.tooltipFields, exact: true }).click();
  const groupBy = page.getByRole("combobox", { name: englishMessages.Common.table.groupBy, exact: true });
  await expect(groupBy).not.toContainText(label);
  await groupBy.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(page.getByRole("option", { name: label, exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
