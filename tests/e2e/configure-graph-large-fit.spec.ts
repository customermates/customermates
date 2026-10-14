import { randomUUID } from "node:crypto";

import { RecordModelSchema } from "../../features/records/record-model.schema";
import { expect, test, collectPageErrors } from "./fixtures";
import { readModel } from "./api";

test("Fit view includes all 128 lists on desktop and phone", async ({
  page,
  database,
  companyId,
  workspace,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const model = await readModel(database, companyId);
  const additions = Array.from({ length: 128 - model.types.length }, (_, index) => {
    const typeId = randomUUID();
    const fieldId = randomUUID();
    return {
      type: {
        id: typeId,
        label: `Fit list ${index}`,
        pluralLabel: `Fit lists ${index}`,
        description: "Large graph fitting fixture",
        icon: "box",
        primaryFieldId: fieldId,
        parentRelationshipId: null,
        embedded: false,
        navigationVisible: true,
        archived: false,
        position: model.types.length + index,
        relationshipPaths: [],
      },
      field: {
        id: fieldId,
        typeId,
        label: "Name",
        valueType: "text",
        behavior: { kind: "input" },
        required: false,
        archived: false,
        publishedSummary: false,
        options: [],
        position: 0,
      },
    };
  });
  const largeModel = RecordModelSchema.parse({
    ...model,
    types: [...model.types, ...additions.map(({ type }) => type)],
    fields: [...model.fields, ...additions.map(({ field }) => field)],
  });
  await database.query('UPDATE "RecordSchemaRevision" SET snapshot=$1 WHERE "companyId"=$2 AND revision=$3', [
    JSON.stringify(largeModel),
    companyId,
    model.revision,
  ]);

  await page.goto("/en/configure");
  for (const width of [1440, 390])
    for (const theme of ["light", "dark"] as const) {
      await database.query('UPDATE "User" SET theme=$1 WHERE id=$2', [theme, workspace.userId]);
      await page.evaluate((value) => localStorage.setItem("theme", value), theme);
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();
      const graph = page.locator("[data-configure-graph]");
      await expect(graph.locator("[data-configure-node]")).toHaveCount(128);
      await graph.getByRole("button", { name: "Fit view", exact: true }).click();
      await expect
        .poll(async () =>
          graph.evaluate((canvas) => {
            const bounds = canvas.getBoundingClientRect();
            return [...canvas.querySelectorAll<HTMLElement>("[data-configure-node]")].filter((node) => {
              const box = node.getBoundingClientRect();
              return (
                box.left < bounds.left - 1 ||
                box.top < bounds.top - 1 ||
                box.right > bounds.right + 1 ||
                box.bottom > bounds.bottom + 1
              );
            }).length;
          }),
        )
        .toBe(0);
      await page.screenshot({
        path: testInfo.outputPath(`large-fit-${width}-${theme}.png`),
        animations: "disabled",
      });
    }
  expect(errors).toEqual([]);
});
