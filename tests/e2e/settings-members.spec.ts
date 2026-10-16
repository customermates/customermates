import { randomUUID } from "node:crypto";
import { collectPageErrors, expect, test } from "./fixtures";
import { openItemMenu } from "./item-actions";
import { rowActionLabels, runRowAction } from "./record-rows";

test("the members row menu removes another member from the workspace after a confirmation", async ({
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
  const memberRow = (name: string) => page.locator("tr[data-row-id], li[data-row-id]").filter({ hasText: name });
  await expect(async () => {
    expect(await rowActionLabels(page, memberRow("Invited Member"), "Invited Member")).toEqual([
      "Open details",
      "Remove from workspace",
    ]);
  }).toPass();
  expect(await rowActionLabels(page, memberRow("Browser Administrator"), "Browser Administrator")).toEqual([
    "Open details",
  ]);
  expect(await rowActionLabels(page, memberRow("Nora Second"), "Nora Second")).toEqual([
    "Open details",
    "Remove from workspace",
  ]);
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
  await expect(page.getByRole("menuitem", { name: "Remove from workspace", exact: true })).toHaveAttribute(
    "data-variant",
    "destructive",
  );
  await page.keyboard.press("Escape");
  await runRowAction(page, memberRow("Nora Second"), "Nora Second", "Remove from workspace");

  const confirm = page.getByRole("alertdialog", { name: "Remove Nora Second from Browser workspace?" });
  await expect(confirm).toContainText("Nora Second loses access to this workspace on every device.");
  await expect(confirm).toContainText("Their API keys and AI connections for this workspace stop working.");
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await database.query('SELECT status::text,"leftAt" IS NOT NULL AS left FROM "User" WHERE id=$1', [memberId]))
          .rows[0],
    )
    .toEqual({ status: "inactive", left: true });

  await expect(memberRow("Nora Second")).toContainText("Left");
  expect(await rowActionLabels(page, memberRow("Nora Second"), "Nora Second")).toEqual(["Open details"]);
  expect(errors).toEqual([]);
});
