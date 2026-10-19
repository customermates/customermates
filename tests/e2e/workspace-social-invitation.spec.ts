import { randomInt, randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";
import type { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { expectedAuthorization, routeSocialProvider } from "./social-sign-in";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import { inviteToken, joinFromInvitation } from "./workspace-membership";
import { activeWorkspaceOf, clickHydrated, e2eAppMode, expectHydrated } from "./workspace-switching";

test.skip(e2eAppMode() !== "cloud", "The local OAuth provider stands in for the cloud's Google and Microsoft clients");

async function loginEmail(database: Client, authUserId: string) {
  const { rows } = await database.query<{ email: string }>('SELECT email FROM "AuthUser" WHERE id=$1', [authUserId]);
  return rows[0].email;
}

async function socialAccounts(database: Client, email: string) {
  const { rows } = await database.query<{ authUserId: string; providerId: string; accountId: string }>(
    'SELECT u.id AS "authUserId",a."providerId",a."accountId" FROM "AuthUser" u JOIN "AuthAccount" a ON a."userId"=u.id WHERE u.email=$1 ORDER BY a."providerId"',
    [email],
  );
  return rows;
}

async function membershipsIn(database: Client, companyId: string, email: string) {
  const { rows } = await database.query<{ status: string; roleId: string | null }>(
    'SELECT status::text,"roleId" FROM "User" WHERE "companyId"=$1 AND email=$2',
    [companyId, email],
  );
  return rows;
}

async function openInvitationSignedOut(page: Page, token: string, entry: "signin" | "signup") {
  await page.goto(`/en/invitation/${token}`);
  await expect(page).toHaveURL(/\/en\/auth\/signup\?intent=/);
  if (entry === "signin") {
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/auth\/signin\?intent=/);
  }
}

function providerIdentity(email: string, name: string) {
  const [givenName, familyName] = name.split(" ");
  return { sub: String(randomInt(100_000_000, 999_999_999)), email, name, givenName, familyName };
}

test("an existing login signs in with Google from an invitation, lands on the join card and joins as pending", async ({
  context,
  page,
  database,
  workspace,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  const email = await loginEmail(database, workspace.authUserId);
  const inviter = await createBrowserWorkspace(database, "Hoffmann Consulting");
  try {
    const token = await inviteToken(database, { companyId: inviter.companyId, createdById: inviter.userId });
    await context.clearCookies();
    const google = await routeSocialProvider(page, "google");
    const identity = providerIdentity(email, "Browser Administrator");
    google.signInAs(identity);

    await openInvitationSignedOut(page, token, "signin");
    await expect(
      page.getByText(
        englishMessages.SignInForm.inviteSubtitleNamed
          .replace("{inviterName}", "Browser Administrator")
          .replace("{workspace}", "Hoffmann Consulting"),
        { exact: true },
      ),
    ).toBeVisible();
    await clickHydrated(page.getByRole("button", { name: "Continue with Google", exact: true }));

    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    await expect(page.getByRole("heading", { level: 1, name: "Join Hoffmann Consulting", exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${email}`, { exact: false })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("ws-social-join-card.png"), fullPage: true });
    expect(google.authorizations).toEqual([{ ...expectedAuthorization("google", baseUrl), state: expect.any(String) }]);
    expect(await socialAccounts(database, email)).toEqual([
      { authUserId: workspace.authUserId, providerId: "google", accountId: identity.sub },
    ]);

    await joinFromInvitation(page);
    await expect(page).toHaveURL(/\/en\/auth\/pending$/);
    expect(await membershipsIn(database, inviter.companyId, email)).toEqual([
      { status: "pendingAuthorization", roleId: null },
    ]);
    expect(await membershipsIn(database, workspace.companyId, email)).toEqual([
      { status: "active", roleId: expect.any(String) },
    ]);
    expect((await activeWorkspaceOf(database, workspace)).session).toBe(inviter.companyId);
  } finally {
    await removeBrowserWorkspace(database, inviter);
  }
  expect(errors).toEqual([]);
});

test("a new Google login from an invitation gets the invitation flow and waits for approval in that workspace only", async ({
  context,
  page,
  database,
}, testInfo) => {
  const errors = collectPageErrors(page);
  const email = `lea-${randomUUID()}@example.test`;
  const inviter = await createBrowserWorkspace(database, "Hoffmann Consulting");
  try {
    const token = await inviteToken(database, { companyId: inviter.companyId, createdById: inviter.userId });
    await context.clearCookies();
    const google = await routeSocialProvider(page, "google");
    google.signInAs(providerIdentity(email, "Lea Brandt"));

    await openInvitationSignedOut(page, token, "signup");
    await clickHydrated(page.getByRole("button", { name: "Register with Google", exact: true }));

    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: englishMessages.InvitationCard.joinTitleNamed.replace("{workspace}", "Hoffmann Consulting"),
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(`You are signed in as ${email}`, { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("ws-social-new-login-invitation.png"), fullPage: true });
    const created = await database.query<{ id: string; emailVerified: boolean; companyId: string | null }>(
      'SELECT id,"emailVerified","companyId" FROM "AuthUser" WHERE email=$1',
      [email],
    );
    expect(created.rows).toEqual([{ id: expect.any(String), emailVerified: true, companyId: null }]);
    expect(await membershipsIn(database, inviter.companyId, email)).toEqual([]);

    await clickHydrated(page.getByRole("link", { name: englishMessages.InvitationCard.joinAction, exact: true }));
    await expect(page).toHaveURL(/\/en\/onboarding\/wizard\?intent=/);
    await expect(
      page.getByText(
        englishMessages.OnboardingWizard.steps.profile.invitedSubtitleNamed.replace("{workspace}", "Hoffmann Consulting"),
        { exact: true },
      ),
    ).toBeVisible();
    await expectHydrated(page.locator("#firstName"));
    await page.locator("#firstName").fill("Lea");
    await page.locator("#lastName").fill("Brandt");
    await page.locator("#agreeToTerms").click();
    await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.continue, exact: true }));

    await expect(page).toHaveURL(/\/auth\/pending$/);
    await expect(page.getByRole("heading", { level: 1, name: englishMessages.PendingCard.title })).toBeVisible();
    expect(await membershipsIn(database, inviter.companyId, email)).toEqual([
      { status: "pendingAuthorization", roleId: null },
    ]);
    const all = await database.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM "User" WHERE email=$1', [
      email,
    ]);
    expect(all.rows[0].count).toBe(1);
    const own = await database.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "Company" WHERE "createdByAuthUserId"=$1',
      [created.rows[0].id],
    );
    expect(own.rows[0].count).toBe(0);
  } finally {
    await removeBrowserWorkspace(database, inviter);
    await database.query('DELETE FROM "AuthUser" WHERE email=$1', [email]);
  }
  expect(errors).toEqual([]);
});

test("a Google login with another e-mail than the invited person sees whom it is signed in as and can switch accounts", async ({
  context,
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const invitedEmail = await loginEmail(database, workspace.authUserId);
  const inviter = await createBrowserWorkspace(database, "Hoffmann Consulting");
  const other = await createBrowserWorkspace(database, "Keller Studio");
  try {
    const otherEmail = await loginEmail(database, other.authUserId);
    const token = await inviteToken(database, { companyId: inviter.companyId, createdById: inviter.userId });
    await context.clearCookies();
    const google = await routeSocialProvider(page, "google");
    google.signInAs(providerIdentity(otherEmail, "Browser Administrator"));

    await openInvitationSignedOut(page, token, "signin");
    await clickHydrated(page.getByRole("button", { name: "Continue with Google", exact: true }));
    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    await expect(page.getByRole("heading", { level: 1, name: "Join Hoffmann Consulting", exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${otherEmail}`, { exact: false })).toBeVisible();
    await expect(page.getByText(invitedEmail, { exact: false })).toHaveCount(0);

    await clickHydrated(
      page.getByRole("button", { name: englishMessages.WorkspaceInvitation.otherAccount, exact: true }),
    );
    await expect(page).toHaveURL(/\/en\/auth\/signup\?intent=/);
    expect(await membershipsIn(database, inviter.companyId, otherEmail)).toEqual([]);
    const sessions = await database.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "AuthSession" WHERE "userId"=$1',
      [other.authUserId],
    );
    expect(sessions.rows[0].count).toBe(0);

    google.signInAs(providerIdentity(invitedEmail, "Browser Administrator"));
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/auth\/signin\?intent=/);
    await clickHydrated(page.getByRole("button", { name: "Continue with Google", exact: true }));
    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    await expect(page.getByText(`Signed in as ${invitedEmail}`, { exact: false })).toBeVisible();
    await joinFromInvitation(page);
    await expect(page).toHaveURL(/\/en\/auth\/pending$/);
    expect(await membershipsIn(database, inviter.companyId, invitedEmail)).toEqual([
      { status: "pendingAuthorization", roleId: null },
    ]);
    expect(await membershipsIn(database, inviter.companyId, otherEmail)).toEqual([]);
  } finally {
    await removeBrowserWorkspace(database, inviter);
    await removeBrowserWorkspace(database, other);
  }
  expect(errors).toEqual([]);
});

test("an existing login signs in with Microsoft from an invitation and joins the invited workspace as pending", async ({
  context,
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const { baseUrl } = localE2eEnvironment();
  const email = await loginEmail(database, workspace.authUserId);
  const inviter = await createBrowserWorkspace(database, "Hoffmann Consulting");
  try {
    const token = await inviteToken(database, { companyId: inviter.companyId, createdById: inviter.userId });
    await context.clearCookies();
    const microsoft = await routeSocialProvider(page, "microsoft");
    const identity = providerIdentity(email, "Browser Administrator");
    microsoft.signInAs(identity);

    await openInvitationSignedOut(page, token, "signin");
    await clickHydrated(page.getByRole("button", { name: "Continue with Microsoft", exact: true }));
    await expect(page).toHaveURL(/\/en\/auth\/invitation\?intent=/);
    await expect(page.getByRole("heading", { level: 1, name: "Join Hoffmann Consulting", exact: true })).toBeVisible();
    expect(microsoft.authorizations).toEqual([
      { ...expectedAuthorization("microsoft", baseUrl), state: expect.any(String) },
    ]);
    expect(await socialAccounts(database, email)).toEqual([
      { authUserId: workspace.authUserId, providerId: "microsoft", accountId: identity.sub },
    ]);
    await joinFromInvitation(page);
    await expect(page).toHaveURL(/\/en\/auth\/pending$/);
    expect(await membershipsIn(database, inviter.companyId, email)).toEqual([
      { status: "pendingAuthorization", roleId: null },
    ]);
  } finally {
    await removeBrowserWorkspace(database, inviter);
  }
  expect(errors).toEqual([]);
});
