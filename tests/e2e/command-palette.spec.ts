import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { test, expect } from "./fixtures";

async function api(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function openPalette(page: Page) {
  const input = page.locator("#global-search-input input");
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(input).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  return input;
}

test("finds a list with its views, opens a view, and deep links a setting with a highlight", async ({
  page,
  database,
  companyId,
  workspace,
}) => {
  test.setTimeout(180000);
  const deals = presetId(companyId, "deal");
  const views = [randomUUID(), randomUUID()];
  for (const [index, name] of ["Open pipeline", "Won this quarter"].entries())
    await database.query(
      `INSERT INTO "DataView" (id, "companyId", "userId", "surfaceKey", name, position, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [views[index], companyId, workspace.userId, `records:${deals}`, name, index],
    );

  await page.goto("/en/dashboard");
  const dialog = page.getByRole("dialog");
  const input = await openPalette(page);
  await input.fill("Deals");
  await expect(dialog.locator("[cmdk-group-heading]").first()).toHaveText("Best match");
  const best = dialog.locator("[cmdk-group]").first().getByRole("option");
  await expect(best).toHaveText([/Deals/, /Open pipeline/, /Won this quarter/]);
  await expect(best.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(best.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/en/records/${deals}\\?.*view=${views[0]}`));

  const again = await openPalette(page);
  await again.fill("v won");
  const options = dialog.getByRole("option");
  await expect(options.filter({ hasText: "Won this quarter" })).toBeVisible();
  await expect(options.filter({ hasText: "Dashboard" })).toHaveCount(0);

  await again.fill("dark mode");
  await expect(options.filter({ hasText: "Switch to dark theme" })).toBeVisible();

  await again.fill("s theme");
  const theme = options.filter({ hasText: "Profile & preferences" }).filter({ hasText: "Theme" });
  await expect(theme).toBeVisible();
  await theme.click();
  await expect(page).toHaveURL(/\/en\/settings\/profile/);
  await expect(page.locator("#settings-profile-theme")).toHaveAttribute("data-focus-highlight", "");

  const recent = await openPalette(page);
  await expect(recent).toHaveValue("");
  await expect(dialog.locator("[cmdk-group]").first().getByRole("option").first()).toContainText("Theme");
});

test("changes a record field and links a record from a second palette level", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const id = (key: string) => presetId(companyId, key);
  const model = RecordModelSchema.parse(await api(page, "/api/v1/model/discover", {}));
  const suffix = randomUUID().slice(0, 6);
  const create = async (typeKey: string, name: string) => {
    const result = await api(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id(typeKey),
        fields: [{ fieldId: id(`${typeKey}.name`), value: { kind: "text", value: name } }],
      },
    });
    return result.refs.find((ref: { typeId: string }) => ref.typeId === id(typeKey)) as {
      typeId: string;
      recordId: string;
    };
  };
  const deal = await create("deal", `Palette deal ${suffix}`);
  await create("organization", `Palette organization ${suffix}`);

  await page.goto(`/en/records/${deal.typeId}/${deal.recordId}`);
  await expect(page.getByText(`Palette deal ${suffix}`).first()).toBeVisible();
  const dialog = page.getByRole("dialog");
  const input = await openPalette(page);
  const suggestions = dialog.getByRole("option");
  await expect(suggestions.filter({ hasText: "Change Stage…" })).toBeVisible();
  await expect(suggestions.filter({ hasText: `Delete Palette deal ${suffix}` })).toBeVisible();

  await input.fill("stage");
  await page.keyboard.press("Enter");
  await expect(input).toHaveAttribute("placeholder", "Change Stage…");
  await expect(suggestions.filter({ hasText: "Qualified" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("placeholder", "Search...");
  await input.fill("stage");
  await page.keyboard.press("Enter");
  await input.fill("qual");
  await page.keyboard.press("Enter");
  await expect(input).not.toBeVisible();
  await expect(page.locator("main").getByText("Qualified", { exact: true }).first()).toBeVisible();

  const linker = await openPalette(page);
  await linker.fill("add to organization");
  await expect(suggestions.first()).toContainText("Add to Organization…");
  await page.keyboard.press("Enter");
  await linker.fill(`Palette organization ${suffix}`);
  await expect(suggestions.filter({ hasText: `Palette organization ${suffix}` })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(linker).not.toBeVisible();
  await expect(page.getByRole("link", { name: `Palette organization ${suffix}` }).first()).toBeVisible();
});

test("keeps Ask Mate as the last fallback row and reports no matches plainly", async ({ page }) => {
  await page.goto("/en/dashboard");
  const dialog = page.getByRole("dialog");
  const input = await openPalette(page);
  await input.fill("zzqxv nothing matches this");
  await expect(dialog.getByText("No results found")).toBeVisible();
  const options = dialog.getByRole("option");
  const count = await options.count();
  if (count > 0) await expect(options.last()).toContainText("Ask Mate");
});
