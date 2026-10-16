import type { Page } from "@playwright/test";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect } from "./fixtures";
import { clickHydrated, e2eAppMode } from "./workspace-switching";

export async function createWorkspaceFromSettings(page: Page, name: string) {
  await page.goto("/en/settings/workspaces");
  await clickHydrated(page.getByRole("button", { name: "Create workspace", exact: true }));
  const dialog = page.getByRole("dialog", { name: "Create workspace" });
  await dialog.locator("#create-workspace-name").fill(name);
  if (e2eAppMode() === "cloud") await dialog.locator("#create-workspace-terms").click();
  await dialog.getByRole("button", { name: "Create workspace", exact: true }).click();
  if (e2eAppMode() !== "cloud") {
    await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
    return;
  }
  await expect(page).toHaveURL(/\/en\/subscription-expired$/);
  await expect(page.getByRole("heading", { level: 1, name: `Choose a plan for ${name}`, exact: true })).toBeVisible();
}

export async function choosePlan(page: Page, plan: string) {
  const picker = page.locator("#settings-billing-plan-picker");
  await clickHydrated(picker.getByRole("button").filter({ has: page.getByText(plan, { exact: true }) }));
}

export async function finishOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/en\/onboarding\/wizard$/);
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.wiki.title, exact: true }),
  ).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.wiki.skip, exact: true }));
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.invite.title, exact: true }),
  ).toBeVisible();
  await clickHydrated(page.locator("#onboarding-next"));
  await expect(
    page.getByRole("heading", { level: 1, name: englishMessages.OnboardingWizard.steps.ai.title, exact: true }),
  ).toBeVisible();
  await clickHydrated(page.getByRole("button", { name: englishMessages.OnboardingWizard.finish, exact: true }));
  await expect(page).toHaveURL(/\/en\/dashboard$/);
}

export async function createApiKeyInSettings(page: Page, workspaceName: string, name: string) {
  await page.goto("/en/settings/api-keys");
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
