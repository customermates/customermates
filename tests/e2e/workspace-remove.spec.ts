import germanMessages from "../../i18n/locales/de.json" with { type: "json" };
import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { mintApiKey } from "./api-key";
import { expectNotFoundDocuments } from "./browser-diagnostics";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { rowActionLabels, runRowAction } from "./record-rows";
import { openSidebar } from "./sidebar";
import { emailLanguage, emailLinks, emailText, sentEmailsTo } from "./transactional-mail";
import { removeBrowserWorkspace } from "./workspace";
import {
  addMembership,
  apiKeyRequest,
  approvalTaskCount,
  createNamedLogin,
  expectRefusedPageAction,
  inviteToken,
  loginEmail,
  memberItem,
  membershipIn,
  organizationList,
} from "./workspace-membership";
import {
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  setActiveWorkspace,
  signInLogin,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const REMOVE = "Remove from workspace";
const CONFIRM_REMOVE = "Remove";

test("the member dialog never offers removing yourself and explains why the last admin stays", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const mara = await createNamedLogin(database, "Mara Studio", "Mara", "Lenz");
  try {
    await addMembership(database, mara, workspace.companyId, {
      roleName: "Team lead",
      permissions: [
        { resource: "users", action: "readAll" },
        { resource: "users", action: "update" },
      ],
    });
    await page.goto("/en/settings/members");
    const own = memberItem(page, "Browser Administrator");
    await expect(async () => {
      expect(await rowActionLabels(page, own, "Browser Administrator")).toEqual(["Open details"]);
    }).toPass();
    expect(await rowActionLabels(page, memberItem(page, "Mara Lenz"), "Mara Lenz")).toEqual(["Open details", REMOVE]);
    await runRowAction(page, own, "Browser Administrator", "Open details");
    const ownDialog = page.getByRole("dialog", { name: "User", exact: true });
    await expect(ownDialog.locator("#member-modal-email")).toHaveValue(/@example\.test$/);
    await expect(
      ownDialog.getByText("To leave this workspace, use Leave workspace in General.", { exact: true }),
    ).toBeVisible();
    await expect(ownDialog.locator("#member-modal-remove")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`ws-remove-own-dialog-${testInfo.project.name}.png`) });
    await page.keyboard.press("Escape");
    await expect(ownDialog).toHaveCount(0);

    await setActiveWorkspace(database, mara, workspace.companyId);
    const lead = await signInLogin(browser, database, mara, testInfo);
    try {
      await lead.page.goto("/en/settings/members");
      await runRowAction(
        lead.page,
        memberItem(lead.page, "Browser Administrator"),
        "Browser Administrator",
        "Open details",
      );
      const member = lead.page.getByRole("dialog", { name: "User", exact: true });
      await expect(member.locator("#member-modal-email")).toHaveValue(/@example\.test$/);
      const remove = member.getByRole("button", { name: REMOVE, exact: true });
      await expect(remove).toHaveAttribute("aria-disabled", "true");
      await expect(member.locator("#member-modal-remove")).toBeDisabled();
      await remove.focus();
      await expect(lead.page.getByRole("tooltip")).toContainText(
        "Browser Administrator is the only active admin of this workspace. Make another active member an admin first.",
      );
      await lead.page.screenshot({
        path: testInfo.outputPath(`ws-remove-last-admin-${testInfo.project.name}.png`),
      });
      expect(await membershipIn(database, workspace.companyId, await loginEmail(database, workspace))).toMatchObject({
        status: "active",
        left: false,
      });
      expect(lead.errors).toEqual([]);
    } finally {
      await lead.close();
    }
  } finally {
    await removeBrowserWorkspace(database, mara);
  }
  expect(errors).toEqual([]);
});

test("removing a member who waits for approval declines the request and clears the approval task", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const petra = await createNamedLogin(database, "Petra Studio", "Petra", "Wolf");
  try {
    const email = await loginEmail(database, petra);
    const token = await inviteToken(database, { companyId: workspace.companyId, createdById: workspace.userId });
    const requester = await signInLogin(browser, database, petra, testInfo);
    try {
      await requester.page.goto(`/en/invitation/${token}`);
      await clickHydrated(requester.page.getByRole("button", { name: "Join workspace", exact: true }));
      await expect(requester.page).toHaveURL(/\/en\/auth\/pending$/);
      await expect.poll(() => approvalTaskCount(database, workspace.companyId, email)).toBe(1);

      await page.goto("/en/settings/members");
      const row = memberItem(page, "Petra Wolf");
      await expect(row).toContainText(englishMessages.Common.userStatuses.pendingAuthorization);
      await runRowAction(page, row, "Petra Wolf", REMOVE);
      const confirm = page.getByRole("alertdialog", { name: "Remove Petra Wolf from Browser workspace?" });
      await expect(confirm).toContainText("Petra Wolf is waiting for approval. Removing them declines the request.");
      await expect(confirm).toContainText(englishMessages.MemberRemoval.consequences.rejoin);
      await page.screenshot({ path: testInfo.outputPath(`ws-remove-pending-confirm-${testInfo.project.name}.png`) });
      await confirm.getByRole("button", { name: CONFIRM_REMOVE, exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(row).toContainText(englishMessages.WorkspaceMembership.left);
      expect(await membershipIn(database, workspace.companyId, email)).toMatchObject({
        status: "inactive",
        left: true,
      });
      expect(await approvalTaskCount(database, workspace.companyId, email)).toBe(0);
      expect(sentEmailsTo(email)).toEqual([]);

      await clickHydrated(
        requester.page.getByRole("button", { name: englishMessages.Common.actions.refresh, exact: true }),
      );
      await expect(requester.page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(requester.page, "Petra Studio");
      expect(requester.errors).toEqual([]);
    } finally {
      await requester.close();
    }
  } finally {
    await removeBrowserWorkspace(database, petra);
  }
  expect(errors).toEqual([]);
});

test("a removed member's API key for the workspace stops working while the key of their own workspace still works", async ({
  playwright,
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const rita = await createNamedLogin(database, "Rita Labs", "Rita", "Vogel");
  try {
    const membership = await addMembership(database, rita, workspace.companyId, { admin: true });
    const teamKey = await mintApiKey(
      database,
      { authUserId: rita.authUserId, companyId: workspace.companyId },
      "Rita in Browser workspace",
    );
    const ownKey = await mintApiKey(database, rita, "Rita in Rita Labs");
    expect(await apiKeyRequest(playwright, teamKey.key)).toEqual({ status: 200, id: membership.userId });
    expect(await apiKeyRequest(playwright, ownKey.key)).toEqual({ status: 200, id: rita.userId });

    await page.goto("/en/settings/members");
    await runRowAction(page, memberItem(page, "Rita Vogel"), "Rita Vogel", "Open details");
    const member = page.getByRole("dialog", { name: "User", exact: true });
    await expect(member.locator("#member-modal-email")).toHaveValue(/@example\.test$/);
    await clickHydrated(member.getByRole("button", { name: REMOVE, exact: true }));
    const confirm = page.getByRole("alertdialog", { name: "Remove Rita Vogel from Browser workspace?" });
    await expect(confirm).toContainText("Rita Vogel loses access to this workspace on every device.");
    for (const consequence of Object.values(englishMessages.MemberRemoval.consequences))
      await expect(confirm).toContainText(consequence);
    await page.screenshot({ path: testInfo.outputPath(`ws-remove-active-confirm-${testInfo.project.name}.png`) });
    await confirm.getByRole("button", { name: CONFIRM_REMOVE, exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(member).toHaveCount(0);
    await expect(memberItem(page, "Rita Vogel")).toContainText(englishMessages.WorkspaceMembership.left);

    const refused = await apiKeyRequest(playwright, teamKey.key);
    expect(refused.status).toBe(401);
    expect(await apiKeyRequest(playwright, ownKey.key)).toEqual({ status: 200, id: rita.userId });
    const keys = await database.query<{ id: string }>('SELECT id FROM "Apikey" WHERE "referenceId"=$1', [
      rita.authUserId,
    ]);
    expect(keys.rows).toEqual([{ id: ownKey.id }]);
  } finally {
    await removeBrowserWorkspace(database, rita);
  }
  expect(errors).toEqual([]);
});

test("a removed member gets one removal e-mail in their own language with a sign-in link", async ({
  page,
  database,
  workspace,
}, testInfo) => {
  test.skip(process.env.CRM_E2E_SERVER_MODE === "development", "next dev logs e-mails instead of sending them");
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  const rita = await createNamedLogin(database, "Rita Labs", "Rita", "Vogel");
  try {
    const email = await loginEmail(database, rita);
    await database.query('UPDATE "User" SET "displayLanguage"=\'de\' WHERE email=$1', [email]);
    await addMembership(database, rita, workspace.companyId, { admin: true });
    await page.goto("/en/settings/members");
    await runRowAction(page, memberItem(page, "Rita Vogel"), "Rita Vogel", REMOVE);
    const confirm = page.getByRole("alertdialog", { name: "Remove Rita Vogel from Browser workspace?" });
    await expect(confirm).toContainText(englishMessages.MemberRemoval.consequences.notified);
    await confirm.getByRole("button", { name: CONFIRM_REMOVE, exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(memberItem(page, "Rita Vogel")).toContainText(englishMessages.WorkspaceMembership.left);

    await expect.poll(() => sentEmailsTo(email).length).toBe(1);
    const [notice] = sentEmailsTo(email);
    const german = germanMessages.WorkspaceRemovalNotice;
    expect(notice).toMatchObject({
      to: [email],
      from: "Customermates <mail@customermates.test>",
      subject: german.subject.replace("{workspace}", "Browser workspace"),
    });
    expect(emailLanguage(notice)).toBe("de");
    const text = emailText(notice);
    for (const line of [
      german.greeting.replace("{firstName}", "Rita"),
      german.body.replace("{workspace}", "Browser workspace"),
      german.otherWorkspaces,
      german.rejoin.replace("{workspace}", "Browser workspace"),
    ])
      expect(text).toContain(line);
    expect(emailLinks(notice)).toContain(`${baseUrl}/auth/signin`);
    await page.screenshot({ path: testInfo.outputPath(`ws-remove-mail-${testInfo.project.name}.png`) });
    expect(sentEmailsTo(await loginEmail(database, workspace))).toEqual([]);
  } finally {
    await removeBrowserWorkspace(database, rita);
  }
  expect(errors).toEqual([]);
});

test("a member removed while a page is open meets the workspace-changed dialog and lands in their own workspace", async ({
  browser,
  page,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  const rita = await createNamedLogin(database, "Rita Labs", "Rita", "Vogel");
  try {
    await addMembership(database, rita, workspace.companyId, { admin: true });
    await setActiveWorkspace(database, rita, workspace.companyId);
    const removed = await signInLogin(browser, database, rita, testInfo);
    expectNotFoundDocuments(removed.page);
    const refused = expectRefusedPageAction(removed.page, organizationList(workspace.companyId));
    try {
      await removed.page.goto(organizationList(workspace.companyId));
      await expect(removed.page.getByText("Example organization", { exact: true }).first()).toBeVisible();
      await openSidebar(removed.page);
      await removed.page.waitForLoadState("networkidle");

      await page.goto("/en/settings/members");
      await runRowAction(page, memberItem(page, "Rita Vogel"), "Rita Vogel", REMOVE);
      await page
        .getByRole("alertdialog", { name: "Remove Rita Vogel from Browser workspace?" })
        .getByRole("button", { name: CONFIRM_REMOVE, exact: true })
        .click();
      await expect(memberItem(page, "Rita Vogel")).toContainText(englishMessages.WorkspaceMembership.left);

      await clickHydrated(removed.page.locator("#nav-workspace-menu"));
      const notice = removed.page.getByRole("alertdialog", { name: englishMessages.Workspaces.otherTab.titleChanged });
      await expect(notice).toBeVisible();
      await removed.page.screenshot({
        path: testInfo.outputPath(`ws-remove-stale-page-${testInfo.project.name}.png`),
      });
      await expect.poll(() => refused.some((status) => status >= 400)).toBe(true);
      await notice.getByRole("button", { name: englishMessages.Workspaces.otherTab.reload, exact: true }).click();

      await expect(removed.page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(removed.page, "Rita Labs");
      await removed.page.goto(organizationList(workspace.companyId));
      await expect(
        removed.page.getByRole("heading", { name: englishMessages.NotFoundPage.title, exact: true }),
      ).toBeVisible();
      expect(removed.errors).toEqual([]);
    } finally {
      await removed.close();
    }
  } finally {
    await removeBrowserWorkspace(database, rita);
  }
  expect(errors).toEqual([]);
});
