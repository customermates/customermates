import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { deleteFromDrawer, openConfigure, openConfigureRow } from "./configure";
import { expect, test } from "./fixtures";

test("keeps an Untitled title column that opens the record after the only name field is deleted", async ({
  page,
  companyId,
}) => {
  const typeId = presetId(companyId, "organization");
  await openConfigure(page, typeId);
  await openConfigureRow(page, "Fields", "Name");
  await deleteFromDrawer(page, "Delete field");

  await page.goto(`/en/records/${typeId}`);
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Organization", exact: false })).toBeVisible();
  const title = table.locator('[data-slot="data-row-open"]').first();
  await expect(title).toHaveText("Untitled Organization");
  await title.click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}/[0-9a-f-]{36}$`));
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Untitled Organization");
});

test("shows Untitled on board cards after the only name field is deleted", async ({ page, companyId }) => {
  const typeId = presetId(companyId, "deal");
  await openConfigure(page, typeId);
  await openConfigureRow(page, "Fields", "Name");
  await deleteFromDrawer(page, "Delete field");

  const discover = await page.request.post("/api/v1/model/discover", { data: {} });
  expect(discover.ok()).toBe(true);
  const model = await discover.json();
  const created = await page.request.post("/api/v1/records/mutate", {
    data: {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId,
        fields: [{ fieldId: presetId(companyId, "deal.stage"), value: { kind: "select", value: presetId(companyId, "deal.stage.new") } }],
      },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);

  await page.goto(`/en/records/${typeId}?viewMode=card&groupBy=${presetId(companyId, "deal.stage")}`);
  const card = page.locator("[data-item-id]").first();
  await expect(card).toBeVisible();
  await expect(card).toContainText("Untitled Deal");
});
