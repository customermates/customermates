import { randomUUID } from "node:crypto";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

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
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const role = await database.query('SELECT "roleId" FROM "User" WHERE id=$1', [workspace.userId]);
  const memberId = randomUUID();
  await database.query(
    'INSERT INTO "User" (id,"companyId","roleId",email,"firstName","lastName",status,"agreeToTerms","onboardingWizardCompletedAt","displayLanguage","formattingLocale","updatedAt") VALUES ($1,$2,$3,$4,\'Nora\',\'Second\',\'active\',true,NOW(),\'en\',\'en\',NOW())',
    [memberId, workspace.companyId, role.rows[0].roleId, `second-${memberId}@example.test`],
  );

  await page.goto("/en/settings/members");
  const ownMenu = page.getByRole("button", {
    name: "More actions for Browser Administrator",
    exact: true,
  });
  await ownMenu.click();
  await expect(page.getByRole("menuitem")).toHaveText(["Open details"]);
  await page.keyboard.press("Escape");

  const memberMenu = page.getByRole("button", {
    name: "More actions for Nora Second",
    exact: true,
  });
  await memberMenu.click();
  await expect(page.getByRole("menuitem")).toHaveText(["Open details", "Delete"]);
  const remove = page.getByRole("menuitem", { name: "Delete", exact: true });
  await expect(remove).toHaveAttribute("data-variant", "destructive");
  await remove.click();

  const confirm = page.getByRole("dialog").filter({ hasText: "Confirm Deletion" });
  await expect(confirm).toContainText("Nora Second is deactivated and loses access to this workspace.");
  await confirm.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect
    .poll(async () => (await database.query('SELECT status FROM "User" WHERE id=$1', [memberId])).rows[0]?.status)
    .toBe("inactive");

  await expect(page.getByRole("row").filter({ hasText: "Nora Second" })).toContainText("Inactive");
  await memberMenu.click();
  await expect(page.getByRole("menuitem")).toHaveText(["Open details"]);
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});
