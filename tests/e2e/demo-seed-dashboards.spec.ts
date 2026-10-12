import { WIDGET_GRID_GAP } from "../../features/widget/widget-grid";

import {
  DEMO_COMPANY_ID,
  DEMO_DASHBOARDS,
  DEMO_MEMBERS,
  displayedNumber,
  expect,
  test,
} from "./demo-seed";

type SeededWidget = {
  id: string;
  name: string;
  kind: string;
  displayType: string | null;
};

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
    if (!testInfo.project.use.isMobile)
      await page.setViewportSize({ width: 1440, height: 2600 });
    // Sales is the main dashboard, so /en/dashboard opens on it; the other dashboards are views.
    await page.goto(
      dashboard.id ? `/en/dashboard?view=${dashboard.id}` : "/en/dashboard",
    );
    const rail = page.locator("[data-joins-top-bar]");
    await expect(
      rail.getByText(dashboard.id ? dashboard.name : "Main", { exact: true }),
    ).toBeVisible();
    for (const other of DEMO_DASHBOARDS.filter(({ id }) => id))
      await expect(rail.getByText(other.name, { exact: true })).toBeVisible();

    for (const widget of widgets) {
      const card = page.locator(`[data-focus-target="widget:${widget.id}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(
        card.getByRole("heading", { name: widget.name, exact: true }),
      ).toBeVisible();
      await expect(
        card.getByText(
          /measure is unavailable|Calculation unavailable|could not be loaded/,
        ),
      ).toHaveCount(0);
      await expect(card.locator('[data-slot="widget-empty"]')).toHaveCount(0);
      if (widget.kind === "activityTimeline") {
        // The count reads "0 activities" until the timeline loaded.
        await expect(
          card.getByText(/^[1-9]\d* activit(y|ies)$/),
          widget.name,
        ).toBeVisible();
        await expect(
          card.getByText(/No activity|Connect a messaging/),
        ).toHaveCount(0);
        continue;
      }
      if (widget.displayType === "number") {
        const number = card.locator('[data-slot="widget-number"]');
        const value = number.locator('[data-slot="widget-number-value"]');
        await expect(value, widget.name).toHaveText(/\d/);
        expect(
          displayedNumber(await value.innerText()),
          `${widget.name} value`,
        ).not.toBe(0);
        const context = await number
          .locator('[data-slot="widget-number-context"]')
          .innerText();
        expect(
          displayedNumber(context.split(" ")[0] ?? ""),
          `${widget.name} records`,
        ).toBeGreaterThan(0);
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
      await expect(
        drawn.first(),
        `${widget.name} draws its data`,
      ).toBeVisible();
    }

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page
        .locator(`[data-focus-target="widget:${widgets[0].id}"]`)
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(
          `dashboard-${dashboard.name.toLowerCase().replace(/\W+/g, "-")}-${scheme}.png`,
        ),
        fullPage: true,
        animations: "disabled",
      });
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [1440, 390]) {
  test(`every dashboard opens with a full-width, unclipped metric row at ${width}px`, async ({
    page,
    errors,
  }, testInfo) => {
    // A phone stays a phone: the desktop width is checked on the desktop projects.
    test.skip(
      Boolean(testInfo.project.use.isMobile) && width > 600,
      "Desktop widths run on desktop projects",
    );
    await page.setViewportSize({ width, height: 1000 });
    for (const dashboard of DEMO_DASHBOARDS) {
      await page.goto(
        dashboard.id ? `/en/dashboard?view=${dashboard.id}` : "/en/dashboard",
      );
      const numbers = page.locator('[data-slot="widget-number"]');
      await expect(
        numbers.first().locator('[data-slot="widget-number-value"]'),
      ).toHaveText(/\d/);
      // The grid re-measures its width after the cards mount and animates them into place, so wait until
      // every card row spans the grid before reading the geometry.
      await expect
        .poll(
          () =>
            page.evaluate((gap) => {
              const grid = document
                .querySelector(".react-grid-layout")
                ?.getBoundingClientRect();
              if (!grid) return Number.POSITIVE_INFINITY;
              const rows = new Map<number, number[]>();
              for (const item of document.querySelectorAll(
                ".react-grid-item",
              )) {
                const rect = item.getBoundingClientRect();
                rows.set(Math.round(rect.top), [
                  ...(rows.get(Math.round(rect.top)) ?? []),
                  rect.width,
                ]);
              }
              return Math.max(
                ...[...rows.values()].map((widths) =>
                  Math.abs(
                    widths.reduce((sum, width) => sum + width, 0) +
                      gap * (widths.length - 1) -
                      grid.width,
                  ),
                ),
              );
            }, WIDGET_GRID_GAP),
          { timeout: 10_000 },
        )
        .toBeLessThanOrEqual(2);
      const grid = await page.locator(".react-grid-layout").boundingBox();
      if (!grid)
        throw new Error(
          `${dashboard.name}: the dashboard grid is not rendered`,
        );
      const cards = page.locator(
        '.react-grid-item:has([data-slot="widget-number"])',
      );
      await expect(cards).toHaveCount(4);
      const boxes = (await cards.evaluateAll((items) =>
        items.map((item) => {
          const rect = item.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y + window.scrollY,
            width: rect.width,
            height: rect.height,
          };
        }),
      )) as Array<{ x: number; y: number; width: number; height: number }>;
      const rows = new Map<number, typeof boxes>();
      for (const box of boxes)
        rows.set(Math.round(box.y), [
          ...(rows.get(Math.round(box.y)) ?? []),
          box,
        ]);
      for (const [top, row] of rows) {
        const span =
          row.reduce((sum, box) => sum + box.width, 0) +
          WIDGET_GRID_GAP * (row.length - 1);
        expect(
          Math.abs(span - grid.width),
          `${dashboard.name} row at ${top}px spans the grid`,
        ).toBeLessThanOrEqual(2);
        expect(
          Math.min(...row.map((box) => box.x)) - grid.x,
          `${dashboard.name} row starts at the edge`,
        ).toBeLessThan(2);
        for (const box of row)
          expect(
            box.height,
            `${dashboard.name} number card height`,
          ).toBeLessThanOrEqual(124);
      }
      expect(
        new Set(boxes.map((box) => Math.round(box.height))).size,
        `${dashboard.name} equal heights`,
      ).toBe(1);
      const clipped = await page
        .locator(
          '[data-slot="widget-number"] :is([data-slot="widget-number-value"], [data-slot="widget-number-context"]), .react-grid-item:has([data-slot="widget-number"]) [data-slot="card"]',
        )
        .evaluateAll((elements) =>
          elements.flatMap((element) => {
            const box = element.closest("p") ?? element;
            return box.scrollHeight > box.clientHeight
              ? [`${box.textContent} ${box.scrollHeight}>${box.clientHeight}`]
              : [];
          }),
        );
      expect(clipped, `${dashboard.name} clips no number text`).toEqual([]);
      if (
        dashboard.name === "Sales" ||
        dashboard.name === "Revenue and renewals"
      ) {
        // The page panel scrolls rather than the window, so a viewport as tall as the grid shows every card.
        const bottom = await page
          .locator(".react-grid-item")
          .evaluateAll((items) =>
            Math.max(
              ...items.map((item) => item.getBoundingClientRect().bottom),
            ),
          );
        await page.setViewportSize({ width, height: Math.ceil(bottom + 24) });
        await page.waitForTimeout(500);
        for (const scheme of ["light", "dark"] as const) {
          await page.emulateMedia({ colorScheme: scheme });
          await page.screenshot({
            path: testInfo.outputPath(
              `metrics-${width}-${dashboard.name.toLowerCase().replace(/\W+/g, "-")}-${scheme}.png`,
            ),
            fullPage: true,
            animations: "disabled",
          });
        }
        await page.emulateMedia({ colorScheme: "light" });
        await page.setViewportSize({ width, height: 1000 });
      }
    }
    expect(errors).toEqual([]);
  });
}
