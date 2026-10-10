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
  await expect(page.getByRole("dialog")).toContainText("Untitled Organization");
});
