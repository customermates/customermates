import { randomUUID } from "node:crypto";
import { appPath, appUrlPattern } from "./app-paths";
import { collectPageErrors, expect, test } from "./fixtures";
import { runRowAction } from "./record-rows";
import { openMenu, openSidebar } from "./sidebar";
import { memberItem, workspaceMenu } from "./workspace-membership";

test("counts a member waiting for approval on the workspace menu and Members, and approves them there", async ({
  page,
  database,
  workspace,
}) => {
  // The pending member's country flag loads from another origin, which the sandbox blocks; nothing else may fail.
  const errors = collectPageErrors(page);
  const pendingId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId",email,"firstName","lastName",status,"updatedAt") VALUES ($1,$2,$3,\'Invited\',\'Member\',\'pendingAuthorization\',NOW())',
    [pendingId, workspace.companyId, `pending-${pendingId}@example.test`],
  );
  const records = async () =>
    (
      await database.query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1', [
        workspace.companyId,
      ])
    ).rows[0].count;
  const recordsBefore = await records();

  await page.goto(appPath(workspace.slug, "/dashboard"));
  await expect(workspaceMenu(page)).toHaveAttribute("aria-label", /, 1 member waiting for approval$/);
  const menu = await openMenu(page, "#nav-workspace-menu");
  const members = menu.getByRole("menuitem", { name: /^Members/ });
  await expect(members).toHaveText(/Members\s*1$/);
  await members.click();
  await expect(page).toHaveURL(appUrlPattern(workspace.slug, "/settings/members$"));

  await openSidebar(page, ["sidebar-trigger"]);
  await expect(page.locator("#nav-settings-members")).toHaveText(/Members\s*1$/);
  await page.keyboard.press("Escape");
  const row = memberItem(page, "Invited Member");
  await expect(row).toContainText("Waiting for approval");
  await runRowAction(page, row, "Invited Member", "Open details");
  const member = page.getByRole("dialog", { name: "User", exact: true });
  await member.locator("#member-modal-status").click();
  await page.getByRole("option", { name: "Active", exact: true }).click();
  await member.getByRole("button", { name: "Save", exact: true }).click();
  await expect(member).not.toBeVisible();
  await expect
    .poll(
      async () =>
        (await database.query('SELECT status FROM "User" WHERE "companyId"=$1 AND id=$2', [workspace.companyId, pendingId]))
          .rows[0]?.status,
    )
    .toBe("active");

  await page.goto(appPath(workspace.slug, "/dashboard"));
  await expect(workspaceMenu(page)).not.toHaveAttribute("aria-label", /waiting for approval/);
  expect(await records()).toBe(recordsBefore);
  expect(errors).toEqual([]);
});
