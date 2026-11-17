import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { appPath } from "./app-paths";
import { confirmDeletion } from "./configure";
import { collectPageErrors, expect, test } from "./fixtures";
import {
  localAgentKeyPrefix,
  localAgentRestrictedKeyPrefix,
  readAgentProviderChecks,
} from "./local-agent-provider.mjs";
import { localE2eEnvironment } from "./local-environment";
import { clickHydrated, e2eAppMode } from "./workspace-switching";

test.skip(e2eAppMode() === "demo", "Demo mode signs every visitor in as the shared demo account");

const keys = englishMessages.AgentKeys;
const runtime = englishMessages.AgentRuntime;
const KEY = `${localAgentKeyPrefix}9f3a-0001`;
const RESTRICTED_KEY = `${localAgentRestrictedKeyPrefix}7c1d-0002`;

test("an administrator adds, tests and removes a provider key and the key is never shown again", async ({
  page,
  database,
  workspace,
}) => {
  const errors = collectPageErrors(page);
  const checks = () => readAgentProviderChecks(localE2eEnvironment().providerDirectory);
  const checksBefore = checks().length;
  const stored = async () =>
    (
      await database.query<{ keyLast4: string; keyCiphertext: string; validatedAt: Date | null; provider: string }>(
        'SELECT "provider", "keyLast4", "keyCiphertext", "validatedAt" FROM "AgentProviderKey" WHERE "companyId"=$1',
        [workspace.companyId],
      )
    ).rows;

  await page.goto(appPath(workspace.slug, "/settings/agents"));

  await test.step("a workspace without a key says so and offers the key runtime only after one is added", async () => {
    await expect(page.locator("#agent-keys")).toContainText(keys.keysEmpty);
    const ownKey = page.locator('#agent-runtimes [data-agent-runtime="ownKey"]');
    await expect(ownKey).toHaveAttribute("data-available", "false");
    await expect(ownKey).toContainText(runtime.reasons.noKey);
    await expect(page.locator("[data-agent-runners-card]")).toContainText(englishMessages.Runners.title);
    await expect(page.locator("[data-agent-runner]")).toHaveCount(0);
    await expect(page.locator("#agent-runs")).toContainText(englishMessages.AgentJobs.empty);
  });

  await test.step("a key the provider rejects is not saved and the dialog stays open", async () => {
    await clickHydrated(page.locator("#agent-key-add"));
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(keys.modalTitle);
    await dialog.locator("#agent-key-label").fill("Production");
    await dialog.locator("#agent-key-api-key").fill("sk-ant-wrong-key-0000");
    await expect(dialog.locator("#agent-key-api-key")).toHaveAttribute("type", "password");
    await dialog.locator("#agent-key-save").click();
    await expect(page.locator("[data-sonner-toast]").first()).toContainText(
      englishMessages.Common.errors.agentProviderKeyInvalid,
    );
    await expect(dialog).toBeVisible();
    expect(await stored()).toEqual([]);
  });

  await test.step("a key the provider accepts is saved, listed with its last four and never shown", async () => {
    const dialog = page.getByRole("dialog");
    await dialog.locator("#agent-key-api-key").fill(KEY);
    await dialog.locator("#agent-key-save").click();
    await expect(dialog).toBeHidden();

    const row = page.locator('[data-agent-key="anthropic"]');
    await expect(row).toContainText("Production");
    await expect(row.locator("[data-agent-key-last4]")).toHaveText("Ends in 0001");
    await expect(page.locator('#agent-runtimes [data-agent-runtime="ownKey"]')).toHaveAttribute(
      "data-available",
      "true",
    );
    expect(await page.content()).not.toContain(KEY);

    const [saved] = await stored();
    expect(saved).toMatchObject({ provider: "anthropic", keyLast4: "0001" });
    expect(saved.validatedAt).not.toBeNull();
    expect(saved.keyCiphertext.startsWith("v2.")).toBe(true);
    expect(saved.keyCiphertext).not.toContain(KEY);
    await expect(row.locator("[data-agent-key-unverified]")).toHaveCount(0);
  });

  await test.step("the key is still listed after a reload and the runtime page counts it", async () => {
    await page.reload();
    const row = page.locator('[data-agent-key="anthropic"]');
    await expect(row.locator("[data-agent-key-last4]")).toHaveText("Ends in 0001");
    await expect(page.locator('#agent-runtimes [data-agent-runtime="ownKey"]')).toHaveAttribute(
      "data-available",
      "true",
    );
    expect(await page.content()).not.toContain(KEY);
  });

  await test.step("testing the key asks the provider again", async () => {
    await clickHydrated(page.locator("#agent-key-test-anthropic"));
    await expect(page.locator("[data-sonner-toast]").first()).toContainText(keys.testSucceeded);
  });

  await test.step("removing the key asks for confirmation and deletes it for good", async () => {
    await clickHydrated(page.locator("#agent-key-remove-anthropic"));
    await confirmDeletion(page);
    await expect(page.locator("#agent-keys")).toContainText(keys.keysEmpty);
    await expect(page.locator('[data-agent-key="anthropic"]')).toHaveCount(0);
    await expect(page.locator('#agent-runtimes [data-agent-runtime="ownKey"]')).toHaveAttribute(
      "data-available",
      "false",
    );
    expect(await stored()).toEqual([]);
    await page.reload();
    await expect(page.locator("#agent-keys")).toContainText(keys.keysEmpty);
  });

  await test.step("a key the provider does not let list its models is saved with a note that it was not checked", async () => {
    await clickHydrated(page.locator("#agent-key-add"));
    const dialog = page.getByRole("dialog");
    await dialog.locator("#agent-key-label").fill("Restricted");
    await dialog.locator("#agent-key-api-key").fill(RESTRICTED_KEY);
    await dialog.locator("#agent-key-save").click();
    await expect(dialog).toBeHidden();

    const row = page.locator('[data-agent-key="anthropic"]');
    await expect(row).toContainText("Restricted");
    await expect(row.locator("[data-agent-key-last4]")).toHaveText("Ends in 0002");
    await expect(row.locator("[data-agent-key-unverified]")).toHaveText(keys.unverifiedNote);
    const [saved] = await stored();
    expect(saved).toMatchObject({ provider: "anthropic", keyLast4: "0002", validatedAt: null });

    await clickHydrated(page.locator("#agent-key-test-anthropic"));
    await expect(page.locator("[data-sonner-toast]").first()).toContainText(
      englishMessages.Common.errors.agentProviderKeyUnverified,
    );
    expect((await stored())[0]?.validatedAt).toBeNull();

    await clickHydrated(page.locator("#agent-key-remove-anthropic"));
    await confirmDeletion(page);
    await expect(page.locator("#agent-keys")).toContainText(keys.keysEmpty);
    expect(await stored()).toEqual([]);
  });

  await test.step("the provider saw each key in a header only: one refusal, the save, the test and the restricted key twice", async () => {
    expect(checks().slice(checksBefore)).toEqual([
      { provider: "anthropic", accepted: false, keyInHeader: true },
      { provider: "anthropic", accepted: true, keyInHeader: true },
      { provider: "anthropic", accepted: true, keyInHeader: true },
      { provider: "anthropic", accepted: false, keyInHeader: true },
      { provider: "anthropic", accepted: false, keyInHeader: true },
    ]);
  });

  expect(errors).toEqual([]);
});
