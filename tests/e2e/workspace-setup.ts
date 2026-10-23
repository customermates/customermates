import type { Page } from "@playwright/test";
import { Client } from "pg";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";
import { insertStarterModel } from "./workspace";
import { clickHydrated, e2eAppMode } from "./workspace-switching";
import { anyWorkspaceUrlPattern, pagePath, slugFromUrl, slugInUrl } from "./app-paths";

export async function createWorkspaceFromSettings(page: Page, name: string) {
  await page.goto(pagePath(page, "/settings/workspaces"));
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = page.getByRole("dialog", { name: "Create workspace" });
  await dialog.locator("#create-workspace-name").fill(name);
  if (e2eAppMode() === "cloud") await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
  if (e2eAppMode() !== "cloud") {
    await expect(page).toHaveURL(/\/en(?:\/w\/[a-z0-9-]+)?\/onboarding\/wizard$/);
    return slugInUrl(page.url());
  }
  await expect(page).toHaveURL(anyWorkspaceUrlPattern("/subscription-expired$"));
  await expect(page.getByRole("heading", { level: 1, name: `Choose a plan for ${name}`, exact: true })).toBeVisible();
  return slugFromUrl(page.url());
}

export async function choosePlan(page: Page, plan: string) {
  const picker = page.locator("#settings-billing-plan-picker");
  const name = englishMessages.Subscription.picker.choose.replace("{plan}", plan);
  await clickHydrated(picker.getByRole("button", { name, exact: true }));
}

// The setup step builds the workspace with live AI, so browser tests record it as done and give the workspace the starter lists.
async function completeSetupStepInDatabase(page: Page) {
  const cookie = (await page.context().cookies()).find((candidate) => candidate.name === "app.session_token");
  if (!cookie) throw new Error("The browser has no session to complete the setup step for");
  const signed = decodeURIComponent(cookie.value);
  const token = signed.slice(0, signed.lastIndexOf("."));
  const client = new Client({ connectionString: localE2eEnvironment().databaseUrl });
  await client.connect();
  try {
    const updated = await client.query<{ id: string; companyId: string }>(
      'UPDATE "User" u SET "onboardingWikiStepCompletedAt"=NOW() FROM "AuthSession" s JOIN "AuthUser" a ON a.id=s."userId" WHERE s.token=$1 AND u."companyId"=COALESCE((SELECT id FROM "Company" WHERE slug=$2),a."companyId") AND u.email=a.email AND u."leftAt" IS NULL RETURNING u.id, u."companyId"',
      [token, slugInUrl(page.url())],
    );
    expect(updated.rowCount).toBe(1);
    const [member] = updated.rows;
    const lists = await client.query('SELECT 1 FROM "RecordTypeDefinition" WHERE "companyId"=$1 LIMIT 1', [member.companyId]);
    if (lists.rowCount === 0) await insertStarterModel(client, member.companyId, member.id);
  } finally {
    await client.end();
  }
}

export async function finishOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/en(?:\/w\/[a-z0-9-]+)?\/onboarding\/wizard$/);
  const heading = (name: string) => page.getByRole("heading", { level: 1, name, exact: true });
  const setup = heading(englishMessages.OnboardingWizard.steps.setup.title);
  const invite = heading(englishMessages.OnboardingWizard.steps.invite.title);
  await expect(setup.or(invite)).toBeVisible();
  if (await setup.isVisible()) {
    await completeSetupStepInDatabase(page);
    await page.reload();
  }
  await expect(invite).toBeVisible();
  await clickHydrated(page.locator("#onboarding-next"));
  await expect(heading(englishMessages.OnboardingWizard.steps.ai.title)).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.finish, exact: true }));
  await expect(page).toHaveURL(anyWorkspaceUrlPattern("/dashboard$"));
  return slugFromUrl(page.url());
}

export async function createApiKeyInSettings(page: Page, workspaceName: string, name: string) {
  await page.goto(pagePath(page, "/settings/api-keys"));
  await expect(page.getByText(`These keys only access the ${workspaceName} workspace.`).first()).toBeVisible();
  await clickHydrated(page.locator("#settings-api-keys-generate"));
  const dialog = page.getByRole("dialog");
  await dialog.locator("#api-key-option-standard").click();
  await dialog.locator("#api-key-name").fill(name);
  await dialog.locator("#api-key-save").click();
  await expect(dialog.getByText(englishMessages.ApiKeyModal.keyCreated, { exact: true })).toBeVisible();
  const key = (await dialog.locator("pre code").textContent())?.trim() ?? "";
  expect(key.length).toBeGreaterThan(20);
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 2_000 });
  }).toPass();
  return key;
}
