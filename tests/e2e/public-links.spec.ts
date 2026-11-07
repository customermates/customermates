import type { Page } from "@playwright/test";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { expect, test, collectPageErrors } from "./fixtures";
import { companyPath } from "./app-paths";
import { createBrowserWorkspace, removeBrowserWorkspace } from "./workspace";
import { postOk } from "./api";
import { applyPaletteSearch, clearPaletteSearch, openFilterPalette } from "./filter-palette";
import { anonymous, createView, openShareDialog, rail, readModel, saveRole, teammate } from "./view-sharing-helpers";

const publicLink = englishMessages.DataView.share.public;
const publicPage = englishMessages.PublicLink;
const settings = englishMessages.Workspaces.publicLinks;

async function addNumberWidget(page: Page, name: string, viewId: string) {
  const model = await readModel(page);
  const type = model.types.find((candidate) => /organi[sz]ation|compan/iu.test(candidate.pluralLabel));
  if (!type) throw new Error("The workspace has no organization list");
  await postOk(page, "/api/v1/widgets/save", {
    expectedRevision: model.revision,
    idempotencyKey: randomUUID(),
    name,
    measure: {
      source: { typeId: type.id, filters: [], relationships: [] },
      aggregation: "count",
      valueFieldId: null,
      groupBy: null,
    },
    displayOptions: { displayType: "number" },
    isTemplate: false,
    viewId,
  });
  await page.reload();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}

async function setPublicLink(page: Page, on: boolean) {
  const dialog = await openShareDialog(page);
  const option = dialog.locator("#share-scope-public");
  await expect(option).toBeVisible();
  await expect(option).toHaveAttribute("aria-checked", on ? "false" : "true");
  await dialog.locator(on ? "#share-scope-public" : "#share-scope-workspace").click();
  if (on) await expect(dialog.locator("#share-view-public-pending")).toHaveText(publicLink.saveToCreate);
  await dialog.locator("#share-view-save").click();
  if (!on) {
    await expect(page.getByText(publicLink.revoked, { exact: false }).first()).toBeVisible();
    await expect(dialog).toHaveCount(0);
    return null;
  }
  await expect(
    page.getByText(new RegExp(`^(${publicLink.createdCopied}|${publicLink.published})$`, "u")).first(),
  ).toBeVisible();
  const url = (await dialog.locator("#share-view-public-link").getAttribute("data-value")) ?? "";
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  return url;
}

test("publishes a dashboard view by public link for outsiders, read-only, and stops it when revoked or turned off", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  const errors = collectPageErrors(page);
  const guests = await saveRole(page, {
    name: "Dashboard guests",
    description: "May not publish",
    permissions: [{ resource: "company", actions: [] }],
    recordGrants: [],
  });
  const member = await teammate(browser, database, companyId, guests.role.id, testInfo);
  const outsider = await anonymous(browser, testInfo);
  try {
    const dashboardPath = companyPath(companyId, "/dashboard");
    await page.goto(dashboardPath);
    const boardId = await createView(page, "Investor board");
    await addNumberWidget(page, "Pipeline count", boardId);

    const url = await setPublicLink(page, true);
    if (!url) throw new Error("No public link was shown");
    const path = new URL(url).pathname;
    expect(path).toMatch(/^\/p\/[0-9a-f]{64}$/u);
    await expect(
      rail(page).getByRole("link", { name: "Investor board", exact: true }).locator("[data-view-public]"),
    ).toHaveCount(1);

    await outsider.page.goto(path);
    await expect(outsider.page.locator("#public-link-title")).toHaveText("Investor board");
    await expect(outsider.page.getByRole("heading", { name: "Pipeline count", exact: true })).toBeVisible();
    await expect(outsider.page.locator("#public-link-live")).toContainText(publicPage.readOnly);
    await expect(outsider.page.locator("footer")).toHaveCount(0);
    await expect(outsider.page.locator("#global-data-views")).toHaveCount(0);
    await expect(outsider.page.locator("#dashboard-add-widget")).toHaveCount(0);
    await expect(outsider.page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/u);
    if (process.env.APP_MODE === "self-hosted") {
      await expect(outsider.page.locator("#public-link-badge")).toHaveCount(0);
    } else {
      await expect(outsider.page.locator("#public-link-badge")).toHaveAttribute(
        "href",
        "/auth/signup?utm_source=public_dashboard&utm_medium=referral&utm_campaign=public_link&utm_content=badge",
      );
      await expect(outsider.page.locator("#public-link-badge")).toContainText(publicPage.upsell.badge);
    }
    await expect(outsider.page.locator("header")).toHaveCount(0);

    const shown = (await outsider.page.locator("[data-public-widget]").first().textContent()) ?? "";
    const shownCount = Number(/(\d+)\s*$/u.exec(shown.trim())?.[1] ?? Number.NaN);
    await outsider.page.getByRole("heading", { name: "Pipeline count", exact: true }).click();
    const drawer = outsider.page.getByRole("dialog", { name: "Pipeline count", exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator("#public-widget-drawer-summary")).toContainText(
      Number.isNaN(shownCount) ? "contributing record" : `${shownCount} contributing record`,
    );
    await expect(drawer.locator("tbody tr, [data-row-id]").first()).toBeVisible();
    await expect(drawer.locator('a[href*="/records/"]')).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: /edit/iu })).toHaveCount(0);
    await expect(async () => {
      await outsider.page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0, { timeout: 1000 });
    }).toPass();

    await member.page.goto(path);
    await expect(member.page.locator("#public-link-title")).toHaveText("Investor board");
    await expect(member.page.locator("#global-data-views")).toHaveCount(0);
    await expect(member.page.locator('[data-sidebar="sidebar"]')).toHaveCount(0);

    const foreign = await createBrowserWorkspace(database, "Another workspace");
    const foreignRole = await database.query('SELECT id FROM "UserRole" WHERE "companyId"=$1 LIMIT 1', [
      foreign.companyId,
    ]);
    const stranger = await teammate(browser, database, foreign.companyId, foreignRole.rows[0].id as string, testInfo);
    try {
      await stranger.page.goto(path);
      await expect(stranger.page.locator("#public-link-title")).toHaveText("Investor board");
      await stranger.page.getByRole("heading", { name: "Pipeline count", exact: true }).click();
      await expect(stranger.page.getByRole("dialog", { name: "Pipeline count", exact: true })).toBeVisible();
    } finally {
      await stranger.close();
      await removeBrowserWorkspace(database, foreign);
    }

    await outsider.page.goto(`${path.slice(0, -1)}${path.endsWith("0") ? "1" : "0"}`);
    await expect(outsider.page.getByText(publicPage.unavailableTitle, { exact: true })).toBeVisible();
    await expect(outsider.page.getByText("Pipeline count", { exact: true })).toHaveCount(0);

    const dialog = await openShareDialog(page);
    await expect(dialog.locator("#share-view-public-link")).toHaveAttribute("data-value", url);
    await expect(dialog.locator("#share-view-public-meta")).not.toContainText("Not opened yet");
    await page.keyboard.press("Escape");

    await setPublicLink(page, false);
    await outsider.page.goto(path);
    await expect(outsider.page.getByText(publicPage.unavailableTitle, { exact: true })).toBeVisible();
    await expect(outsider.page.getByText("Pipeline count", { exact: true })).toHaveCount(0);

    const second = await setPublicLink(page, true);
    if (!second) throw new Error("No second public link was shown");
    expect(second).not.toBe(url);
    const secondPath = new URL(second).pathname;
    await outsider.page.goto(secondPath);
    await expect(outsider.page.getByRole("heading", { name: "Pipeline count", exact: true })).toBeVisible();

    await page.goto(companyPath(companyId, "/settings/general"));
    const workspaceSwitch = page.locator("#settings-general-public-links");
    await expect(workspaceSwitch).toHaveAttribute("aria-checked", "true");
    await workspaceSwitch.click();
    await expect(page.getByText(settings.blocked, { exact: true })).toBeVisible();
    await outsider.page.goto(secondPath);
    await expect(outsider.page.getByText(publicPage.unavailableTitle, { exact: true })).toBeVisible();
    await workspaceSwitch.click();
    await expect(page.getByText(settings.allowed, { exact: true })).toBeVisible();
    await outsider.page.goto(secondPath);
    await expect(outsider.page.getByRole("heading", { name: "Pipeline count", exact: true })).toBeVisible();

    await member.page.goto(dashboardPath);
    await createView(member.page, "Guest board");
    const memberDialog = await openShareDialog(member.page);
    await expect(memberDialog.getByText(publicLink.permissionDenied, { exact: true })).toBeVisible();
    await expect(memberDialog.locator("#share-scope-public")).toBeDisabled();

    expect(errors).toEqual([]);
    expect(member.errors).toEqual([]);
    expect(outsider.errors).toEqual([]);
  } finally {
    await outsider.close();
    await member.close();
  }
});

test("publishes a list view by public link with only its visible columns, read-only and without record pages", async ({
  page,
  browser,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const outsider = await anonymous(browser, testInfo);
  try {
    const model = await readModel(page);
    const type = model.types.find((candidate) => /deal/iu.test(candidate.pluralLabel));
    const primary = model.fields.find((field) => field.id === type?.primaryFieldId);
    const hidden = model.fields.find(
      (field) => field.typeId === type?.id && field.valueType === "select" && !field.multiple && !field.archived,
    );
    if (!type || !primary || !hidden || hidden.valueType !== "select" || !hidden.options[0])
      throw new Error("The workspace has no deal stages");
    const hiddenOption = hidden.options[0];
    await postOk(page, "/api/v1/records/mutate", {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: type.id,
        fields: [
          { fieldId: type.primaryFieldId, value: { kind: "text", value: "Public list deal" } },
          { fieldId: hidden.id, value: { kind: "select", value: hiddenOption.id } },
        ],
      },
    });
    const created = await postOk(page, "/api/v1/data-views/create", {
      surfaceKey: `records:${type.id}`,
      name: "Partner list",
      state: { hiddenColumns: [hidden.id] },
    });
    const listPath = companyPath(companyId, `/records/${type.id}?view=${created.viewKey as string}`);
    await page.goto(listPath);
    await expect(rail(page).getByRole("link", { name: "Partner list", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const url = await setPublicLink(page, true);
    if (!url) throw new Error("No public link was shown");
    const path = new URL(url).pathname;
    await expect(
      rail(page).getByRole("link", { name: "Partner list", exact: true }).locator("[data-view-public]"),
    ).toHaveCount(1);
    const dialog = await openShareDialog(page);
    await expect(dialog.locator("#share-view-public-meta")).toContainText(publicLink.onlyColumns);
    await page.keyboard.press("Escape");

    await outsider.page.goto(path);
    await expect(outsider.page.locator("#public-link-title")).toHaveText("Partner list");
    await expect(outsider.page.locator("#public-link")).toHaveAttribute("data-public-kind", "list");
    const table = outsider.page.locator("#public-list");
    await expect(table.getByText("Public list deal", { exact: true }).first()).toBeVisible();
    await expect(table.getByText(hiddenOption.label, { exact: true })).toHaveCount(0);
    await expect(table.locator("#public-list-summary")).toContainText(/\d+ record/u);
    if ((outsider.page.viewportSize()?.width ?? 1280) >= 768) {
      await expect(table.getByRole("columnheader", { name: primary.label })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: hidden.label, exact: true })).toHaveCount(0);
    }
    await expect(table.locator('a[href*="/records/"]')).toHaveCount(0);
    await applyPaletteSearch(outsider.page, "public-list-filter", "Public list deal", publicPage.searchLabel);
    await expect(table.locator("#public-list-summary")).toHaveText("1 record");
    await expect(table.getByText("Public list deal", { exact: true }).first()).toBeVisible();
    await clearPaletteSearch(outsider.page, "public-list-filter");
    await expect(table.locator("#public-list-summary")).not.toHaveText("1 record");
    await openFilterPalette(outsider.page, "public-list-filter");
    await expect(outsider.page.locator(`[data-palette-field="${hidden.id}"]`)).toHaveCount(0);
    await expect(outsider.page.locator(`[data-palette-field="${primary.id}"]`)).toHaveCount(1);
    await outsider.page.keyboard.press("Escape");
    await outsider.page.locator("#public-list-display-options").click();
    await expect(outsider.page.getByRole("checkbox", { name: primary.label, exact: true })).toBeVisible();
    await expect(outsider.page.getByRole("checkbox", { name: hidden.label, exact: true })).toHaveCount(0);
    await outsider.page.keyboard.press("Escape");
    await expect(outsider.page.locator("#global-data-views")).toHaveCount(0);
    await expect(outsider.page.locator("header")).toHaveCount(0);
    if (process.env.APP_MODE === "self-hosted") await expect(outsider.page.locator("#public-link-badge")).toHaveCount(0);
    else await expect(outsider.page.locator("#public-link-badge")).toContainText(publicPage.upsell.badge);

    await setPublicLink(page, false);
    await outsider.page.goto(path);
    await expect(outsider.page.getByText(publicPage.unavailableTitle, { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
    expect(outsider.errors).toEqual([]);
  } finally {
    await outsider.close();
  }
});

test("renders every chart style on a public dashboard and opens the records behind each one", async ({
  page,
  browser,
  companyId,
}, testInfo) => {
  test.setTimeout(360000);
  const errors = collectPageErrors(page);
  const outsider = await anonymous(browser, testInfo);
  try {
    const model = await readModel(page);
    const deals = model.types.find((candidate) => /deal/iu.test(candidate.pluralLabel));
    const stage = model.fields.find(
      (field) => field.typeId === deals?.id && field.valueType === "select" && !field.multiple && !field.archived,
    );
    if (!deals || !stage || stage.valueType !== "select" || stage.options.length < 2)
      throw new Error("The workspace has no deal stages");
    for (const [name, option] of [
      ["Chart deal one", stage.options[0]],
      ["Chart deal two", stage.options[1]],
    ] as const) {
      await postOk(page, "/api/v1/records/mutate", {
        expectedRevision: (await readModel(page)).revision,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: deals.id,
          fields: [
            { fieldId: deals.primaryFieldId, value: { kind: "text", value: name } },
            { fieldId: stage.id, value: { kind: "select", value: option?.id } },
          ],
        },
      });
    }

    await page.goto(companyPath(companyId, "/dashboard"));
    const boardId = await createView(page, "Every chart");
    const styles = [
      "number",
      "verticalBarChart",
      "horizontalBarChart",
      "verticalBarChartWithLabels",
      "horizontalBarChartWithLabels",
      "doughnutChart",
      "radarChart",
      "areaChart",
      "rankedTable",
      "funnelChart",
    ] as const;
    for (const [index, displayType] of styles.entries()) {
      await postOk(page, "/api/v1/widgets/save", {
        expectedRevision: (await readModel(page)).revision,
        idempotencyKey: randomUUID(),
        name: `Style ${displayType}`,
        measure: {
          source: { typeId: deals.id, filters: [], relationships: [] },
          aggregation: "count",
          valueFieldId: null,
          groupBy:
            displayType === "number"
              ? null
              : displayType === "areaChart"
                ? { path: [], fieldId: "system:createdAt", dateInterval: "month" }
                : { path: [], fieldId: stage.id },
        },
        displayOptions: { displayType },
        isTemplate: false,
        viewId: boardId,
        layout: { x: (index % 2) * 6, y: Math.floor(index / 2) * 6, w: 6, h: 6 },
      });
    }
    await page.reload();
    const url = await setPublicLink(page, true);
    if (!url) throw new Error("No public link was shown");

    await outsider.page.goto(new URL(url).pathname);
    await expect(outsider.page.locator("#public-link-title")).toHaveText("Every chart");
    for (const displayType of styles) {
      const name = `Style ${displayType}`;
      const heading = outsider.page.getByRole("heading", { name, exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      await heading.click();
      const drawer = outsider.page.getByRole("dialog", { name, exact: true });
      await expect(drawer).toBeVisible();
      await expect(drawer.locator("#public-widget-drawer-summary")).toContainText(/\d+ contributing record/u);
      await expect(drawer.locator("#public-widget-drawer-chart")).toHaveCount(displayType === "number" ? 0 : 1);
      await expect(drawer.locator("tbody tr, [data-row-id]").first()).toBeVisible();
      await expect(drawer.locator('a[href*="/records/"]')).toHaveCount(0);
      await expect(async () => {
        await outsider.page.keyboard.press("Escape");
        await expect(drawer).toHaveCount(0, { timeout: 1000 });
      }).toPass();
    }
    expect(errors).toEqual([]);
    expect(outsider.errors).toEqual([]);
  } finally {
    await outsider.close();
  }
});
