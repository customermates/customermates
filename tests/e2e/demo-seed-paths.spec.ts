import { DEMO_COMPANY_ID, demoId, expect, test } from "./demo-seed";
import { expectHydrated } from "./workspace-switching";

/** Sub-lists and relationship paths of the seeded workspace: deal line items, and the Deals path of a service. */
test("a deal shows its line items with Max's curated line item columns", async ({
  page,
  database,
  errors,
}, testInfo) => {
  const { rows: deals } = await database.query<{ id: string; items: number }>(
    `SELECT l."targetId" AS id, count(*)::int AS items FROM "RecordLink" l
     JOIN "CrmRecord" r ON r."companyId"=l."companyId" AND r."typeId"=l."sourceTypeId" AND r.id=l."sourceId"
     WHERE l."companyId"=$1 AND l."relationId"=$2 AND r."deletedAt" IS NULL
     GROUP BY l."targetId" ORDER BY count(*) DESC, l."targetId" LIMIT 1`,
    [DEMO_COMPANY_ID, demoId("lineItem.deal")],
  );
  const deal = deals[0];
  expect(deal.items).toBeGreaterThanOrEqual(3);
  const { rows: quantities } = await database.query<{ quantity: string }>(
    `SELECT v."decimalValue"::numeric::text AS quantity FROM "RecordLink" l
     JOIN "RecordValue" v ON v."companyId"=l."companyId" AND v."recordId"=l."sourceId" AND v."fieldId"=$3
     WHERE l."companyId"=$1 AND l."relationId"=$2 AND l."targetId"=$4`,
    [DEMO_COMPANY_ID, demoId("lineItem.deal"), demoId("lineItem.quantity"), deal.id],
  );

  await page.goto(`/en/records/${demoId("deal")}/${deal.id}`);
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const lines = main.getByRole("region", { name: "Line items", exact: true });
  await expect(lines.locator("[data-embedded-count]")).toHaveText(String(deal.items));
  await expect(lines.locator("[data-row-id], [data-item-id]")).toHaveCount(deal.items);
  // Phones show the sub-list as rows without column headers; the columns are a desktop check.
  if (testInfo.project.use.isMobile) return expect(errors).toEqual([]);
  // Max keeps a lean personal choice of sub-list columns; the other line item columns stay in the Columns menu.
  const headers = lines.getByRole("columnheader");
  const column = (label: string) => headers.filter({ hasText: new RegExp(`^\\W*${label}\\W*$`, "i") });
  for (const label of ["Name", "Quantity", "Unit price", "Amount"])
    await expect(column(label), `${label} column`).toHaveCount(1);
  for (const label of ["Pricing", "List amount", "Service", "Created at", "Assigned to"])
    await expect(column(label), `${label} column`).toHaveCount(0);
  await lines.getByRole("button", { name: "Columns for Line items", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Columns for Line items", exact: true });
  await expect(menu.getByRole("checkbox", { name: "Pricing", exact: true })).not.toBeChecked();
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
  const serviceId = rows[0].serviceId;
  const deals = new Map(rows.filter((row) => row.serviceId === serviceId).map((row) => [row.dealId, row.deal]));
  expect(deals.size).toBeGreaterThan(25);

  await page.goto(`/en/records/${demoId("service")}/${serviceId}`);
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const path = main.getByRole("region", { name: "Deals", exact: true });
  await expect(path).toBeVisible();
  const chips = path.locator("[data-chip-id]");
  const more = path.getByRole("button", { name: /^\+\d+ more$/ });
  await expect(more).toBeVisible();
  await expect
    .poll(async () => (await chips.count()) + Number((await more.innerText()).match(/\d+/)?.[0]))
    .toBe(deals.size);
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
    .toBe(3);
  await more.click();
  const picker = page.getByRole("dialog", { name: "Deals", exact: true });
  const list = picker.locator("[data-linked-record-list]");
  const options = list.getByRole("option");
  const search = picker.getByRole("combobox", { name: "Search...", exact: true });
  await expect(search).toBeFocused();
  await expect(picker).toContainText(`${deals.size} linked records`);
  await expect(picker.getByRole("button", { name: /^Unlink / })).toHaveCount(0);
  const seen = new Set<string>();
  for (let index = 0; index < Math.ceil(deals.size / 25); index++) {
    await expect(options).toHaveCount(Math.min(25, deals.size - index * 25));
    await expect(options.locator(".lucide-check")).toHaveCount(Math.min(25, deals.size - index * 25));
    const records = await options.evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute("data-value") ?? "",
        name: element.getAttribute("aria-label"),
      })),
    );
    for (const record of records) {
      expect(deals.get(record.id)).toBe(record.name);
      expect(seen.has(record.id)).toBe(false);
      seen.add(record.id);
    }
    if (seen.size < deals.size) {
      await picker.getByRole("button", { name: "Next page", exact: true }).click();
      await expect.poll(() => options.first().getAttribute("data-value")).not.toBe(records[0].id);
    }
  }
  expect([...seen].sort()).toEqual([...deals.keys()].sort());
  const [searchId, searchName] = [...deals.entries()][0];
  await search.fill(searchName);
  await expect(list.locator(`[role="option"][data-value="${searchId}"]`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(more).toBeFocused();
  await path.getByRole("button", { name: "Where Deals comes from", exact: true }).click();
  const popover = page.getByRole("dialog", { name: "Where Deals comes from", exact: true });
  await expect(popover.locator("[data-field-derivation]")).toContainText("Through linked records · Line items → Deals");
  expect(errors).toEqual([]);
});

test("board chips have equal visible gaps around editable and read-only values", async ({ page, errors }) => {
  await page.goto(`/en/records/${demoId("deal")}?viewMode=card&groupBy=${demoId("deal.stage")}`);
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
