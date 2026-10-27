import { randomUUID } from "node:crypto";
import { test, expect, collectPageErrors } from "./fixtures";
import { postOk, readModel } from "./api";
import { presetId } from "../../features/records/crm-preset";
import { clickHydrated } from "./workspace-switching";
import { linkedRecordOpeners } from "./record-rows";
import { pagePath } from "./app-paths";

test("shows a relationship's linked records in a drawer table and opens them or the filtered list", async ({ page, database, companyId, isMobile }, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const organizationTypeId = presetId(companyId, "organization");
  const dealTypeId = presetId(companyId, "deal");
  const mutate = async (typeId: string, fieldId: string, name: string, links: object[] = []) => {
    const model = await readModel(database, companyId);
    return postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: { action: "create", typeId, fields: [{ fieldId, value: { kind: "text", value: name } }], links },
    });
  };
  await mutate(organizationTypeId, presetId(companyId, "organization.name"), "Drawer organization");
  const rows = await database.query('SELECT "recordId" FROM "RecordValue" WHERE "companyId"=$1 AND "fieldId"=$2 AND "textValue"=$3', [companyId, presetId(companyId, "organization.name"), "Drawer organization"]);
  const organizationId = rows.rows[0].recordId as string;
  for (let index = 1; index <= 30; index += 1) {
    await mutate(dealTypeId, presetId(companyId, "deal.name"), `Drawer deal ${String(index).padStart(2, "0")} with a long descriptive name`, [
      { relationId: presetId(companyId, "deal.organizations"), direction: "outgoing", record: { typeId: organizationTypeId, recordId: organizationId } },
    ]);
  }
  await page.goto(pagePath(page, `/records/${organizationTypeId}/${organizationId}`));
  const more = page.getByRole("button", { name: /^\+\d+ more$/ });
  await clickHydrated(more);
  const drawer = page.getByRole("dialog").filter({ has: page.locator("[data-linked-records]") });
  await expect(drawer.getByRole("heading", { name: "Deals", exact: true })).toBeVisible();
  await expect(drawer).toContainText("30 records linked to Drawer organization");
  await expect(drawer).toContainText("30 records");
  await expect(linkedRecordOpeners(drawer)).toHaveCount(25);
  await page.screenshot({ path: testInfo.outputPath("linked-records-drawer.png"), animations: "disabled" });
  if (!isMobile) {
    const firstLink = drawer.locator('a[data-slot="data-row-open"]').first();
    const firstDeal = (await firstLink.textContent())?.trim() ?? "";
    expect(firstDeal).toMatch(/^Drawer deal \d+/);
    await firstLink.click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("heading", { name: firstDeal, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
  }
  await clickHydrated(page.getByRole("button", { name: /^\+\d+ more$/ }));
  await drawer.getByRole("link", { name: "Open list", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${dealTypeId}\\?`));
  await expect(drawer).toHaveCount(0);
  await expect(page.getByText(isMobile ? /of 30/ : "1-25 of 30")).toBeVisible();
  expect(errors).toEqual([]);
});
