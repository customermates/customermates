import { randomBytes, randomInt, randomUUID } from "node:crypto";

import type { APIRequestContext, Page, PlaywrightWorkerArgs } from "@playwright/test";
import type { Client } from "pg";

import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { mintApiKey } from "./api-key";
import { expectNotFoundDocuments } from "./browser-diagnostics";
import { collectPageErrors, expect, test } from "./fixtures";
import {
  changeProviderSubscription,
  checkoutsFor,
  deliverSubscriptionWebhook,
  startProviderSubscription,
  stubCheckoutPage,
} from "./lemonsqueezy";
import { localE2eEnvironment } from "./local-environment";
import { localLemonSqueezyVariants } from "./local-lemonsqueezy-provider.mjs";
import { runRowAction } from "./record-rows";
import { expectedAuthorization, routeSocialProvider } from "./social-sign-in";
import { emailLanguage, emailLinks, emailText, sentEmailsTo } from "./transactional-mail";
import { removeBrowserWorkspace } from "./workspace";
import { mcpWorkspaceName, restPost } from "./workspace-credentials";
import {
  addOrganization,
  apiKeyRequest,
  approvalTaskCount,
  createNamedLogin,
  loginEmail,
  memberItem,
  membershipIn,
  nameLogin,
  organizationList,
  readInvitationLink,
} from "./workspace-membership";
import { choosePlan, createApiKeyInSettings, createWorkspaceFromSettings, finishOnboarding } from "./workspace-setup";
import {
  clickHydrated,
  e2eAppMode,
  expectCurrentWorkspace,
  expectHydrated,
  openWorkspaceSwitcher,
  signInLogin,
  switcherWorkspaces,
} from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");
test.skip(process.env.CRM_E2E_SERVER_MODE === "development", "next dev logs e-mails instead of sending them");

const MEMBER = "Jonas Keller";
const INVITER = "Hoffmann Consulting";
const SECOND = "Keller Steuern";
const WikiPages = z.array(z.looseObject({ id: z.uuid(), title: z.string() }));
const WikiItems = z.looseObject({ items: z.array(z.looseObject({ id: z.string() })) });

async function workspaceIdNamed(database: Client, name: string) {
  const { rows } = await database.query<{ id: string }>('SELECT id FROM "Company" WHERE name=$1', [name]);
  if (rows.length !== 1) throw new Error(`Expected one workspace named ${name}`);
  return rows[0].id;
}

async function subscriptionOf(database: Client, companyId: string) {
  const { rows } = await database.query<{
    status: string;
    plan: string;
    lemonSqueezyId: string | null;
    trialEndDate: Date | null;
  }>('SELECT status::text,plan::text,"lemonSqueezyId","trialEndDate" FROM "Subscription" WHERE "companyId"=$1', [
    companyId,
  ]);
  return rows[0];
}

async function signInFromInvitation(page: Page, database: Client, link: string, login: { email: string; id: string }) {
  const { baseUrl } = localE2eEnvironment();
  await page.context().clearCookies();
  await page.goto(link);
  await expect(page).toHaveURL(/\/en\/auth\/signup\?intent=/);
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/auth\/signin\?intent=/);
  if (e2eAppMode() === "cloud") {
    const google = await routeSocialProvider(page, "google");
    const sub = String(randomInt(100_000_000, 999_999_999));
    google.signInAs({ sub, email: login.email, name: MEMBER, givenName: "Jonas", familyName: "Keller" });
    await clickHydrated(page.getByRole("button", { name: "Continue with Google", exact: true }));
    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    expect(google.authorizations).toEqual([{ ...expectedAuthorization("google", baseUrl), state: expect.any(String) }]);
    const linked = await database.query<{ userId: string }>(
      'SELECT "userId" FROM "AuthAccount" WHERE "providerId"=\'google\' AND "accountId"=$1',
      [sub],
    );
    expect(linked.rows).toEqual([{ userId: login.id }]);
  } else {
    const password = randomBytes(18).toString("base64url");
    await database.query(
      'INSERT INTO "AuthAccount" (id,"accountId","providerId","userId",password,"updatedAt") VALUES ($1,$2,\'credential\',$2,$3,NOW())',
      [randomUUID(), login.id, await hashPassword(password)],
    );
    await expectHydrated(page.locator("#email"));
    await page.locator("#email").fill(login.email);
    await page.locator("#password").fill(password);
    await clickHydrated(page.getByRole("button", { name: englishMessages.SignInForm.signInCta, exact: true }));
    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
  }
  await expect(page.getByRole("heading", { level: 1, name: `Join ${INVITER}`, exact: true })).toBeVisible();
  await expect(page.getByText(`Signed in as ${login.email}`, { exact: false })).toBeVisible();
}

async function createSecondWorkspace(page: Page, request: APIRequestContext, database: Client, email: string) {
  const cloud = e2eAppMode() === "cloud";
  if (cloud) await stubCheckoutPage(page);
  await createWorkspaceFromSettings(page, SECOND);
  const companyId = await workspaceIdNamed(database, SECOND);
  if (cloud) {
    await choosePlan(page, "Business");
    await expect.poll(() => checkoutsFor(companyId).length).toBe(1);
    const [checkout] = checkoutsFor(companyId);
    await expect(page).toHaveURL(checkout.url);
    expect(checkout).toMatchObject({
      variantId: localLemonSqueezyVariants.business,
      custom: { company_id: companyId },
      variantQuantities: [{ variant_id: Number(localLemonSqueezyVariants.business), quantity: 1 }],
    });
    const paid = startProviderSubscription(companyId, "business", 1, { name: MEMBER, email });
    await page.goto(checkout.redirectUrl as string);
    await expect(page).toHaveURL(/\/en\/subscription-expired$/);
    await deliverSubscriptionWebhook(request, "subscription_created", paid);
    await deliverSubscriptionWebhook(request, "subscription_updated", changeProviderSubscription(paid.id, {}));
    expect(await subscriptionOf(database, companyId)).toMatchObject({
      status: "active",
      plan: "business",
      lemonSqueezyId: paid.id,
    });
    await page.reload();
  }
  await finishOnboarding(page);
  await expectCurrentWorkspace(page, SECOND);
  return companyId;
}

async function switchTo(page: Page, companyId: string, name: string) {
  const menu = await openWorkspaceSwitcher(page);
  await menu.locator(`[data-workspace-id="${companyId}"]`).click();
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, name);
}

async function joinByLink(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: `Join ${INVITER}`, exact: true })).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: englishMessages.WorkspaceInvitation.join.action, exact: true }));
  await expect(page).toHaveURL(/\/en\/auth\/pending$/);
}

async function approve(admin: Page, email: string) {
  await admin.goto("/en/settings/members");
  const row = memberItem(admin, MEMBER);
  await expect(row).toContainText(englishMessages.Common.userStatuses.pendingAuthorization);
  await runRowAction(admin, row, MEMBER, "Open details");
  const member = admin.getByRole("dialog", { name: "User", exact: true });
  await expect(member.locator("#member-modal-email")).toHaveValue(email);
  await member.locator("#member-modal-role").click();
  await admin.getByRole("option", { name: "Admin", exact: true }).click();
  await member.locator("#member-modal-status").click();
  await admin.getByRole("option", { name: "Active", exact: true }).click();
  await member.getByRole("button", { name: "Save", exact: true }).click();
  await expect(member).not.toBeVisible();
}

async function enterApprovedWorkspace(page: Page) {
  await clickHydrated(page.getByRole("button", { name: englishMessages.Common.actions.refresh, exact: true }));
  await expect(page).toHaveURL(/\/en\/dashboard$/);
  await expectCurrentWorkspace(page, INVITER);
}

async function wikiPageIds(playwright: PlaywrightWorkerArgs["playwright"], key: string) {
  const listed = await restPost(playwright, key, "/v1/wiki/list", { pageSize: 100 });
  expect(listed.status).toBe(200);
  return WikiItems.parse(listed.body).items.map(({ id }) => id);
}

async function createWikiPage(
  playwright: PlaywrightWorkerArgs["playwright"],
  key: string,
  page: { title: string; markdown: string },
) {
  const created = await restPost(playwright, key, "/v1/wiki/create", { pages: [page] });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  return WikiPages.parse(created.body)[0];
}

async function expectWikiPage(page: Page, pageId: string, text: string) {
  await page.goto(`/en/wiki?page=${pageId}`);
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
}

async function expectWikiPageUnavailable(page: Page, pageId: string, text: string) {
  await page.goto(`/en/wiki?page=${pageId}`);
  await expect(page.getByText(englishMessages.Wiki.unavailableTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(text, { exact: false })).toHaveCount(0);
}

test("one person is invited, signs in, pays for a second workspace, keeps every workspace apart, asks to join, withdraws, is approved, removed with an e-mail, leaves and is invited again", async ({
  browser,
  playwright,
  page,
  request,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(1_500_000);
  const cloud = e2eAppMode() === "cloud";
  const shot = (target: Page, name: string) =>
    target.screenshot({ path: testInfo.outputPath(`ws-full-journey-${name}-${testInfo.project.name}.png`) });
  const errors = collectPageErrors(page);
  expectNotFoundDocuments(page);
  const { baseUrl } = localE2eEnvironment();
  await nameLogin(database, workspace, "Jonas", "Keller");
  const email = await loginEmail(database, workspace);
  if (cloud)
    await database.query(
      "UPDATE \"Subscription\" SET status='trial',\"trialEndDate\"=date_trunc('second',NOW()+interval '5 days') WHERE \"companyId\"=$1",
      [workspace.companyId],
    );
  const firstPlan = await subscriptionOf(database, workspace.companyId);
  const hoffmann = await createNamedLogin(database, INVITER, "Anna", "Hoffmann");
  const annaEmail = await loginEmail(database, hoffmann);
  try {
    const admin = await signInLogin(browser, database, hoffmann, testInfo);
    try {
      const membership = () => membershipIn(database, hoffmann.companyId, email);

      const link = await readInvitationLink(admin.page);
      await signInFromInvitation(page, database, link, { email, id: workspace.authUserId });
      expect(await membership()).toBeNull();
      await shot(page, "signed-in-join-card");

      await page.goto("/en/dashboard");
      await expectCurrentWorkspace(page, "Browser workspace");
      const keller = await createSecondWorkspace(page, request, database, email);
      await shot(page, "second-workspace");
      if (cloud) {
        await page.goto("/en/settings/billing");
        const plan = page.getByRole("textbox", { name: englishMessages.Subscription.plan, exact: true });
        await expect(plan).toContainText("Business");
        await expect(plan).toContainText("Active");
        await expect(page.locator("#settings-billing-plan-picker")).toHaveCount(0);
      }
      expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstPlan);
      const kellerMember = await membershipIn(database, keller, email);

      await page.goto(organizationList(keller));
      await addOrganization(page, "Steuerkanzlei Keller");
      const kellerKey = await createApiKeyInSettings(page, SECOND, "Keller Steuern sync");
      const checklistText = "Belege bis Ende Mai an die Kanzlei geben.";
      const checklist = await createWikiPage(playwright, kellerKey, {
        title: "Steuer-Checkliste",
        markdown: `${checklistText} keller-steuern-journey`,
      });
      await expectWikiPage(page, checklist.id, checklistText);
      await shot(page, "second-workspace-wiki");

      await switchTo(page, workspace.companyId, "Browser workspace");
      await page.goto(organizationList(workspace.companyId));
      await expect(page.getByText("Example organization", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Steuerkanzlei Keller", { exact: true })).toHaveCount(0);
      await page.goto(organizationList(keller));
      await expect(page.getByRole("heading", { name: englishMessages.NotFoundPage.title, exact: true })).toBeVisible();
      await expectWikiPageUnavailable(page, checklist.id, checklistText);
      const browserKey = (await mintApiKey(database, workspace, "Browser bookkeeping")).key;
      await page.goto("/en/settings/api-keys");
      await expect(page.getByText("Browser bookkeeping", { exact: true })).toBeVisible();
      await expect(page.getByText("Keller Steuern sync", { exact: true })).toHaveCount(0);
      expect(await apiKeyRequest(playwright, kellerKey)).toEqual({ status: 200, id: kellerMember?.id });
      expect(await apiKeyRequest(playwright, browserKey)).toEqual({ status: 200, id: workspace.userId });
      expect(await mcpWorkspaceName(kellerKey)).toEqual({ id: keller, name: SECOND });
      expect(await mcpWorkspaceName(browserKey)).toEqual({ id: workspace.companyId, name: "Browser workspace" });
      expect(await wikiPageIds(playwright, kellerKey)).toContain(checklist.id);
      expect(await wikiPageIds(playwright, browserKey)).not.toContain(checklist.id);
      const searched = await restPost(playwright, browserKey, "/v1/wiki/search", { query: "keller steuern journey" });
      expect(searched.status).toBe(200);
      expect(WikiItems.parse(searched.body).items.map(({ id }) => id)).not.toContain(checklist.id);

      await joinByLink(page, link);
      expect(await membership()).toMatchObject({ status: "pendingAuthorization", left: false });
      await expect.poll(() => approvalTaskCount(database, hoffmann.companyId, email)).toBe(1);
      await admin.page.goto("/en/settings/members");
      await expect(memberItem(admin.page, MEMBER)).toContainText(
        englishMessages.Common.userStatuses.pendingAuthorization,
      );
      await shot(page, "pending");
      await clickHydrated(page.locator("#pending-withdraw"));
      await page
        .getByRole("alertdialog", { name: `Withdraw your request to join ${INVITER}?` })
        .getByRole("button", { name: englishMessages.PendingCard.withdraw, exact: true })
        .click();
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      await expectCurrentWorkspace(page, "Browser workspace");
      expect(await membership()).toMatchObject({ status: "inactive", left: true });
      expect(await approvalTaskCount(database, hoffmann.companyId, email)).toBe(0);
      await admin.page.goto("/en/settings/members");
      await expect(memberItem(admin.page, MEMBER)).toContainText(englishMessages.WorkspaceMembership.left);

      await joinByLink(page, link);
      await approve(admin.page, email);
      await expect.poll(async () => (await membership())?.status).toBe("active");
      expect(await approvalTaskCount(database, hoffmann.companyId, email)).toBe(0);
      await enterApprovedWorkspace(page);
      const guideText = "Neue Mandanten zuerst im Kanzleiprogramm anlegen.";
      const guide = await createWikiPage(playwright, (await mintApiKey(database, hoffmann, "Anna laptop")).key, {
        title: "Hoffmann Leitfaden",
        markdown: guideText,
      });
      await expectWikiPage(page, guide.id, guideText);
      await expectWikiPageUnavailable(page, checklist.id, checklistText);
      await page.goto(organizationList(hoffmann.companyId));
      await addOrganization(page, "Keller Logistik");
      const hoffmannKey = await createApiKeyInSettings(page, INVITER, "Keller laptop");
      const hoffmannMember = await membership();
      expect(await apiKeyRequest(playwright, hoffmannKey)).toEqual({ status: 200, id: hoffmannMember?.id });
      expect(await wikiPageIds(playwright, hoffmannKey)).toEqual(expect.arrayContaining([guide.id]));
      expect(await wikiPageIds(playwright, hoffmannKey)).not.toContain(checklist.id);
      expect(await wikiPageIds(playwright, kellerKey)).not.toContain(guide.id);
      await admin.page.goto(organizationList(hoffmann.companyId));
      await expect(admin.page.getByText("Keller Logistik", { exact: true }).first()).toBeVisible();
      await switchTo(page, keller, SECOND);
      await page.goto(organizationList(keller));
      await expect(page.getByText("Steuerkanzlei Keller", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Keller Logistik", { exact: true })).toHaveCount(0);
      await expectWikiPageUnavailable(page, guide.id, guideText);
      await shot(page, "three-workspaces-apart");
      expect(sentEmailsTo(email)).toEqual([]);

      await page.goto("about:blank");
      await admin.page.goto("/en/settings/members");
      await runRowAction(admin.page, memberItem(admin.page, MEMBER), MEMBER, englishMessages.MemberRemoval.action);
      const confirm = admin.page.getByRole("alertdialog", { name: `Remove ${MEMBER} from ${INVITER}?` });
      await expect(confirm).toContainText(`${MEMBER} loses access to this workspace on every device.`);
      await expect(confirm).toContainText(englishMessages.MemberRemoval.consequences.notified);
      await shot(admin.page, "remove-active-confirm");
      await confirm.getByRole("button", { name: englishMessages.MemberRemoval.action, exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(memberItem(admin.page, MEMBER)).toContainText(englishMessages.WorkspaceMembership.left);
      expect(await membership()).toMatchObject({ status: "inactive", left: true });

      await expect.poll(() => sentEmailsTo(email).length).toBe(1);
      const [notice] = sentEmailsTo(email);
      const removalNotice = englishMessages.WorkspaceRemovalNotice;
      expect(notice).toMatchObject({
        to: [email],
        from: "Customermates <mail@customermates.test>",
        subject: removalNotice.subject.replace("{workspace}", INVITER),
      });
      expect(emailLanguage(notice)).toBe("en");
      const text = emailText(notice);
      for (const line of [
        removalNotice.greeting.replace("{firstName}", "Jonas"),
        removalNotice.body.replace("{workspace}", INVITER),
        removalNotice.otherWorkspaces,
        removalNotice.rejoin.replace("{workspace}", INVITER),
      ])
        expect(text).toContain(line);
      const signIn = `${baseUrl}/auth/signin`;
      expect(emailLinks(notice)).toContain(signIn);
      const visitor = await playwright.request.newContext();
      try {
        const opened = await visitor.get(signIn);
        expect(opened.status()).toBe(200);
        expect(new URL(opened.url()).pathname).toBe("/en/auth/signin");
      } finally {
        await visitor.dispose();
      }
      expect([401, 403]).toContain((await apiKeyRequest(playwright, hoffmannKey)).status);
      expect(await apiKeyRequest(playwright, kellerKey)).toEqual({ status: 200, id: kellerMember?.id });

      await page.goto("/en/dashboard");
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      const menu = await openWorkspaceSwitcher(page);
      await expect(switcherWorkspaces(menu)).toHaveCount(2);
      await expect(menu.locator(`[data-workspace-id="${workspace.companyId}"]`)).toBeVisible();
      await expect(menu.locator(`[data-workspace-id="${keller}"]`)).toBeVisible();
      await expect(menu.locator(`[data-workspace-id="${hoffmann.companyId}"]`)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await page.goto(organizationList(hoffmann.companyId));
      await expect(page.getByRole("heading", { name: englishMessages.NotFoundPage.title, exact: true })).toBeVisible();
      await expectWikiPageUnavailable(page, guide.id, guideText);
      await shot(page, "after-removal");

      await joinByLink(page, link);
      await approve(admin.page, email);
      await expect.poll(async () => (await membership())?.status).toBe("active");
      await enterApprovedWorkspace(page);
      await page.goto("/en/settings/general");
      await expect(page.locator("#settings-general-name")).toHaveValue(INVITER);
      await clickHydrated(page.locator("#settings-general-leave"));
      await page
        .getByRole("alertdialog", { name: `Leave ${INVITER}?` })
        .getByRole("button", { name: englishMessages.Workspaces.leave, exact: true })
        .click();
      await expect(page).toHaveURL(/\/en\/dashboard$/);
      expect(await membership()).toMatchObject({ status: "inactive", left: true });
      await admin.page.goto("/en/settings/members");
      await expect(memberItem(admin.page, MEMBER)).toContainText(englishMessages.WorkspaceMembership.left);

      const invitation = await readInvitationLink(admin.page);
      await joinByLink(page, invitation);
      expect(await membership()).toMatchObject({ status: "pendingAuthorization", left: false });
      await expect.poll(() => approvalTaskCount(database, hoffmann.companyId, email)).toBe(1);
      await admin.page.goto("/en/settings/members");
      await expect(memberItem(admin.page, MEMBER)).toContainText(
        englishMessages.Common.userStatuses.pendingAuthorization,
      );
      await shot(page, "invited-again");

      expect(sentEmailsTo(email)).toHaveLength(1);
      expect(sentEmailsTo(annaEmail)).toEqual([]);
      expect(await subscriptionOf(database, workspace.companyId)).toEqual(firstPlan);
      expect(admin.errors).toEqual([]);
    } finally {
      await admin.close();
    }
  } finally {
    await removeBrowserWorkspace(database, hoffmann);
  }
  expect(errors).toEqual([]);
});
