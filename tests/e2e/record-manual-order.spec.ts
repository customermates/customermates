import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import englishMessages from "../../i18n/locales/en.json" with { type: "json" };

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function mutate(page: Page, mutation: unknown) {
  const model = RecordModelSchema.parse(await post(page, "/api/v1/model/discover", {}));
  return RecordOperationResultSchema.parse(
    await post(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation,
    }),
  );
}

test("sorts a list in manual order from display options and follows placements", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const id = (key: string) => presetId(companyId, key);
  const typeId = id("deal");
  await page.goto(`/en/records/${typeId}`);
  const deal = async (name: string) => {
    const result = await mutate(page, {
      action: "create",
      typeId,
      fields: [
        { fieldId: id("deal.name"), value: { kind: "text", value: name } },
        {
          fieldId: id("deal.stage"),
          value: { kind: "select", value: id("deal.stage.new") },
        },
      ],
    });
    if (result.status !== "completed") throw new Error("The deal must be created synchronously");
    const ref = result.refs.find((candidate) => candidate.typeId === typeId);
    if (!ref) throw new Error("The created deal reference is missing");
    return ref.recordId;
  };
  const first = await deal("Manual first");
  const second = await deal("Manual second");
  const third = await deal("Manual third");
  const names = new Map([
    [first, "Manual first"],
    [second, "Manual second"],
    [third, "Manual third"],
  ]);
  const rowOrder = () =>
    page
      .locator("[data-row-id]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-row-id")))
      .then((ids) => ids.filter((rowId) => rowId && names.has(rowId)).map((rowId) => names.get(rowId as string)));

  const sortSelect = page.getByRole("combobox", { name: englishMessages.Common.sort.field, exact: true });
  const manualOption = page.getByRole("option", { name: englishMessages.Common.sort.manual, exact: true });
  const openAppearance = () => page.getByRole("button", { name: "Appearance", exact: true }).click();
  const closeAppearance = async () => {
    if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
    else await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Appearance", exact: true })).not.toBeVisible();
  };
  const expectSortOptionsWithoutManual = async () => {
    await sortSelect.click();
    await expect(page.getByRole("option", { name: "Name", exact: true })).toBeVisible();
    await expect(manualOption).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option", { name: "Name", exact: true })).toHaveCount(0);
  };

  await page.reload();
  await openAppearance();
  await expectSortOptionsWithoutManual();
  await page.locator("#records-layout-board").click();
  await expectSortOptionsWithoutManual();
  await page.locator("#records-layout-table").click();
  await closeAppearance();

  await page.goto(`/en/records/${typeId}?sort=${encodeURIComponent("system:manual:asc")}`);
  await expect.poll(rowOrder).toEqual(["Manual third", "Manual second", "Manual first"]);
  await openAppearance();
  await expect(sortSelect).toContainText(englishMessages.Common.sort.manual);
  await expect(page.getByRole("button", { name: englishMessages.Common.sort.ascending, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: englishMessages.Common.sort.descending, exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("manual-order-display-options.png"), animations: "disabled" });
  await closeAppearance();

  const version = async (recordId: string) =>
    (await database.query('SELECT version FROM "CrmRecord" WHERE "companyId"=$1 AND id=$2', [companyId, recordId]))
      .rows[0].version as number;
  const before = await version(first);
  expect(
    (
      await mutate(page, {
        action: "update",
        ref: { typeId, recordId: first },
        expectedVersion: before,
        fields: [],
        placement: {},
      })
    ).status,
  ).toBe("completed");
  expect(await version(first)).toBe(before);
  expect(
    (
      await mutate(page, {
        action: "update",
        ref: { typeId, recordId: second },
        expectedVersion: await version(second),
        fields: [],
        placement: { afterRecordId: first, beforeRecordId: third },
      })
    ).status,
  ).toBe("completed");
  const queried = await post(page, "/api/v1/records/query", {
    typeId,
    sort: [{ fieldId: "system:manual", direction: "asc" }],
  });
  expect(
    (queried.records as Array<{ ref: { recordId: string } }>)
      .map((record) => names.get(record.ref.recordId))
      .filter(Boolean),
  ).toEqual(["Manual first", "Manual second", "Manual third"]);
  const descending = await page.request.post("/api/v1/records/query", {
    data: { typeId, sort: [{ fieldId: "system:manual", direction: "desc" }] },
  });
  expect(descending.status()).toBe(400);

  await page.reload();
  await expect.poll(rowOrder).toEqual(["Manual first", "Manual second", "Manual third"]);
  expect(errors).toEqual([]);
});
