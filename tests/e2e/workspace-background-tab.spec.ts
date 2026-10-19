import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { openSidebar } from "./sidebar";
import { addBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import { addMembership, createNamedLogin, recordSentryRequests, recordToasts } from "./workspace-membership";
import { uniqueWorkspaceName } from "./workspace-names";
import {
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  setActiveWorkspace,
  signInLogin,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const otherTab = englishMessages.Workspaces.otherTab;

async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((visibility) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => visibility === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

function recordDocumentNavigations(page: Page) {
  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
  });
  return navigations;
}

test("a member's background tab returning to a deleted workspace explains the deletion instead of switching silently", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const name = uniqueWorkspaceName("Projekt Süd");
  const second = await addBrowserWorkspace(database, workspace, name);
  if (e2eAppMode() === "cloud")
    await database.query(
      'UPDATE "Subscription" SET status=\'trial\',"trialEndDate"=NOW()+interval \'3 days\' WHERE "companyId"=$1',
      [second.companyId],
    );
  const ritaHome = uniqueWorkspaceName("Rita Labs");
  const rita = await createNamedLogin(database, ritaHome, "Rita", "Vogel");
  try {
    await addMembership(database, rita, second.companyId, {
      roleName: "Reader",
      permissions: [{ resource: "company", action: "readAll" }],
    });
    await setActiveWorkspace(database, rita, second.companyId);
    await setActiveWorkspace(database, workspace, second.companyId);
    const member = await signInLogin(browser, database, rita, testInfo);
    const toasts = await recordToasts(member.page);
    const sentry = recordSentryRequests(member.page);
    const sibling = await member.page.context().newPage();
    const siblingErrors = collectPageErrors(sibling);
    try {
      await member.page.goto("/en/dashboard");
      await openSidebar(member.page);
      await expectCurrentWorkspace(member.page, name);
      await sibling.goto("/en/settings/profile");
      await expect(sibling.getByRole("alertdialog")).toHaveCount(0);

      await setVisibility(member.page, "hidden");
      await setVisibility(sibling, "hidden");
      const navigations = recordDocumentNavigations(member.page);

      await page.goto("/en/settings/general");
      await clickHydrated(page.locator("#settings-general-delete"));
      const confirm = page.getByRole("alertdialog", { name: `Delete ${name}?` });
      await confirm.locator('[data-slot="confirm-dialog-confirmation"]').fill(name);
      await clickHydrated(confirm.locator("#settings-general-delete-confirm"));
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Browser workspace");

      await setVisibility(member.page, "visible");
      const notice = member.page.getByRole("alertdialog", { name: otherTab.titleDeleted });
      await expect(notice).toBeVisible({ timeout: 20_000 });
      await member.page.waitForTimeout(2_000);
      expect(navigations).toEqual([]);
      await expect(member.page).toHaveURL(/\/en\/dashboard$/);
      expect(await toasts()).toEqual([]);
      expect(sentry).toEqual([]);
      await member.page.screenshot({
        path: testInfo.outputPath(`ws-background-tab-deleted-${testInfo.project.name}.png`),
      });

      await notice.getByRole("button", { name: otherTab.reload, exact: true }).click();
      await expect(member.page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(member.page, ritaHome);

      await setVisibility(sibling, "visible");
      await expect(sibling.getByRole("alertdialog", { name: otherTab.titleDeleted })).toBeVisible({ timeout: 20_000 });
      await expect(
        sibling.getByRole("alertdialog", { name: otherTab.titleNamed.replace("{name}", ritaHome) }),
      ).toHaveCount(0);
      expect(member.errors).toEqual([]);
      expect(siblingErrors).toEqual([]);
    } finally {
      await member.close();
    }
  } finally {
    await removeBrowserWorkspace(database, rita);
  }
  expect(errors).toEqual([]);
});
