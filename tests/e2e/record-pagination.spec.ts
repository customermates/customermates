import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

test("returns to a valid relationship, path and embedded page after deleting its last row", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const id = (key: string) => presetId(companyId, key);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const modelResponse = await page.request.post("/api/v1/model/discover", { data: {} });
  expect(modelResponse.ok()).toBe(true);
  const model = RecordModelSchema.parse(await modelResponse.json());
  const type = model.types.find((candidate) => candidate.id === id("deal"));
  if (!type) throw new Error("The deal fixture type is missing");
  const pathId = randomUUID();
  await post("/api/v1/model/apply", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putType",
        type: {
          ...type,
          relationshipPaths: [
            ...(type.relationshipPaths ?? []),
            {
              id: pathId,
              label: "Connected organizations",
              archived: false,
              path: [{ relationId: id("deal.organizations"), direction: "outgoing" }],
            },
          ],
        },
      },
    ],
  });
  const create = async (kind: string, fields: unknown[], links: unknown[] = []) => {
    const result = await post("/api/v1/records/mutate", {
      expectedRevision: model.revision + 1,
      idempotencyKey: randomUUID(),
      mutation: { action: "create", typeId: id(kind), fields, links },
    });
    expect(result.status).toBe("completed");
    const created = result.refs.find((ref: { typeId: string }) => ref.typeId === id(kind));
    expect(created).toBeDefined();
    return created as { typeId: string; recordId: string };
  };
  const deal = await create("deal", [
    { fieldId: id("deal.name"), value: { kind: "text", value: "Pagination parent" } },
  ]);
  for (let index = 1; index <= 26; index += 1)
    await create(
      "organization",
      [
        {
          fieldId: id("organization.name"),
          value: { kind: "text", value: `Linked organization ${String(index).padStart(2, "0")}` },
        },
      ],
      [{ relationId: id("deal.organizations"), direction: "incoming", record: deal }],
    );
  const service = await create("service", [
    { fieldId: id("service.name"), value: { kind: "text", value: "Paged service" } },
    { fieldId: id("service.amount"), value: { kind: "decimal", value: "2", currency: "EUR" } },
  ]);
  for (let index = 1; index <= 11; index += 1)
    await create(
      "lineItem",
      [
        {
          fieldId: id("lineItem.name"),
          value: { kind: "text", value: `Paged line ${String(index).padStart(2, "0")}` },
        },
        { fieldId: id("lineItem.quantity"), value: { kind: "decimal", value: "1", currency: null } },
      ],
      [
        { relationId: id("lineItem.deal"), direction: "outgoing", record: deal },
        { relationId: id("lineItem.service"), direction: "outgoing", record: service },
      ],
    );
  await page.goto(`/en/records/${deal.typeId}/${deal.recordId}`);
  const main = page.getByRole("main");
  const direct = main.locator(`[data-entity-field="relationship:${id("deal.organizations")}:outgoing"]`);
  const projected = main.locator(`[data-entity-field="path:${pathId}"]`);
  await expect(direct.getByRole("button", { name: /^Open Linked organization/ })).toHaveCount(25);
  await expect(projected.getByRole("button", { name: /^Open Linked organization/ })).toHaveCount(25);
  await direct.getByRole("button", { name: "Next page", exact: true }).click();
  await projected.getByRole("button", { name: "Next page", exact: true }).click();
  const last = direct.getByRole("button", { name: /^Open Linked organization/ });
  await expect(last).toHaveCount(1);
  const title = (await last.getAttribute("aria-label"))?.replace(/^Open /, "");
  expect(title).toBeTruthy();
  await last.click();
  const editor = page.getByRole("dialog", { name: "Organization", exact: true });
  await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toHaveValue(title!);
  await editor.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect(editor).not.toBeVisible();
  await expect(direct.getByRole("button", { name: /^Open Linked organization/ })).toHaveCount(25);
  await expect(projected.getByRole("button", { name: /^Open Linked organization/ })).toHaveCount(25);
  await expect(direct.getByRole("button", { name: "Next page", exact: true })).toHaveCount(0);
  await expect(projected.getByRole("button", { name: "Next page", exact: true })).toHaveCount(0);
  expect(
    (
      await database.query(
        'SELECT COUNT(*)::integer AS count FROM "RecordLink" WHERE "companyId"=$1 AND "relationId"=$2 AND "sourceId"=$3 AND "deletedAt" IS NULL',
        [companyId, id("deal.organizations"), deal.recordId],
      )
    ).rows,
  ).toEqual([{ count: 25 }]);
  const embedded = main.getByRole("region", { name: "Line items", exact: true });
  await embedded.getByRole("button", { name: "Next page", exact: true }).click();
  const row = embedded.locator("tbody tr");
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /^Delete Paged line/ }).click();
  await page.getByRole("alertdialog").locator("#confirm-delete").click();
  await expect(embedded.locator("tbody tr")).toHaveCount(10);
  await expect(embedded.getByRole("button", { name: "Next page", exact: true })).toHaveCount(0);
  expect(
    (
      await database.query('SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND "deletedAt" IS NULL', [
        companyId,
        id("lineItem"),
      ])
    ).rows,
  ).toEqual([{ count: 10 }]);
  expect(
    (
      await database.query(
        'SELECT trim_scale("decimalValue")::text AS amount FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "recordId"=$3 AND "fieldId"=$4',
        [companyId, deal.typeId, deal.recordId, id("deal.totalValue")],
      )
    ).rows,
  ).toEqual([{ amount: "20" }]);
  await page.screenshot({
    path: testInfo.outputPath("valid-pages-after-last-row-deletion.png"),
    animations: "disabled",
  });
  await page.reload();
  await expect(direct.getByRole("button", { name: /^Open Linked organization/ })).toHaveCount(25);
  await expect(projected.getByRole("button", { name: /^Open Linked organization/ })).toHaveCount(25);
  await expect(embedded.locator("tbody tr")).toHaveCount(10);
  expect(errors).toEqual([]);
});
