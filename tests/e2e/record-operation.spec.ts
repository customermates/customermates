import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { RecordQueryResultSchema } from "../../features/records/record-query-result.schema";

test("keeps complete application reads, History and a blocked form draft while a high-fan-out update publishes", async ({
  page,
  context,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const id = (key: string) => presetId(companyId, key);
  await page.goto(`/en/records/${id("service")}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Shared live catalogue price");
  await editor.getByRole("textbox", { name: "Price", exact: false }).fill("10");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  const service = (
    await database.query('SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2', [companyId, id("service")])
  ).rows[0].id;
  const deals = Array.from({ length: 600 }, () => randomUUID());
  const lines = deals.map(() => randomUUID());
  await database.query("BEGIN");
  try {
    for (const [kind, refs] of [
      ["deal", deals],
      ["lineItem", lines],
    ] as const) {
      await database.query(
        'INSERT INTO "CrmRecord" ("companyId","typeId",id,"updatedAt") SELECT $1,$2,ref,NOW() FROM UNNEST($3::text[]) ref',
        [companyId, id(kind), refs],
      );
      await database.query(
        'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","updatedAt") SELECT $1,$2,ref,$4,\'value\',$5::text || ordinal,1,NOW() FROM UNNEST($3::text[]) WITH ORDINALITY AS row(ref,ordinal)',
        [companyId, id(kind), refs, id(`${kind}.name`), kind === "deal" ? "Fan-out deal " : "Line "],
      );
      for (const [field, value, currency] of kind === "deal"
        ? [
            ["deal.totalValue", "10", "EUR"],
            ["deal.totalQuantity", "1", null],
          ]
        : [
            ["lineItem.quantity", "1", null],
            ["lineItem.effectivePrice", "10", "EUR"],
            ["lineItem.amount", "10", "EUR"],
          ]) {
        await database.query(
          'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"decimalValue",currency,"schemaRevision","updatedAt") SELECT $1,$2,ref,$4,\'value\',$5::numeric,$6,1,NOW() FROM UNNEST($3::text[]) ref',
          [companyId, id(kind), refs, id(field!), value, currency],
        );
      }
    }
    await database.query(
      'INSERT INTO "RecordValue" ("companyId","typeId","recordId","fieldId",state,"textValue","schemaRevision","updatedAt") SELECT $1,$2,ref,$4,\'value\',\'live\',1,NOW() FROM UNNEST($3::text[]) ref',
      [companyId, id("lineItem"), lines, id("lineItem.pricingMode")],
    );
    await database.query(
      'INSERT INTO "RecordLink" ("companyId",id,"relationId","sourceTypeId","sourceId","targetTypeId","targetId","updatedAt") SELECT $1,gen_random_uuid()::text,$2,$3,line,$4,deal,NOW() FROM UNNEST($5::text[],$6::text[]) AS row(line,deal)',
      [companyId, id("lineItem.deal"), id("lineItem"), id("deal"), lines, deals],
    );
    await database.query(
      'INSERT INTO "RecordLink" ("companyId",id,"relationId","sourceTypeId","sourceId","targetTypeId","targetId","updatedAt") SELECT $1,gen_random_uuid()::text,$2,$3,line,$4,$5,NOW() FROM UNNEST($6::text[]) line',
      [companyId, id("lineItem.service"), id("lineItem"), id("service"), service, lines],
    );
    for (const [kind, refs, field] of [
      ["lineItem", lines, "lineItem.effectivePrice"],
      ["lineItem", lines, "lineItem.amount"],
      ["deal", deals, "deal.totalValue"],
    ] as const)
      await database.query(
        'INSERT INTO "RecordValueDependency" ("companyId","typeId","recordId","fieldId","sourceTypeId","sourceId") SELECT $1,$2,ref,$4,$5,$6 FROM UNNEST($3::text[]) ref',
        [companyId, id(kind), refs, id(field), id("service"), service],
      );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }
  const snapshot = async () =>
    (
      await database.query(
        `SELECT s."activeOperationId",
    (SELECT trim_scale("decimalValue")::text FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4) AS price,
    (SELECT COUNT(*)::integer FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$5 AND "fieldId"=$6) AS count,
    (SELECT trim_scale(MIN("decimalValue"))::text FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$5 AND "fieldId"=$6) AS minimum,
    (SELECT trim_scale(MAX("decimalValue"))::text FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$5 AND "fieldId"=$6) AS maximum
    FROM "RecordSchemaState" s WHERE s."companyId"=$1`,
        [companyId, id("service"), service, id("service.amount"), id("deal"), id("deal.totalValue")],
      )
    ).rows[0];
  expect(await snapshot()).toEqual({ activeOperationId: null, price: "10", count: 600, minimum: "10", maximum: "10" });
  const draft = await context.newPage();
  await draft.goto(`/en/records/${id("deal")}/${deals[0]}`);
  await expect(draft.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  const name = draft.getByRole("main").getByRole("textbox", { name: "Name", exact: false });
  await name.fill("Retained during recalculation");
  await expect(draft.getByRole("main").getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  const errors: string[] = [];
  const expectedTransportErrors: string[] = [];
  let transportFaults = 0;
  for (const browserPage of [page, draft]) {
    browserPage.on("pageerror", (error) => {
      if (!isBenignPageError(error.message)) errors.push(error.message);
    });
    browserPage.on("console", (message) => {
      if (!isAppConsoleError(message)) return;
      if (
        browserPage === page &&
        transportFaults === 1 &&
        /^Failed to load resource:/.test(message.text()) &&
        /ERR_FAILED|network connection was lost|Load failed/.test(message.text())
      )
        expectedTransportErrors.push(message.text());
      else errors.push(message.text());
    });
  }
  await page.getByRole("button", { name: "Shared live catalogue price", exact: true }).click();
  await editor.getByRole("textbox", { name: "Price", exact: false }).fill("20");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByRole("status").filter({ hasText: "Existing data remains available" })).toBeVisible();
  const cancelledOperationId = (await snapshot()).activeOperationId;
  expect(cancelledOperationId).toBeTruthy();
  let faultArmed = true;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (
      faultArmed &&
      request.method() === "POST" &&
      request.headers()["next-action"] &&
      request.postData() === JSON.stringify([cancelledOperationId])
    ) {
      faultArmed = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      transportFaults += 1;
      await route.abort("failed");
    } else await route.continue();
  });
  await expect(
    editor.getByRole("alert").filter({ hasText: "Could not load progress. Your draft is retained." }),
  ).toBeVisible();
  expect(transportFaults).toBe(1);
  await editor.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(editor.getByRole("status").filter({ hasText: "Existing data remains available" })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
  await editor.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Cancel change", exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Cancel change", exact: true }).click();
  await expect(editor.getByText("The change was cancelled.", { exact: true })).toBeVisible();
  expect(await snapshot()).toEqual({ activeOperationId: null, price: "10", count: 600, minimum: "10", maximum: "10" });
  expect(
    (
      await database.query('SELECT state FROM "RecordOperation" WHERE "companyId"=$1 AND id=$2', [
        companyId,
        cancelledOperationId,
      ])
    ).rows,
  ).toEqual([{ state: "cancelled" }]);
  expect(
    (
      await database.query(
        'SELECT COUNT(*)::integer AS count FROM "RecordStageRow" WHERE "companyId"=$1 AND "operationId"=$2',
        [companyId, cancelledOperationId],
      )
    ).rows,
  ).toEqual([{ count: 0 }]);
  await editor.getByRole("button", { name: "Return to draft", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Price", exact: false })).toHaveValue("20");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor.getByRole("status").filter({ hasText: "Existing data remains available" })).toBeVisible();
  expect((await snapshot()).activeOperationId).toBeTruthy();
  expect((await snapshot()).activeOperationId).not.toBe(cancelledOperationId);
  await draft.getByRole("main").getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    draft.getByText(
      "The workspace is updating its data model. Your draft is preserved; try again when the update finishes.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(name).toHaveValue("Retained during recalculation");
  await draft.screenshot({ path: testInfo.outputPath("draft-during-recalculation.png"), animations: "disabled" });
  const readPage = await context.newPage();
  readPage.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  readPage.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const readMain = readPage.getByRole("main");
  const history = readMain.locator('[data-detail-panel="activities"]');
  let completeReads = 0;
  let applicationReadsDuringPause = 0;
  let historyReadsDuringPause = 0;
  const applicationReadFailures: string[] = [];
  const applicationReadTimings: number[] = [];
  const uiReadTimings: Array<{ surface: string; elapsedMs: number }> = [];
  try {
    const freshReadStarted = performance.now();
    const beforeFreshRead = await snapshot();
    expect(beforeFreshRead.activeOperationId).toBeTruthy();
    await readPage.goto(`/en/records/${id("service")}/${service}`);
    await expect(readPage.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
    await expect(readMain.getByRole("textbox", { name: "Price", exact: false })).toHaveValue("10");
    const loadedLine = readMain.getByRole("button", { name: /^Unlink Line [0-9]+$/ }).first();
    await loadedLine.scrollIntoViewIfNeeded();
    await expect(loadedLine).toBeVisible();
    await expect(readMain.locator('[aria-busy="true"]')).toHaveCount(0);
    await expect(readMain.getByRole("alert")).toHaveCount(0);
    uiReadTimings.push({
      surface: "fresh detail and linked-record choices",
      elapsedMs: performance.now() - freshReadStarted,
    });
    expect((await snapshot()).activeOperationId).toBe(beforeFreshRead.activeOperationId);
    await readPage.screenshot({
      path: testInfo.outputPath("fresh-relationship-choices-during-staging.png"),
      animations: "disabled",
    });

    const historyStarted = performance.now();
    if (!(await history.isVisible())) await readMain.getByRole("tab", { name: "Activities", exact: true }).click();
    await expect(history).toBeVisible();
    await expect(history.getByText("History", { exact: true })).toBeVisible();
    const creation = history.locator("ol").getByText("Browser Administrator", { exact: true });
    await expect(creation).toHaveCount(1);
    await creation.scrollIntoViewIfNeeded();
    await expect(creation).toBeVisible();
    await expect(history.locator('[data-skeleton-kind="activity-timeline"]')).toHaveCount(0);
    await expect(history.getByRole("status")).toHaveCount(0);
    await expect(history.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
    await expect(history.getByText("Activity could not be loaded.", { exact: true })).toHaveCount(0);
    await expect(history.getByText("No activity yet.", { exact: true })).toHaveCount(0);
    await creation.click();
    const historyDetail = readPage.getByRole("dialog", { name: /^Record created at / });
    await expect(historyDetail).toBeVisible();
    await expect(historyDetail.getByText("Shared live catalogue price", { exact: true }).first()).toBeVisible();
    const historicalPrice = historyDetail.getByText("€10.00", { exact: true });
    await historicalPrice.scrollIntoViewIfNeeded();
    await expect(historicalPrice).toBeVisible();
    await expect(historyDetail.getByText("€20.00", { exact: true })).toHaveCount(0);
    expect((await snapshot()).activeOperationId).toBe(beforeFreshRead.activeOperationId);
    historyReadsDuringPause += 1;
    uiReadTimings.push({ surface: "History and creation-event detail", elapsedMs: performance.now() - historyStarted });
    await readPage.screenshot({
      path: testInfo.outputPath("history-detail-during-staging.png"),
      animations: "disabled",
    });
    await readPage.keyboard.press("Escape");
    await expect(historyDetail).not.toBeVisible();
    await expect(history).toBeVisible();

    await expect
      .poll(
        async () => {
          const state = await snapshot();
          const started = performance.now();
          try {
            const response = await page.request.post("/api/v1/records/query", {
              data: { typeId: id("deal"), fields: [id("deal.totalValue")], page: 1, pageSize: 25 },
            });
            if (!response.ok()) applicationReadFailures.push(`HTTP ${response.status()}`);
            else {
              const result = RecordQueryResultSchema.parse(await response.json());
              const amounts = result.records.map((record) => {
                const value = record.fields.find((field) => field.fieldId === id("deal.totalValue"))?.result;
                return value?.state === "value" && value.value.kind === "decimal" && value.value.currency === "EUR"
                  ? value.value.value
                  : null;
              });
              if (
                result.total !== 600 ||
                result.records.length !== 25 ||
                new Set(amounts).size !== 1 ||
                !["10", "20"].includes(amounts[0] ?? "")
              )
                applicationReadFailures.push("Application snapshot is incomplete, mixed or incorrectly typed");
              const after = await snapshot();
              if (state.activeOperationId && after.activeOperationId === state.activeOperationId) {
                applicationReadsDuringPause += 1;
                if (amounts[0] !== "10")
                  applicationReadFailures.push("Paused application snapshot exposed staged values");
              }
              if (!state.activeOperationId && amounts[0] !== "20")
                applicationReadFailures.push("Completed application snapshot retained old values");
            }
            if ((await editor.getByRole("alert").count()) || (await readMain.getByRole("alert").count()))
              applicationReadFailures.push("Relationship choice or operation alert during staging");
            if (
              (await history.getByRole("status").count()) ||
              (await history.getByRole("button", { name: "Try again", exact: true }).count())
            )
              applicationReadFailures.push("History entered its error or retry state during staging");
          } catch (error) {
            applicationReadFailures.push(error instanceof Error ? error.message : "Application read request failed");
          } finally {
            applicationReadTimings.push(performance.now() - started);
          }
          expect(state.count).toBe(600);
          if (state.activeOperationId) {
            expect({ price: state.price, minimum: state.minimum, maximum: state.maximum }).toEqual({
              price: "10",
              minimum: "10",
              maximum: "10",
            });
            completeReads += 1;
            return false;
          }
          expect({ price: state.price, minimum: state.minimum, maximum: state.maximum }).toEqual({
            price: "20",
            minimum: "20",
            maximum: "20",
          });
          return true;
        },
        { timeout: 180000, intervals: [100, 250, 500, 1000] },
      )
      .toBe(true);
    expect(completeReads).toBeGreaterThan(0);
    expect(applicationReadsDuringPause).toBeGreaterThan(0);
    expect(historyReadsDuringPause).toBe(1);
    expect(applicationReadFailures).toEqual([]);
    await expect(history.getByRole("status")).toHaveCount(0);
    await expect(history.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  } catch (error) {
    applicationReadFailures.push(error instanceof Error ? error.message : "Staging verification failed");
    throw error;
  } finally {
    await writeFile(
      testInfo.outputPath("application-reads-during-staging.json"),
      JSON.stringify(
        {
          project: testInfo.project.name,
          records: 600,
          completeReads,
          applicationReadsDuringPause,
          historyReadsDuringPause,
          failures: applicationReadFailures,
          elapsedMs: applicationReadTimings,
          uiReads: uiReadTimings,
          transportFaults,
          expectedTransportErrors,
        },
        null,
        2,
      ),
    );
  }
  await expect(editor).not.toBeVisible({ timeout: 15000 });
  await expect(name).toHaveValue("Retained during recalculation");
  const persistedName = await database.query(
    'SELECT "textValue" FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
    [companyId, id("deal"), deals[0], id("deal.name")],
  );
  expect(persistedName.rows).toEqual([{ textValue: "Fan-out deal 1" }]);
  const operation = await database.query('SELECT state FROM "RecordOperation" WHERE "companyId"=$1 ORDER BY state', [
    companyId,
  ]);
  expect(operation.rows).toEqual([{ state: "cancelled" }, { state: "completed" }]);
  expect(errors).toEqual([]);
  expect(expectedTransportErrors.length).toBeLessThanOrEqual(1);
  await readPage.close();
  await draft.close();
});
