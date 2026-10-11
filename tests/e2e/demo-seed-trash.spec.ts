import type { Page } from "@playwright/test";

import { configureDrawer, confirmDeletion, openConfigure, openConfigureRow } from "./configure";
import { DEMO_COMPANY_ID, demoId, expect, test } from "./demo-seed";
import { runNamedRowAction } from "./record-rows";
import { openTrash, trashRow } from "./trash";

/**
 * The seeded Trash holds three records, a saved view and a field. Each one restores, then moves back to Trash, and
 * the spec puts the seeded deletion details back so the workspace ends as seeded.
 */
type TrashedItem = {
  kind: "record" | "view" | "field";
  label: string;
  typeId: string;
  targetId: string;
  deletedById: string;
  deletedAt: Date;
  expiresAt: Date;
  deletedBy: string;
};

const SEEDED = [
  { label: "Hansen Elevator Service (duplicate)", kind: "Record in Organizations", by: "Sofia Rossi" },
  { label: "Badge Scan", kind: "Record in Contacts", by: "Clara Neumann" },
  { label: "Call back about the cancelled pilot", kind: "Record in Tasks", by: "Marco Silva" },
  { label: "Q1 pipeline (old)", kind: "View in Deals", by: "Max Bergmann" },
  { label: "Legacy account ID", kind: "Field in Organizations", by: "Max Bergmann" },
];

async function restore(page: Page, label: string) {
  await openTrash(page);
  await expect(trashRow(page, label)).toBeVisible();
  await runNamedRowAction(page, trashRow(page, label), label, "Restore");
  // Records and views restore at once ("1 item restored"); a field restores in the background: Trash polls the
  // operation, reports "Restored" when it finished, and only then the item leaves Trash.
  const done = page.locator("[data-sonner-toast]").filter({ hasText: /1 item restored|Restored/ });
  await expect(done.first()).toBeVisible({ timeout: 180000 });
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Restore failed" })).toHaveCount(0);
  await expect(trashRow(page, label)).toHaveCount(0, { timeout: 180000 });
}

test("the seeded Trash lists records, a view and a field that restore and move back to Trash", async ({
  page,
  database,
  errors,
}) => {
  test.setTimeout(480000);
  const { rows: items } = await database.query<TrashedItem>(
    `SELECT t.kind::text AS kind, t.label, t."typeId", t."targetId", t."deletedById", t."deletedAt", t."expiresAt",
       concat(u."firstName", ' ', u."lastName") AS "deletedBy"
     FROM "TrashItem" t JOIN "User" u ON u.id=t."deletedById"
     WHERE t."companyId"=$1
       AND (t."targetId" LIKE '4d000000-%' OR t."targetId" LIKE '4d100000-%' OR t."targetId"=$2)
     ORDER BY t."targetId"`,
    [DEMO_COMPANY_ID, demoId("organization.legacyAccountId")],
  );
  expect(items.map(({ label }) => label).sort()).toEqual(SEEDED.map(({ label }) => label).sort());

  await openTrash(page);
  for (const seeded of SEEDED) {
    const row = trashRow(page, seeded.label);
    await expect(row, seeded.label).toBeVisible();
    await expect(row).toContainText(seeded.kind);
    await expect(row).toContainText(seeded.by);
    await expect(row).toContainText(/Deletes permanently in \d+ days?/);
  }

  try {
    for (const item of items) await restore(page, item.label);

    // Restored: the records open, the view is back on Deals and the field is back on Organizations.
    for (const item of items.filter(({ kind }) => kind === "record")) {
      await page.goto(`/en/records/${item.typeId}/${item.targetId}`);
      await expect(page.getByRole("main").getByText(item.label, { exact: true }).first()).toBeVisible();
    }
    const view = items.find(({ kind }) => kind === "view") as TrashedItem;
    await page.goto(`/en/records/${demoId("deal")}?view=${view.targetId}`);
    await expect(page.locator("[data-joins-top-bar]").getByText(view.label, { exact: true })).toBeVisible();
    const field = items.find(({ kind }) => kind === "field") as TrashedItem;
    await openConfigure(page, field.typeId);
    await openConfigureRow(page, "Fields", field.label);
    expect(errors).toEqual([]);
  } finally {
    // Back to Trash through the app, whatever restored above.
    const live = async (item: TrashedItem) =>
      (
        await database.query(`SELECT 1 FROM "TrashItem" WHERE "companyId"=$1 AND kind::text=$2 AND "targetId"=$3`, [
          DEMO_COMPANY_ID,
          item.kind,
          item.targetId,
        ])
      ).rowCount === 0;
    for (const item of items) {
      if (!(await live(item))) continue;
      if (item.kind === "record") {
        await page.goto(`/en/records/${item.typeId}/${item.targetId}`);
        await page.getByRole("main").getByRole("button", { name: "Delete", exact: true }).click();
        await confirmDeletion(page);
        // The app leaves the deleted record; wait for that before navigating on.
        await expect(page).not.toHaveURL(new RegExp(item.targetId));
      } else if (item.kind === "view") {
        await page.goto(`/en/records/${item.typeId}?view=${item.targetId}`);
        // The menu opens once the rail is interactive; retry the trigger until it does.
        const remove = page.getByRole("menuitem", { name: "Delete view", exact: true });
        await expect(async () => {
          if (!(await remove.isVisible())) await page.locator("#global-data-views-menu").click();
          await expect(remove).toBeVisible({ timeout: 1000 });
        }).toPass();
        await remove.click();
        await confirmDeletion(page);
      } else {
        await openConfigure(page, item.typeId);
        await openConfigureRow(page, "Fields", item.label);
        // Deleting the field also cleans it out of three seeded views, which takes a while on the demo workspace.
        await configureDrawer(page).getByRole("button", { name: "Delete field", exact: true }).click();
        const confirmation = page.getByRole("alertdialog");
        const confirm = confirmation.getByRole("button", { name: "Delete", exact: true });
        // The dialog lists the views it cleans up before Delete takes effect; click again only while it is idle.
        await expect(async () => {
          if (await confirm.isEnabled()) await confirm.click();
          await expect(confirmation).not.toBeVisible({ timeout: 30000 });
        }).toPass({ timeout: 240000 });
      }
      await expect.poll(() => live(item), { message: `${item.label} is back in Trash`, timeout: 180000 }).toBe(false);
    }
    // Keep the seeded story: who deleted each item and when.
    for (const item of items) {
      await database.query(
        `UPDATE "TrashItem" SET "deletedById"=$4, "deletedAt"=$5, "expiresAt"=$6
         WHERE "companyId"=$1 AND kind::text=$2 AND "targetId"=$3`,
        [DEMO_COMPANY_ID, item.kind, item.targetId, item.deletedById, item.deletedAt, item.expiresAt],
      );
      if (item.kind === "record")
        await database.query(
          `UPDATE "CrmRecord" SET "deletedAt"=$3 WHERE "companyId"=$1 AND id=$2 AND "deletedAt" IS NOT NULL`,
          [DEMO_COMPANY_ID, item.targetId, item.deletedAt],
        );
      if (item.kind === "view")
        await database.query(
          `UPDATE "DataView" SET "deletedAt"=$3 WHERE "companyId"=$1 AND id=$2 AND "deletedAt" IS NOT NULL`,
          [DEMO_COMPANY_ID, item.targetId, item.deletedAt],
        );
    }
  }
  await openTrash(page);
  for (const seeded of SEEDED) await expect(trashRow(page, seeded.label)).toContainText(seeded.by);
});
