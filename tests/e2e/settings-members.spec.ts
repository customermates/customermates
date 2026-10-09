import { randomUUID } from "node:crypto";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";
import { rowActionGroup, rowActionLabels, runRowAction } from "./record-rows";

test("the members row menu deletes another member through the guarded deactivation", async ({
  page,
  database,
  workspace,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message) && !message.text().startsWith("Failed to load resource"))
      errors.push(message.text());
  });
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
  await memberRow("Nora Second").hover();
  const inlineRemove = rowActionGroup(memberRow("Nora Second")).getByRole("button", { name: "Delete", exact: true });
  if (await inlineRemove.isVisible()) await expect(inlineRemove).toHaveAttribute("data-variant", /destructive/i);
  else {
    await memberRow("Nora Second").getByRole("button", { name: "More actions for Nora Second", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Delete", exact: true })).toHaveAttribute("data-variant", "destructive");
    await page.keyboard.press("Escape");
  }
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
