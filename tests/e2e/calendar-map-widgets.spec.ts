import type { Page } from "@playwright/test";

import { DEMO_COMPANY_ID, DEMO_DASHBOARDS, DEMO_MEMBERS, expect, test } from "./demo-seed";
import { localE2eEnvironment } from "./local-environment";

const REVENUE = DEMO_DASHBOARDS.find((dashboard) => dashboard.name === "Revenue and renewals")!.id;

/** Requests the page sends to another origin. Seeded avatar photos point at the public website. */
function externalRequests(page: Page) {
  const origin = localE2eEnvironment().baseUrl;
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin && !url.pathname.startsWith("/demo/avatars/"))
      requests.push(url.href);
  });
  return requests;
}

test("the map widget draws its basemap and pins from the app's own origin", async ({ page, errors }) => {
  const external = externalRequests(page);
  const basemap: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/maps/v1/world.json") basemap.push(response.status());
  });
  await page.goto(`/en/dashboard?view=${REVENUE}`);
  const card = page.locator('[data-widget-kind="map"]');
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => basemap, { message: "the world basemap loads from public/maps" }).toEqual([200]);
  const markers = card.locator("[data-map-marker]");
  await expect(markers.first()).toBeVisible();
  await expect(card.locator("[data-map-legend]").first()).toBeVisible();
  // The seeded customers span several segments, so the legend explains the neutral ring of clusters without a majority.
  await expect(card.locator('[data-map-legend="mixed"]')).toHaveText("Mixed");
  await card.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(markers.first()).toBeVisible();
  const viewport = card.locator("[data-map-viewport]");
  const pin = card.locator('[data-map-marker="pin"]').first();
  for (let step = 0; step < 8 && (await pin.count()) === 0; step += 1) {
    const zoom = await viewport.getAttribute("data-zoom");
    await card.locator('[data-map-marker="cluster"]').first().click();
    await expect
      .poll(async () => (await pin.count()) > 0 || (await viewport.getAttribute("data-zoom")) !== zoom)
      .toBe(true);
  }
  await pin.click();
  const details = page.locator("[data-map-widget-popover]");
  await expect(details).toBeVisible();
  // A plain click opens the record drawer over the dashboard; the link keeps the record page for a new tab.
  await expect(details.getByRole("link", { name: "Open record", exact: true })).toHaveAttribute(
    "href",
    /\/records\/[^/]+\/[^/]+$/,
  );
  await details.getByRole("link", { name: "Open record", exact: true }).click();
  await expect(page.getByRole("dialog").last()).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("the calendar widgets list upcoming records and open a day of the month overview", async ({
  page,
  errors,
}) => {
  await page.goto("/en/dashboard");
  const upcoming = page.locator('[data-calendar-layout="upcoming"]');
  await upcoming.scrollIntoViewIfNeeded();
  await expect(upcoming.locator("[data-calendar-item]").first()).toBeVisible();
  const month = page.locator('[data-calendar-layout="month"]');
  await month.scrollIntoViewIfNeeded();
  const busyDay = month.locator('[data-calendar-day]:not([data-heat="0"])').first();
  await expect(busyDay).toBeVisible();
  const date = await busyDay.getAttribute("data-calendar-day");
  await busyDay.click();
  await expect(page.locator(`[data-calendar-day-records="${date}"] a`).first()).toBeVisible();
  await page.keyboard.press("Escape");
  const shown = await month.getAttribute("data-calendar-month");
  await month.getByRole("button", { name: "Next month" }).click();
  await expect(month).not.toHaveAttribute("data-calendar-month", shown ?? "");
  await month.getByRole("button", { name: "Previous month" }).click();
  await expect(month).toHaveAttribute("data-calendar-month", shown ?? "");
  expect(errors).toEqual([]);
});

test("the widget builder creates a map widget and an upcoming calendar widget", async ({
  page,
  database,
  errors,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The builder's phone layout is covered by the widget control specs");
  test.setTimeout(180000);
  const names = [`Map from the builder ${Date.now()}`, `Upcoming from the builder ${Date.now()}`];
  try {
    await page.goto(`/en/dashboard?view=${REVENUE}`);
    for (const [starter, name] of [
      ["#widget-kind-map", names[0]],
      ["#widget-kind-calendar-upcoming", names[1]],
    ] as const) {
      await page.locator("#dashboard-add-widget").click();
      await page.getByRole("dialog").locator(starter).click();
      const dialog = page.getByRole("dialog", { name: "Add widget", exact: true });
      await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(name);
      const preview = dialog.locator('[data-slot="widget-preview"]');
      await expect(
        preview.locator(starter === "#widget-kind-map" ? "[data-map-marker]" : "[data-calendar-layout]").first(),
      ).toBeVisible();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const card = page.locator(`[data-widget-kind="${starter === "#widget-kind-map" ? "map" : "calendar"}"]`, {
        has: page.getByRole("heading", { name, exact: true }),
      });
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
    }
    const { rows } = await database.query<{ kind: string; timeZone: string | null }>(
      `SELECT kind::text AS kind, "calendarQuery"->>'timeZone' AS "timeZone" FROM "Widget"
       WHERE "companyId"=$1 AND "userId"=$2 AND name = ANY($3) AND "deletedAt" IS NULL ORDER BY kind`,
      [DEMO_COMPANY_ID, DEMO_MEMBERS.maxBergmann.userId, names],
    );
    expect(rows.map((row) => row.kind)).toEqual(["calendar", "map"]);
    expect(rows[0].timeZone).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {
    await database.query(`DELETE FROM "Widget" WHERE "companyId"=$1 AND name = ANY($2)`, [DEMO_COMPANY_ID, names]);
  }
});
