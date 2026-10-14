import { randomUUID } from "node:crypto";
import { collectPageErrors, expect, test } from "./fixtures";
import { openItemMenu } from "./item-actions";
import { rowActionLabels, runRowAction } from "./record-rows";

test("the members row menu deletes another member through the guarded deactivation", async ({
  page,
  database,
  workspace,
}) => {
  // The pending member's country flag loads from another origin, which the sandbox blocks; nothing else may fail.
  const errors = collectPageErrors(page);
  const role = await database.query('SELECT "roleId" FROM "User" WHERE id=$1', [workspace.userId]);
  const memberId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Nora\',\'Second\',\'active\',true,NOW(),\'en\',\'en\',NOW())',
    [memberId, workspace.companyId, role.rows[0].roleId, `second-${memberId}@example.test`],
  );

  const pendingId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId",email,"firstName","lastName",status,country,"updatedAt") VALUES ($1,$2,$3,\'Invited\',\'Member\',\'pendingAuthorization\',\'de\',NOW())',
    [pendingId, workspace.companyId, `pending-${pendingId}@example.test`],
  );

  await page.goto("/en/settings/members");
  const memberRow = (name: string) => page.getByRole("row").filter({ hasText: name });
  await expect(async () => {
    expect(await rowActionLabels(page, memberRow("Invited Member"), "Invited Member")).toEqual(["Open details"]);
  }).toPass();
  expect(await rowActionLabels(page, memberRow("Browser Administrator"), "Browser Administrator")).toEqual([
    "Open details",
  ]);
  expect(await rowActionLabels(page, memberRow("Nora Second"), "Nora Second")).toEqual(["Open details", "Delete"]);
  const member = page.getByRole("dialog");
  await runRowAction(page, memberRow("Browser Administrator"), "Browser Administrator", "Open details");
  await expect(member.locator("#member-modal-role")).toBeDisabled();
  await expect(member.locator("#member-modal-status")).toBeDisabled();
  await expect(member.locator("#member-modal-first-name")).toHaveAttribute("readonly", "");
  await page.keyboard.press("Escape");
  await expect(member).toHaveCount(0);
  await runRowAction(page, memberRow("Nora Second"), "Nora Second", "Open details");
  await expect(member.locator("#member-modal-role")).toBeEnabled();
  await expect(member.locator("#member-modal-status")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(member).toHaveCount(0);
  await openItemMenu(
    page,
    memberRow("Nora Second").getByRole("button", { name: "More actions for Nora Second", exact: true }),
  );
  await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toHaveAttribute("data-variant", "destructive");
  await page.keyboard.press("Escape");
  await runRowAction(page, memberRow("Nora Second"), "Nora Second", "Delete");

  const confirm = page.getByRole("alertdialog", { name: "Confirm Deletion" });
  await expect(confirm).toContainText("Nora Second is deactivated and loses access to this workspace.");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect
    .poll(async () => (await database.query('SELECT status FROM "User" WHERE id=$1', [memberId])).rows[0]?.status)
    .toBe("inactive");

  await expect(page.getByRole("row").filter({ hasText: "Nora Second" })).toContainText("Inactive");
  expect(await rowActionLabels(page, memberRow("Nora Second"), "Nora Second")).toEqual(["Open details"]);
  expect(errors).toEqual([]);
});
