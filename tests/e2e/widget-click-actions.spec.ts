import type { Locator, Page } from "@playwright/test";

import { appPath } from "./app-paths";
import { DEMO_COMPANY_ID, DEMO_DASHBOARDS, DEMO_MEMBERS, DEMO_SLUG, expect, test } from "./demo-seed";
import { e2eAppMode } from "./workspace-switching";
import { expectBlockedEmailScripts } from "./browser-diagnostics";

type SeededWidget = {
  id: string;
  name: string;
  kind: string;
  displayType: string | null;
  calendarLayout: string | null;
};

const escapeText = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const CONTRIBUTING = / · \d+ contributing records?$/u;

/** The clickable groups of a chart: bars, slices, funnel steps, area and radar points, and ranked rows. */
const points = (scope: Locator) => scope.locator("[data-chart-point], tbody button[data-widget-interactive]");

async function pointLabel(point: Locator) {
  return (await point.getAttribute("data-chart-point")) ?? ((await point.textContent()) ?? "").trim();
}

/**
 * Clicks a chart group. A doughnut slice's box centre lies in the hole, so the slice receives the click directly;
 * every other group takes a real pointer click, which also proves nothing covers it.
 */
async function clickPoint(point: Locator) {
  if (await point.evaluate((element) => element.classList.contains("recharts-sector")))
    await point.dispatchEvent("click");
  else await point.click();
}

async function closeDrawer(page: Page, drawer: Locator) {
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0, { timeout: 1000 });
  }).toPass();
}

/** A chart group opens the drawer on its records; another group in the drawer's preview switches it there. */
async function checkChart(page: Page, card: Locator, widget: SeededWidget) {
  const groups = points(card);
  await expect(groups.first(), `${widget.name} has clickable groups`).toBeVisible();
  const first = groups.first();
  const label = await pointLabel(first);
  await clickPoint(first);
  const drawer = page.getByRole("dialog", { name: widget.name, exact: true });
  const summary = drawer.locator("[data-linked-records-summary]");
  await expect(summary, `${widget.name}: ${label}`).toHaveText(
    new RegExp(`^${escapeText(label)}${CONTRIBUTING.source}`, "u"),
  );
  const preview = points(drawer.locator("[data-widget-detail-chart]"));
  await expect(preview.first()).toBeVisible();
  const count = await preview.count();
  for (let index = 0; index < count; index += 1) {
    const other = preview.nth(index);
    const otherLabel = await pointLabel(other);
    if (otherLabel === label || !(await other.isVisible())) continue;
    await clickPoint(other);
    await expect(summary, `${widget.name} drawer: ${otherLabel}`).toHaveText(
      new RegExp(`^${escapeText(otherLabel)}${CONTRIBUTING.source}`, "u"),
    );
    break;
  }
  await closeDrawer(page, drawer);
}

for (const dashboard of DEMO_DASHBOARDS) {
  test(`every widget on the ${dashboard.name} dashboard answers a click`, async ({
    page,
    database,
    errors,
  }, testInfo) => {
    test.skip(
      testInfo.project.use.isMobile === true,
      "Desktop clicks; the phone drawer is covered by the widget drawer specs",
    );
    test.setTimeout(240000);
    const { rows: widgets } = await database.query<SeededWidget>(
      `SELECT id, name, kind::text AS kind, "displayOptions"->>'displayType' AS "displayType",
       "calendarQuery"->>'layout' AS "calendarLayout" FROM "Widget"
       WHERE "companyId"=$1 AND "userId"=$2 AND id LIKE '15000000-%' AND "viewId" IS NOT DISTINCT FROM $3
       AND "deletedAt" IS NULL ORDER BY id`,
      [DEMO_COMPANY_ID, DEMO_MEMBERS.maxBergmann.userId, dashboard.id],
    );
    expect(widgets.length).toBeGreaterThan(0);
    await page.setViewportSize({ width: 1440, height: 2600 });
    await page.goto(appPath(DEMO_SLUG, dashboard.id ? `/dashboard?view=${dashboard.id}` : "/dashboard"));
    const checked: string[] = [];
    for (const widget of widgets) {
      const card = page.locator(`[data-focus-target="widget:${widget.id}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole("heading", { name: widget.name, exact: true })).toBeVisible();
      if (widget.kind === "chart" && widget.displayType === "number") {
        // A single number opens its records without repeating the number as a preview.
        await card.getByRole("heading", { name: widget.name, exact: true }).click();
        const drawer = page.getByRole("dialog", { name: widget.name, exact: true });
        await expect(drawer.locator("[data-linked-records-summary]")).toHaveText(/^\d+ contributing records?$/u);
        await expect(drawer.locator("[data-widget-detail-chart]")).toHaveCount(0);
        await closeDrawer(page, drawer);
      } else if (widget.kind === "chart") await checkChart(page, card, widget);
      else if (widget.kind === "calendar" && widget.calendarLayout === "upcoming") {
        const item = card.locator("[data-calendar-item] a").first();
        await expect(item, `${widget.name} lists records`).toBeVisible();
        await item.click();
        const record = page.getByRole("dialog").last();
        await expect(record).toBeVisible();
        await expect(page).toHaveURL(/\/dashboard/u);
        await closeDrawer(page, record);
      } else if (widget.kind === "calendar") {
        const days = card.locator('[data-calendar-day]:not([data-heat="0"])');
        await expect(days.first(), `${widget.name} has busy days`).toBeVisible();
        const day = /^(.+): /u.exec((await days.first().getAttribute("aria-label")) ?? "")?.[1] ?? "";
        await days.first().click();
        const drawer = page.getByRole("dialog", { name: day, exact: true });
        await expect(drawer.locator("[data-linked-records-summary]")).toHaveText(
          new RegExp(`^${escapeText(widget.name)}${CONTRIBUTING.source}`, "u"),
        );
        const other = drawer.locator('[data-widget-detail-chart] [data-calendar-day]:not([data-heat="0"])').nth(1);
        if ((await other.count()) > 0) {
          const otherDay = /^(.+): /u.exec((await other.getAttribute("aria-label")) ?? "")?.[1] ?? "";
          await other.click();
          await expect(page.getByRole("dialog", { name: otherDay, exact: true })).toBeVisible();
        }
        await closeDrawer(page, page.getByRole("dialog"));
      } else if (widget.kind === "map") {
        const viewport = card.locator("[data-zoom]").first();
        const pin = card.locator('[data-map-marker="pin"]').first();
        await expect(card.locator("[data-map-marker]").first(), `${widget.name} places markers`).toBeVisible();
        for (let step = 0; step < 8 && (await pin.count()) === 0; step += 1) {
          const zoom = await viewport.getAttribute("data-zoom");
          await card.locator('[data-map-marker="cluster"]').first().click();
          await expect
            .poll(async () => (await pin.count()) > 0 || (await viewport.getAttribute("data-zoom")) !== zoom)
            .toBe(true);
        }
        await pin.click();
        const details = page.locator("[data-map-widget-popover]");
        await details.getByRole("link", { name: "Open record", exact: true }).click();
        const record = page.getByRole("dialog").last();
        await expect(record).toBeVisible();
        await closeDrawer(page, record);
      } else if (widget.kind === "activityTimeline") {
        const entry = card.locator('[data-slot="card-content"] button, [data-widget-interactive] button').first();
        if (e2eAppMode() === "self-hosted" && (await card.locator('[data-page-state="empty"]').count()) > 0) {
          checked.push(`${widget.name}: empty on self-hosted`);
          continue;
        }
        await expect(entry, `${widget.name} lists activities`).toBeVisible();
        expectBlockedEmailScripts(page);
        await entry.click();
        const detail = page.getByRole("dialog").last();
        await expect(detail).toBeVisible();
        await closeDrawer(page, detail);
      } else throw new Error(`No click check for ${widget.name} (${widget.kind})`);
      checked.push(`${widget.name}: ${widget.kind}${widget.displayType ? ` ${widget.displayType}` : ""}`);
    }
    testInfo.annotations.push({ type: "checked", description: checked.join("; ") });
    expect(errors).toEqual([]);
  });
}
