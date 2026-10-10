import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";

async function create(page: Page, mutation: Record<string, unknown>) {
  const model = RecordModelSchema.parse(await (await page.request.post("/api/v1/model/discover", { data: {} })).json());
  const response = await page.request.post("/api/v1/records/mutate", {
    data: {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: { action: "create", ...mutation },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const result = RecordOperationResultSchema.parse(await response.json());
  if (result.status !== "completed") throw new Error("The record must be created synchronously");
  return result.refs[0];
}

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  return errors;
}

test("phone rows load more per group until every record of the group is reachable", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const errors = trackErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("deal");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/records/${typeId}`);
  for (let index = 1; index <= 12; index++)
    await create(page, {
      typeId,
      fields: [
        { fieldId: id("deal.name"), value: { kind: "text", value: `Phone deal ${String(index).padStart(2, "0")}` } },
        { fieldId: id("deal.stage"), value: { kind: "select", value: id("deal.stage.new") } },
      ],
    });

  await page.goto(`/en/records/${typeId}?groupBy=${encodeURIComponent(id("deal.stage"))}`);
  const rows = page.locator("[data-phone-rows] [data-row-id]");
  await expect(rows).toHaveCount(10);
  const loadMore = page.locator("[data-phone-rows] [data-slot='group-load-more']").getByRole("button", {
    name: "Load more",
    exact: true,
  });
  await expect(loadMore).toBeVisible();
  await loadMore.click();
  await expect(rows).toHaveCount(12);
  await expect(page.locator("[data-phone-rows] [data-slot='group-load-more']")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("sub-list phone rows open the record on tap", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const errors = trackErrors(page);
  const id = (key: string) => presetId(companyId, key);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/en/records/${id("deal")}`);
  const deal = await create(page, {
    typeId: id("deal"),
    fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Phone parent deal" } }],
  });
  await create(page, {
    typeId: id("lineItem"),
    fields: [{ fieldId: id("lineItem.name"), value: { kind: "text", value: "Phone line" } }],
    links: [{ relationId: id("lineItem.deal"), direction: "outgoing", record: deal }],
  });

  await page.goto(`/en/records/${deal.typeId}/${deal.recordId}`);
  const lineItems = page.getByRole("region", { name: "Line items" });
  const row = lineItems.locator("[data-phone-rows] [data-row-id]");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Phone line");
  await row.getByRole("button", { name: "Open", exact: true }).click();
  const editor = page.getByRole("dialog");
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Phone line");
  expect(errors).toEqual([]);
});

test("the row action group sits on a solid surface on keyboard focus and on hover", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const errors = trackErrors(page);
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("deal");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/en/records/${typeId}`);
  await create(page, {
    typeId,
    fields: [{ fieldId: id("deal.name"), value: { kind: "text", value: "Surface deal" } }],
  });
  await page.reload();
  const row = page.locator("tr").filter({ has: page.getByRole("link", { name: "Surface deal", exact: true }) });
  const group = row.locator("[data-row-action-group]");
  const surface = () =>
    group.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, color: style.backgroundColor, image: style.backgroundImage };
    });

  await expect(page.locator("#records-add")).toBeEnabled();
  await row.hover();
  await expect.poll(async () => (await surface()).opacity).toBe("1");
  const hovered = await surface();
  expect(hovered.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(hovered.image).toContain("linear-gradient");
  await page.screenshot({ path: test.info().outputPath("row-actions-hover.png"), animations: "disabled" });

  await page.mouse.move(0, 0);
  await expect.poll(async () => (await surface()).opacity).toBe("0");
  await group.getByRole("button", { name: "Open details", exact: true }).focus();
  await expect.poll(async () => (await surface()).opacity).toBe("1");
  const focused = await surface();
  expect(focused.color).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: test.info().outputPath("row-actions-focus.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});
