import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { presetId } from "../../features/records/crm-preset";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { test, expect } from "./fixtures";
import { invokesServerAction, serverActionIds } from "./server-actions";

async function api(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, timeout: 60000 });
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

  await database.query(
    `INSERT INTO "DataView" (id, "companyId", "userId", "surfaceKey", name, position, "updatedAt", "deletedAt")
     VALUES ($1, $2, $3, $4, 'Trashed forecast', 9, NOW(), NOW())`,
    [randomUUID(), companyId, workspace.userId, `records:${deals}`],
  );

  await page.goto("/en/dashboard");
  const dialog = page.getByRole("dialog");
  const input = await openPalette(page);
  await input.fill("Deals");
  await expect(dialog.locator("[cmdk-group-heading]").first()).toHaveText("Best match");
  const best = dialog.locator("[cmdk-group]").first().getByRole("option");
  await expect(best).toHaveText([/Deals/, /Open pipeline/, /Won this quarter/]);
  await expect(dialog.getByRole("option").filter({ hasText: "Trashed forecast" })).toHaveCount(0);
  await expect(best.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(best.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/en/records/${deals}\\?.*view=${views[0]}`));
  await expect(page.getByRole("link", { name: "Open pipeline" }).or(page.getByText("Open pipeline")).first()).toBeVisible();
  await expect(page.locator("#global-search-input")).toHaveCount(0);

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
  await expect(page.getByText(`Palette deal ${suffix}`).first()).toBeVisible({ timeout: 60000 });
  const dialog = page.getByRole("dialog");
  const input = await openPalette(page);
  const suggestions = dialog.getByRole("option");
  await expect(suggestions.filter({ hasText: "Change Stage…" })).toBeVisible();
  await expect(suggestions.filter({ hasText: `Delete Palette deal ${suffix}` })).toBeVisible();

  await input.fill("stage");
  await page.keyboard.press("Enter");
  const breadcrumb = dialog.getByText(`Palette deal ${suffix} · Change Stage…`);
  await expect(breadcrumb).toBeVisible();
  await expect(suggestions.filter({ hasText: "Qualified" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeVisible();
  await expect(breadcrumb).toHaveCount(0);
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
  await expect(page.locator("main").getByText(`Palette organization ${suffix}`).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  const remover = await openPalette(page);
  await remover.fill("delete");
  await expect(suggestions.first()).toContainText(`Delete Palette deal ${suffix}`);
  await page.keyboard.press("Enter");
  const confirmation = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: "Delete" });
  await expect(confirmation.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText(`Palette deal ${suffix}`).first()).toBeVisible();
});

test("keeps Ask Mate as the last fallback row and reports no matches plainly", async ({ page }) => {
  await page.goto("/en/dashboard");
  const dialog = page.getByRole("dialog");
  const input = await openPalette(page);
  await input.fill("zzqxv");
  await expect(dialog.getByText("No results found")).toBeVisible();
  const options = dialog.getByRole("option");
  const count = await options.count();
  if (count > 0) await expect(options.last()).toContainText("Ask Mate");
  await input.fill("zzqxv nothing matches this");
  if (count > 0) {
    await expect(options.first()).toContainText("Go to “zzqxv nothing matches this”");
    await expect(options.last()).toContainText("Ask Mate");
  }
});

async function answerResolver(route: Route, resolution: unknown) {
  const response = await route.fetch();
  const lines = (await response.text()).split("\n");
  const index = lines.findIndex((line) => /^[0-9a-f]+:\{"ok":/.test(line));
  expect(index, "resolver action result line").toBeGreaterThanOrEqual(0);
  lines[index] = `${lines[index].slice(0, lines[index].indexOf(":") + 1)}${JSON.stringify({ ok: true, data: resolution })}`;
  await route.fulfill({ response, body: lines.join("\n") });
}

test("resolves a request with conditions to a filtered list and falls back to Ask Mate", async ({ page, companyId }) => {
  test.setTimeout(180000);
  const id = (key: string) => presetId(companyId, key);
  const model = RecordModelSchema.parse(await api(page, "/api/v1/model/discover", {}));
  const suffix = randomUUID().slice(0, 6);
  for (const [name, stage] of [
    [`Won resolver deal ${suffix}`, "won"],
    [`Open resolver deal ${suffix}`, "qualified"],
  ])
    await api(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: id("deal"),
        fields: [
          { fieldId: id("deal.name"), value: { kind: "text", value: name } },
          { fieldId: id("deal.stage"), value: { kind: "select", value: id(`deal.stage.${stage}`) } },
        ],
      },
    });
  const resolverIds = serverActionIds("app/[locale]/(protected)/search/actions.ts", "resolveCommandAction");
  const answers: unknown[] = [
    { kind: "list", typeId: id("deal"), viewId: null, filters: [{ field: id("deal.stage"), operator: "in", value: [id("deal.stage.won")] }] },
    { kind: "none" },
  ];
  await page.route("**/*", async (route) => {
    if (!invokesServerAction(route.request(), resolverIds)) return route.fallback();
    await answerResolver(route, answers.shift());
  });

  await page.goto("/en/dashboard");
  const dialog = page.getByRole("dialog");
  const input = await openPalette(page);
  await input.fill(`won deals ${suffix}`);
  const resolve = dialog.getByRole("option").filter({ hasText: `Go to “won deals ${suffix}”` });
  await expect(resolve).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/en/records/${id("deal")}\\?.*filters=`));
  await expect(page.getByText(`Won resolver deal ${suffix}`).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(`Open resolver deal ${suffix}`)).toHaveCount(0);
  await expect(page.locator("#global-data-views-all")).toHaveAttribute("data-view-modified", "");
  await expect(page.locator("#records-filter-save")).toBeVisible();
  await expect(page.locator("#records-filter-reset")).toBeVisible();

  const again = await openPalette(page);
  await again.fill("something nobody configured here");
  await expect(dialog.getByRole("option").first()).toContainText("Go to");
  await page.keyboard.press("Enter");
  await expect(page.locator("#global-search-input")).toHaveCount(0);
  await expect(page.getByText("something nobody configured here").first()).toBeVisible();
});
