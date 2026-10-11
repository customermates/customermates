import { DEMO_COMPANY_ID, DEMO_DASHBOARDS, DEMO_MEMBERS, displayedNumber, expect, test } from "./demo-seed";

type SeededWidget = { id: string; name: string; kind: string; displayType: string | null };

for (const dashboard of DEMO_DASHBOARDS) {
  test(`the ${dashboard.name} dashboard renders every seeded widget with data`, async ({
    page,
    database,
    errors,
  }, testInfo) => {
    const { rows: widgets } = await database.query<SeededWidget>(
      `SELECT id, name, kind::text AS kind, "displayOptions"->>'displayType' AS "displayType" FROM "Widget"
       WHERE "companyId"=$1 AND "userId"=$2 AND id LIKE '15000000-%' AND "viewId" IS NOT DISTINCT FROM $3
       AND "deletedAt" IS NULL ORDER BY id`,
      [DEMO_COMPANY_ID, DEMO_MEMBERS.maxBergmann.userId, dashboard.id],
    );
    expect(widgets.length).toBeGreaterThanOrEqual(10);
    // A tall desktop viewport places every widget on screen, so each one loads and the screenshots show them all.
    if (!testInfo.project.use.isMobile) await page.setViewportSize({ width: 1440, height: 2600 });
    // Sales is the main dashboard, so /en/dashboard opens on it; the other dashboards are views.
    await page.goto(dashboard.id ? `/en/dashboard?view=${dashboard.id}` : "/en/dashboard");
    const rail = page.locator("[data-joins-top-bar]");
    await expect(rail.getByText(dashboard.id ? dashboard.name : "Main", { exact: true })).toBeVisible();
    for (const other of DEMO_DASHBOARDS.filter(({ id }) => id))
      await expect(rail.getByText(other.name, { exact: true })).toBeVisible();

    for (const widget of widgets) {
      const card = page.locator(`[data-focus-target="widget:${widget.id}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.getByRole("heading", { name: widget.name, exact: true })).toBeVisible();
      await expect(card.getByText(/measure is unavailable|Calculation unavailable|could not be loaded/)).toHaveCount(0);
      await expect(card.locator('[data-slot="widget-empty"]')).toHaveCount(0);
      if (widget.kind === "activityTimeline") {
        // The count reads "0 activities" until the timeline loaded.
        await expect(card.getByText(/^[1-9]\d* activit(y|ies)$/), widget.name).toBeVisible();
        await expect(card.getByText(/No activity|Connect a messaging/)).toHaveCount(0);
        continue;
      }
      if (widget.displayType === "number") {
        const number = card.locator('[data-slot="widget-number"]');
        const value = number.locator('[data-slot="widget-number-value"]');
        await expect(value, widget.name).toHaveText(/\d/);
        expect(displayedNumber(await value.innerText()), `${widget.name} value`).not.toBe(0);
        const context = await number.locator('[data-slot="widget-number-context"]').innerText();
        expect(displayedNumber(context.split(" ")[0] ?? ""), `${widget.name} records`).toBeGreaterThan(0);
        continue;
      }
      const marks = {
        rankedTable: '[data-slot="widget-ranked-table"] tbody tr',
        horizontalBarChartWithLabels: '[data-slot="widget-bar-row"]',
        funnelChart: '[data-slot="widget-funnel-step"]',
      }[widget.displayType ?? ""];
      // Charts drawn with recharts: bars, doughnut sectors, areas and radar polygons.
      const drawn = card.locator(
        marks ??
          "svg.recharts-surface :is(.recharts-rectangle, .recharts-sector, .recharts-area-area, .recharts-polygon)",
      );
      await expect(drawn.first(), `${widget.name} draws its data`).toBeVisible();
    }

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.locator(`[data-focus-target="widget:${widgets[0].id}"]`).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`dashboard-${dashboard.name.toLowerCase().replace(/\W+/g, "-")}-${scheme}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
    expect(errors).toEqual([]);
  });
}
