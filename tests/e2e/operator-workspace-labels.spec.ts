import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";
import { openFilterPalette, pickPaletteField } from "./filter-palette";
import { addBrowserWorkspace, createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import { e2eAppMode, expectHydrated } from "./workspace-switching";

test("operator labels stay consistent through lists, modals, filters, exports, audit and deletion", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(e2eAppMode() !== "cloud", "The operator console is available in cloud mode only");
  test.setTimeout(240_000);
  await database.query('UPDATE "AuthUser" SET "isPlatformOperator"=true WHERE id=$1', [workspace.authUserId]);
  const owner = await createBrowserWorkspace(database);
  const email = `operator-labels-${randomUUID()}@gmail.com`;
  const emptyId = randomUUID();
  const month = new Date().toISOString().slice(0, 7);

  try {
    await database.query('UPDATE "User" SET email=$2 WHERE id=$1', [owner.userId, email]);
    await database.query('UPDATE "AuthUser" SET email=$2 WHERE id=$1', [owner.authUserId, email]);
    const second = await addBrowserWorkspace(database, owner);
    await database.query('UPDATE "Company" SET name=NULL WHERE id=ANY($1::text[])', [
      [owner.companyId, second.companyId],
    ]);
    await database.query('INSERT INTO "Company" (id,"createdByAuthUserId","updatedAt") VALUES ($1,$2,NOW())', [
      emptyId,
      owner.authUserId,
    ]);
    const firstLabel = `${email} · ${owner.companyId.slice(0, 8)}`;
    const secondLabel = `${email} · ${second.companyId.slice(0, 8)}`;
    const emptyLabel = emptyId.slice(0, 8);

    await test.step("workspace labels and modal use the same identity, including save confirmation", async () => {
      await page.goto("/en/operator/workspaces");
      await expectHydrated(page.locator("#operator-workspaces-filter"));
      for (const label of ["Browser workspace", firstLabel, secondLabel, emptyLabel])
        await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
      await page.getByText(firstLabel, { exact: true }).first().click();
      const modal = page.getByRole("dialog");
      await expect(modal).toContainText(owner.companyId);
      const title = modal.getByRole("heading", { name: firstLabel }).last();
      await expect(title).toBeVisible();
      await expect.poll(() => title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await testInfo.attach("operator-workspace-modal", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      await modal.locator("#operator-modal-tags").fill("operator-labels");
      await modal.locator("#operator-modal-tags").press("Enter");
      await modal.locator("#operator-modal-save").click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText(firstLabel);
      await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect
        .poll(async () => {
          const result = await database.query('SELECT tags FROM "Company" WHERE id=$1', [owner.companyId]);
          return result.rows[0].tags;
        })
        .toEqual(["operator-labels"]);
      await modal.getByRole("button", { name: "Close", exact: true }).click();
      await expect(modal).toBeHidden();
    });

    await test.step("user list, user modal and workspace filter distinguish workspaces of one owner", async () => {
      await page.goto("/en/operator/users");
      await expectHydrated(page.locator("#operator-users-filter"));
      await expect(page.getByText(firstLabel, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(secondLabel, { exact: true }).first()).toBeVisible();
      await page.getByText(firstLabel, { exact: true }).first().click();
      const label = page.getByRole("dialog").getByText(firstLabel, { exact: true });
      await expect(label).toBeVisible();
      await expect.poll(() => label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await testInfo.attach("operator-user-modal", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
      await expect(page.getByRole("dialog")).toBeHidden();

      await openFilterPalette(page, "operator-users-filter");
      await pickPaletteField(page, "workspaceId");
      await page.locator("#filter-palette-search").getByRole("combobox").fill(email);
      const option = page.getByRole("option").getByText(firstLabel, { exact: true });
      await expect(option).toBeVisible();
      await expect.poll(() => option.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(page.getByRole("option").getByText(secondLabel, { exact: true })).toBeVisible();
      await testInfo.attach("operator-workspace-filter", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      await page.getByRole("option").getByText(firstLabel, { exact: true }).click();
      await page.locator("#filter-palette-back").click();
      await expect(page.locator("[data-palette-field]").first()).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.locator("#filter-palette-search")).toHaveCount(0);
      await expect(page.getByText(firstLabel, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(secondLabel, { exact: true })).toHaveCount(0);
    });

    await test.step("usage page and its downloaded CSV identify every workspace", async () => {
      await page.goto("/en/operator/usage");
      await expectHydrated(page.locator("#operator-usage-page-month"));
      await page.getByRole("combobox", { name: "Month", exact: true }).click();
      const currentMonth = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(),
      );
      await page.getByRole("option").filter({ hasText: currentMonth }).click();
      const usage = page.locator("[data-operator-usage-page]");
      for (const label of ["Browser workspace", firstLabel, secondLabel, emptyLabel])
        await expect(usage.getByText(label, { exact: true }).first()).toBeVisible();
      await expect
        .poll(() =>
          usage.getByText(firstLabel, { exact: true }).evaluate((element) => {
            const container = element.closest('[data-slot="table-container"]');
            return (
              container !== null && element.getBoundingClientRect().right <= container.getBoundingClientRect().right
            );
          }),
        )
        .toBe(true);
      const downloadPromise = page.waitForEvent("download");
      await usage.getByRole("link", { name: "CSV file" }).click();
      const download = await downloadPromise;
      const path = await download.path();
      expect(path).not.toBeNull();
      const csv = await readFile(path!, "utf8");
      const [header, ...rows] = csv.trim().split(/\r?\n/);
      expect(header.split(",")).toContain("workspace_id");
      expect(header.split(",")).toContain("owner_email");
      expect(rows.find((row) => row.includes(owner.companyId))).toContain(firstLabel);
      expect(rows.find((row) => row.includes(owner.companyId))).toContain(email);
      expect(rows.find((row) => row.includes(second.companyId))).toContain(secondLabel);
      expect(rows.find((row) => row.includes(emptyId))).toContain(emptyLabel);
      await usage.getByText(firstLabel, { exact: true }).scrollIntoViewIfNeeded();
      await testInfo.attach("operator-usage", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
    });

    await test.step("audit rows show the same workspace label", async () => {
      await page.goto("/en/operator/audit");
      await expect(page.getByText(firstLabel, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Workspace tags updated", { exact: true })).toBeVisible();
    });

    await test.step("narrow workspace columns preserve the identifying suffix in every operator list", async () => {
      for (const section of ["workspaces", "users", "audit"]) {
        await page.goto(`/en/operator/${section}`);
        await expect(page.getByText(firstLabel, { exact: true }).first()).toBeVisible();
        const resize = page.getByRole("button", { name: /^Resize Workspace column\./ });
        await expectHydrated(resize);
        await resize.focus();
        await expect(resize).toBeFocused();
        await resize.press("Home");
        await expect.poll(() => resize.evaluate((element) => element.closest("th")?.style.width)).toBe("80px");
        await expect
          .poll(() =>
            page
              .getByText(firstLabel, { exact: true })
              .first()
              .evaluate((element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                const rects = Array.from(range.getClientRects());
                for (
                  let parent = element.parentElement;
                  parent && parent.tagName !== "TR";
                  parent = parent.parentElement
                ) {
                  if (!["hidden", "clip"].includes(getComputedStyle(parent).overflowX)) continue;
                  const bounds = parent.getBoundingClientRect();
                  if (rects.some((rect) => rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) return false;
                }
                return true;
              }),
          )
          .toBe(true);
        await page.getByText(firstLabel, { exact: true }).first().scrollIntoViewIfNeeded();
        await testInfo.attach(`operator-${section}-narrow-column`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      }
    });

    await test.step("deletion requires the selected workspace label and preserves its neighbour", async () => {
      await page.goto("/en/operator/workspaces");
      await expectHydrated(page.locator("#operator-workspaces-filter"));
      await page.getByText(firstLabel, { exact: true }).first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.locator("#operator-modal-delete").click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText(firstLabel);
      await confirm.locator("#operator-modal-reason").fill("Disposable operator browser fixture");
      const typed = confirm.locator('[data-slot="confirm-dialog-confirmation"]');
      const remove = confirm.getByRole("button", {
        name: "Delete",
        exact: true,
      });
      for (const wrong of ["gmail.com", email, secondLabel]) {
        await typed.fill(wrong);
        await expect(remove).toBeDisabled();
      }
      await typed.fill(firstLabel);
      await expect(remove).toBeEnabled();
      await testInfo.attach("operator-delete-confirmation", {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      await remove.click();
      await expect(confirm).toBeHidden();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect
        .poll(async () => {
          const result = await database.query('SELECT id FROM "Company" WHERE id=ANY($1::text[]) ORDER BY id', [
            [owner.companyId, second.companyId],
          ]);
          return result.rows.map((row) => row.id);
        })
        .toEqual([second.companyId]);
      await expect(page.getByText(secondLabel, { exact: true }).first()).toBeVisible();
      const history = await database.query(
        'SELECT "workspaceLabel" FROM "BillingUsageWorkspace" WHERE "companyId"=$1',
        [owner.companyId],
      );
      expect(history.rows[0].workspaceLabel).toBe(owner.companyId.slice(0, 8));
      await page.goto(`/en/operator/usage?month=${month}`);
      await expect(
        page.locator("[data-operator-usage-page]").getByText(owner.companyId.slice(0, 8), { exact: true }),
      ).toBeVisible();
      await expect(page.locator("[data-operator-usage-page]").getByText(firstLabel, { exact: true })).toHaveCount(0);
    });
  } finally {
    await database.query('DELETE FROM "OperatorAuditEvent" WHERE "actorUserId"=$1', [workspace.userId]);
    await database.query('DELETE FROM "BillingUsageInterval" WHERE "companyId"=$1', [owner.companyId]);
    await database.query('DELETE FROM "BillingUsageWorkspace" WHERE "companyId"=$1', [owner.companyId]);
    await removeBrowserWorkspace(database, owner);
  }
});

test("operator deletes an unnamed workspace whose owner email makes its label longer than 200 characters", async ({
  page,
  database,
  workspace,
}) => {
  test.skip(e2eAppMode() !== "cloud", "The operator console is available in cloud mode only");
  await database.query('UPDATE "AuthUser" SET "isPlatformOperator"=true WHERE id=$1', [workspace.authUserId]);
  const owner = await createBrowserWorkspace(database);
  const email = `${randomUUID()}${"a".repeat(28)}@${"b".repeat(63)}.${"c".repeat(63)}.example`;
  const label = `${email} · ${owner.companyId.slice(0, 8)}`;
  expect(label.length).toBeGreaterThan(200);
  try {
    await database.query('UPDATE "Company" SET name=NULL WHERE id=$1', [owner.companyId]);
    await database.query('UPDATE "User" SET email=$2 WHERE id=$1', [owner.userId, email]);
    await database.query('UPDATE "AuthUser" SET email=$2 WHERE id=$1', [owner.authUserId, email]);
    await page.goto("/en/operator/workspaces");
    await expectHydrated(page.locator("#operator-workspaces-filter"));
    await page.getByText(label, { exact: true }).first().click();
    const title = page.getByRole("dialog").getByRole("heading", { name: label }).last();
    await expect(title).toBeVisible();
    await expect.poll(() => title.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.locator("#operator-modal-delete").click();
    const confirm = page.getByRole("alertdialog");
    await confirm.locator("#operator-modal-reason").fill("Disposable long-label browser fixture");
    await confirm.locator('[data-slot="confirm-dialog-confirmation"]').fill(label);
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expect
      .poll(async () => {
        const result = await database.query('SELECT id FROM "Company" WHERE id=$1', [owner.companyId]);
        return result.rowCount;
      })
      .toBe(0);
  } finally {
    await database.query('DELETE FROM "OperatorAuditEvent" WHERE "actorUserId"=$1', [workspace.userId]);
    await database.query('DELETE FROM "BillingUsageInterval" WHERE "companyId"=$1', [owner.companyId]);
    await database.query('DELETE FROM "BillingUsageWorkspace" WHERE "companyId"=$1', [owner.companyId]);
    await removeBrowserWorkspace(database, owner);
  }
});
