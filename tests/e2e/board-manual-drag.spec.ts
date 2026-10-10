import { randomUUID } from "node:crypto";

import type { Locator, Page, TestInfo } from "@playwright/test";

import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { secondUser } from "./second-user";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function dragCard(page: Page, source: Locator, target: Locator, side: "above" | "below") {
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST" && (response.request().postData() ?? "").includes('"placement"'),
  );
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("Drag source and target must be visible");
  const y = side === "above" ? to.y + 6 : to.y + to.height - 6;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, y, { steps: 16 });
  await expect(page.locator("[data-kanban-placeholder]")).toHaveCount(1);
  await page.mouse.move(to.x + to.width / 2, y + (side === "above" ? -1 : 1), { steps: 2 });
  await page.mouse.up();
  expect((await saved).ok()).toBe(true);
}

async function openManualBoard(page: Page, typeId: string, testInfo: TestInfo) {
  await page.goto(`/en/records/${typeId}?sort=system%3Amanual%3Aasc`);
  await expect(page.locator("#records-add")).toBeEnabled();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.locator("#records-layout-board").click();
  if (testInfo.project.name === "mobile") await page.locator('[data-slot="drawer-close"]').click();
  else await page.keyboard.press("Escape");
  await expect(page.locator('[data-slot="kanban-root"]')).toBeVisible();
}

test("reorders board cards by dragging within and across columns in manual order, for every viewer", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Pointer dragging is covered on desktop; touch uses a long press");
  test.setTimeout(240000);
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
  const names = new Map<string, string>();
  const deal = async (name: string, stage: string) => {
    const model = RecordModelSchema.parse(await post(page, "/api/v1/model/discover", {}));
    const result = RecordOperationResultSchema.parse(
      await post(page, "/api/v1/records/mutate", {
        expectedRevision: model.revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId,
          fields: [
            { fieldId: id("deal.name"), value: { kind: "text", value: name } },
            { fieldId: id("deal.stage"), value: { kind: "select", value: id(`deal.stage.${stage}`) } },
          ],
        },
      }),
    );
    if (result.status !== "completed") throw new Error("The deal must be created synchronously");
    const ref = result.refs.find((candidate) => candidate.typeId === typeId);
    if (!ref) throw new Error("The created deal reference is missing");
    names.set(ref.recordId, name);
    return ref.recordId;
  };
  const alpha = await deal("Drag alpha", "new");
  const beta = await deal("Drag beta", "new");
  const gamma = await deal("Drag gamma", "new");
  const qualified = await deal("Drag qualified", "qualified");
  const column = (target: Page, stage: string) =>
    target.locator(`[data-group-key="value:${id(`deal.stage.${stage}`)}"]`);
  const card = (target: Page, recordId: string) => target.locator(`[data-item-id="${recordId}"]`);
  const order = (target: Page, stage: string) =>
    column(target, stage)
      .locator("[data-item-id]")
      .evaluateAll((cards) => cards.map((element) => element.getAttribute("data-item-id")))
      .then((ids) => ids.filter((recordId) => recordId && names.has(recordId)).map((recordId) => names.get(recordId!)));
  const stored = async (recordId: string) =>
    (await database.query('SELECT version FROM "CrmRecord" WHERE "companyId"=$1 AND id=$2', [companyId, recordId]))
      .rows[0].version as number;

  await openManualBoard(page, typeId, testInfo);
  await expect.poll(() => order(page, "new")).toEqual(["Drag gamma", "Drag beta", "Drag alpha"]);

  const alphaVersion = await stored(alpha);
  await dragCard(page, card(page, alpha), card(page, gamma), "above");
  await expect.poll(() => order(page, "new")).toEqual(["Drag alpha", "Drag gamma", "Drag beta"]);
  await page.reload();
  await expect.poll(() => order(page, "new")).toEqual(["Drag alpha", "Drag gamma", "Drag beta"]);
  expect(await stored(alpha)).toBe(alphaVersion);

  const betaVersion = await stored(beta);
  await dragCard(page, card(page, beta), card(page, qualified), "above");
  await expect.poll(() => order(page, "qualified")).toEqual(["Drag beta", "Drag qualified"]);
  await expect.poll(() => order(page, "new")).toEqual(["Drag alpha", "Drag gamma"]);
  await expect.poll(() => stored(beta)).toBe(betaVersion + 1);
  const stage = await database.query(
    'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "recordId"=$2 AND "fieldId"=$3',
    [companyId, beta, id("deal.stage")],
  );
  expect(stage.rows[0].textValue).toBe(id("deal.stage.qualified"));

  const other = await secondUser(browser, database, companyId, testInfo);
  try {
    await openManualBoard(other.page, typeId, testInfo);
    await expect.poll(() => order(other.page, "new")).toEqual(["Drag alpha", "Drag gamma"]);
    await expect.poll(() => order(other.page, "qualified")).toEqual(["Drag beta", "Drag qualified"]);
    expect(other.errors).toEqual([]);
  } finally {
    await other.close();
  }
  expect(errors).toEqual([]);
});
