import { DEMO_COMPANY_ID, demoId, expect, test } from "./demo-seed";

/** Sub-lists and relationship paths of the seeded workspace: deal line items, and the Deals path of a service. */
test("a deal shows its line items with Max's curated line item columns", async ({ page, database, errors }, testInfo) => {
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
  const { rows } = await database.query<{ serviceId: string; deal: string }>(
    `SELECT s."targetId" AS "serviceId", v."textValue" AS deal FROM "RecordLink" s
     JOIN "RecordLink" d ON d."companyId"=s."companyId" AND d."relationId"=$3 AND d."sourceId"=s."sourceId"
     JOIN "RecordValue" v ON v."companyId"=d."companyId" AND v."recordId"=d."targetId" AND v."fieldId"=$4
     WHERE s."companyId"=$1 AND s."relationId"=$2 ORDER BY s."targetId", v."textValue"`,
    [DEMO_COMPANY_ID, demoId("lineItem.service"), demoId("lineItem.deal"), demoId("deal.name")],
  );
  const serviceId = rows[0].serviceId;
  const deals = new Set(rows.filter((row) => row.serviceId === serviceId).map((row) => row.deal));
  expect(deals.size).toBeGreaterThan(0);

  await page.goto(`/en/records/${demoId("service")}/${serviceId}`);
  const main = page.getByRole("main");
  const overview = main.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
  const path = main.getByRole("region", { name: "Deals", exact: true });
  await expect(path).toBeVisible();
  // The path lists the deals page by page; every deal shown sells this service.
  const chips = path.getByRole("button", { name: /^Open / });
  await expect(chips.first()).toBeVisible();
  const shown = (await chips.allInnerTexts()).map((name) => name.trim());
  expect(shown.length).toBe(Math.min(deals.size, 25));
  for (const name of shown) expect([...deals], name).toContain(name);
  await path.getByRole("button", { name: "Where Deals comes from", exact: true }).click();
  const popover = page.getByRole("dialog", { name: "Where Deals comes from", exact: true });
  await expect(popover.locator("[data-field-derivation]")).toContainText("Through linked records · Line items → Deals");
  expect(errors).toEqual([]);
});
