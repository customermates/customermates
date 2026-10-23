import { appPath } from "./app-paths";
import { DEMO_COMPANY_ID, DEMO_SLUG, demoId, expect, test } from "./demo-seed";
import { expectHydrated } from "./workspace-switching";
import { linkedRecordNames, linkedRecordOpeners } from "./record-rows";

/** Sub-lists and relationship paths of the seeded workspace: deal line items, and the Deals path of a service. */
test("a deal shows its line items with the default line item columns", async ({ page, database, errors }, testInfo) => {
  const { rows: deals } = await database.query<{ id: string; items: number }>(
    `SELECT l."targetId" AS id, count(*)::int AS items FROM "RecordLink" l
     JOIN "CrmRecord" r ON r."companyId"=l."companyId" AND r."typeId"=l."sourceTypeId" AND r.id=l."sourceId"
     WHERE l."companyId"=$1 AND l."relationId"=$2 AND r."deletedAt" IS NULL
     GROUP BY l."targetId" ORDER BY count(*) DESC, l."targetId" LIMIT 1`,
    [DEMO_COMPANY_ID, demoId("lineItem.deal")],
  );
  const deal = deals[0];
  expect(deal.items).toBeGreaterThanOrEqual(2);
  const { rows: quantities } = await database.query<{ quantity: string }>(
    `SELECT v."decimalValue"::numeric::text AS quantity FROM "RecordLink" l
     JOIN "RecordValue" v ON v."companyId"=l."companyId" AND v."recordId"=l."sourceId" AND v."fieldId"=$3
     WHERE l."companyId"=$1 AND l."relationId"=$2 AND l."targetId"=$4`,
    [DEMO_COMPANY_ID, demoId("lineItem.deal"), demoId("lineItem.quantity"), deal.id],
  );

  await page.goto(appPath(DEMO_SLUG, `/records/${demoId("deal")}/${deal.id}`));
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const lines = main.getByRole("region", { name: "Line items", exact: true });
  await expect(lines.locator("[data-embedded-count]")).toHaveText(String(deal.items));
  await expect(lines.locator("[data-row-id], [data-item-id]")).toHaveCount(deal.items);
  // Phones show the sub-list as rows without column headers; the columns are a desktop check.
  if (testInfo.project.use.isMobile) return expect(errors).toEqual([]);
  // Without a personal column choice the sub-list shows the line item's own fields; system columns stay in the menu.
  const headers = lines.getByRole("columnheader");
  const column = (label: string) => headers.filter({ hasText: new RegExp(`^\\W*${label}\\W*$`, "i") });
  for (const label of ["Name", "Quantity", "Unit price", "Amount"])
    await expect(column(label), `${label} column`).toHaveCount(1);
  for (const label of ["Notes", "Created at", "Assigned to"])
    await expect(column(label), `${label} column`).toHaveCount(0);
  await lines.getByRole("button", { name: "Columns for Line items", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Columns for Line items", exact: true });
  await expect(menu.getByRole("checkbox", { name: "Created at", exact: true })).not.toBeChecked();
  await expect(menu.getByRole("checkbox", { name: "Unit price", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  for (const { quantity } of quantities)
    await expect(lines.getByText(Number(quantity).toLocaleString("en-GB"), { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("a service lists the deals that sell it and explains the full path in the info popover", async ({
  page,
  database,
  errors,
}) => {
  const { rows } = await database.query<{ serviceId: string; dealId: string; deal: string }>(
    `SELECT s."targetId" AS "serviceId", d."targetId" AS "dealId", v."textValue" AS deal FROM "RecordLink" s
     JOIN "RecordLink" d ON d."companyId"=s."companyId" AND d."relationId"=$3 AND d."sourceId"=s."sourceId"
     JOIN "RecordValue" v ON v."companyId"=d."companyId" AND v."recordId"=d."targetId" AND v."fieldId"=$4
     WHERE s."companyId"=$1 AND s."relationId"=$2 ORDER BY s."targetId", v."textValue"`,
    [DEMO_COMPANY_ID, demoId("lineItem.service"), demoId("lineItem.deal"), demoId("deal.name")],
  );
  const dealsOf = (id: string) =>
    new Map(rows.filter((row) => row.serviceId === id).map((row) => [row.dealId, row.deal]));
  const serviceId = [...new Set(rows.map((row) => row.serviceId))].sort(
    (left, right) => dealsOf(right).size - dealsOf(left).size,
  )[0];
  const deals = dealsOf(serviceId);
  expect(deals.size).toBeGreaterThan(0);

  await page.goto(appPath(DEMO_SLUG, `/records/${demoId("service")}/${serviceId}`));
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const path = main.getByRole("region", { name: "Deals", exact: true });
  await expect(path).toBeVisible();
  const chips = path.locator("[data-chip-id]");
  const more = path.getByRole("button", { name: /^\+\d+ more$/ });
  await expect(chips.first()).toBeVisible();
  const hidden = async () =>
    (await more.isVisible()) ? Number((await more.innerText()).match(/\d+/)?.[0]) : 0;
  await expect.poll(async () => (await chips.count()) + (await hidden())).toBe(deals.size);
  const shown = (await chips.getByRole("button", { name: /^Open / }).allInnerTexts()).map((name) => name.trim());
  expect(shown.length).toBeGreaterThan(0);
  for (const name of shown) expect([...deals.values()], name).toContain(name);
  await expect
    .poll(() =>
      chips.evaluateAll((elements) => {
        const parent = elements[0]?.parentElement;
        if (!parent) throw new Error("The relationship chip stack is missing");
        return new Set(
          Array.from(parent.children)
            .filter((element) => element.hasAttribute("data-chip-id") || element.tagName === "BUTTON")
            .map((element) => Math.round(element.getBoundingClientRect().top)),
        ).size;
      }),
    )
    .toBeLessThanOrEqual(3);
  if (!(await more.isVisible())) expect([...shown].sort()).toEqual([...deals.values()].sort());
  else {
    await more.click();
    const drawer = page.getByRole("dialog").filter({ has: page.locator("[data-linked-records]") });
    await expect(drawer.getByRole("heading", { name: "Deals", exact: true })).toBeVisible();
    await expect(drawer).toContainText(`${deals.size} records`);
    const drawerRows = linkedRecordOpeners(drawer);
    const seen: string[] = [];
    for (let index = 0; index < Math.ceil(deals.size / 10); index++) {
      await expect(drawerRows).toHaveCount(Math.min(10, deals.size - index * 10));
      const names = await linkedRecordNames(drawer);
      seen.push(...names);
      if (seen.length < deals.size) {
        await drawer.getByRole("button", { name: "Next page", exact: true }).click();
        await expect.poll(async () => (await linkedRecordNames(drawer))[0]).not.toBe(names[0]);
      }
  }
  expect(seen.sort()).toEqual([...deals.values()].sort());
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(more).toBeFocused();
  }
  await path.getByRole("button", { name: "Where Deals comes from", exact: true }).click();
  const popover = page.getByRole("dialog", { name: "Where Deals comes from", exact: true });
  await expect(popover.locator("[data-field-derivation]")).toContainText("Through linked records · Line items → Deals");
  expect(errors).toEqual([]);
});

test("board chips have equal visible gaps around editable and read-only values", async ({ page, errors }) => {
  await page.goto(appPath(DEMO_SLUG, `/records/${demoId("deal")}?viewMode=card&groupBy=${demoId("deal.stage")}`));
  const row = page.locator("[data-chip-row]").first();
  await expect(row).toBeVisible();
  await expectHydrated(row.locator("[data-edit-target]").first());
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        row.evaluate((element) => {
          const rows = new Map<number, DOMRect[]>();
          for (const column of element.querySelectorAll(":scope > [data-chip-column]")) {
            const badge = column.querySelector("[data-slot=badge]");
            if (!badge) continue;
            const bounds = badge.getBoundingClientRect();
            const top = Math.round(bounds.top);
            rows.set(top, [...(rows.get(top) ?? []), bounds]);
          }
          const lines = [...rows.values()];
          const horizontal = lines.flatMap((line) =>
            line.slice(1).map((bounds, index) => bounds.left - line[index].right),
          );
          const vertical = lines
            .slice(1)
            .map((line, index) => line[0].top - Math.max(...lines[index].map((bounds) => bounds.bottom)));
          return (
            horizontal.length > 0 &&
            vertical.length > 0 &&
            [...horizontal, ...vertical].every((gap) => Math.abs(gap - 4) <= 1)
          );
        }),
      )
      .toBe(true);
  }
  expect(errors).toEqual([]);
});
