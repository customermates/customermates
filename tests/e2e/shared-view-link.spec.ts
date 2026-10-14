import type { Page, TestInfo } from "@playwright/test";
import type { Client } from "pg";

import { randomUUID } from "node:crypto";

import englishMessages from "../../i18n/locales/en.json" with { type: "json" };
import { presetId } from "../../features/records/crm-preset";
import { relationshipColumnKey } from "../../features/records/record-column.schema";
import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RecordOperationResultSchema } from "../../features/records/record-query.schema";
import { expect, test, collectPageErrors } from "./fixtures";
import { secondUser } from "./second-user";

type ViewRow = {
  id: string;
  name: string;
  searchTerm: string | null;
  pageSize: number | null;
  sortDescriptor: unknown;
  hiddenColumns: string[] | null;
  columnOrder: string[] | null;
};

const VIEW_COLUMNS = '"id",name,"searchTerm","pageSize","sortDescriptor","hiddenColumns","columnOrder"';

async function viewRows(database: Client, companyId: string, surfaceKey: string, name: string) {
  return (
    await database.query<ViewRow>(
      `SELECT ${VIEW_COLUMNS},"userId" FROM "DataView" WHERE "companyId"=$1 AND "surfaceKey"=$2 AND name=$3 AND "deletedAt" IS NULL ORDER BY "createdAt"`,
      [companyId, surfaceKey, name],
    )
  ).rows as (ViewRow & { userId: string })[];
}

async function copyViewLink(page: Page, typeId: string, viewId: string) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async (text: string) => {
        (window as unknown as { copiedViewLink?: string }).copiedViewLink = text;
      },
    });
  });
  await page.goto(`/en/records/${typeId}?view=${viewId}`);
  await expect(page.locator(`[data-focus-target="view:${viewId}"]`)).toHaveAttribute("aria-current", "page");
  await page.locator("#global-data-views-menu").click();
  await page.getByRole("menuitem", { name: englishMessages.DataView.views.copyLink, exact: true }).click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(englishMessages.DataView.views.linkCopied);
  const link = await page.evaluate(() => (window as unknown as { copiedViewLink?: string }).copiedViewLink);
  expect(link).toBeTruthy();
  return new URL(link!);
}

async function openAsUnsavedChanges(page: Page, link: URL, name: string) {
  await page.goto(`${link.pathname}${link.search}`);
  const proposed = page.locator("#global-data-views-proposed");
  await expect(proposed).toHaveText(new RegExp(name));
  await expect(proposed).toHaveAttribute("data-view-modified", "");
  await expect(page.locator("#global-data-views-all")).not.toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL((url) => !url.searchParams.has("viewShare") && !url.searchParams.has("view"));
  await expect(page).toHaveURL((url) => url.searchParams.get("searchTerm") === "Shared");
  await expect(page).toHaveURL((url) => url.searchParams.get("pageSize") === "10");
}

async function saveAsOwnView(page: Page, name: string) {
  await page.locator("#global-data-views-menu").click();
  await page.locator("#global-data-views-save").click();
  await expect(page.locator("#global-data-views-proposed")).toHaveCount(0);
  const created = page.locator("#global-data-views").getByRole("link", { name, exact: true });
  await expect(created).toHaveAttribute("aria-current", "page");
  await expect(created).not.toHaveAttribute("data-view-modified");
}

function columnHeader(page: Page, label: string) {
  return page.getByRole("columnheader").filter({ hasText: new RegExp(`^\\W*${label}\\W*$`, "i") });
}

async function createDeal(page: Page, companyId: string, name: string) {
  const model = RecordModelSchema.parse(await (await page.request.post("/api/v1/model/read", { data: {} })).json());
  const response = await page.request.post("/api/v1/records/mutate", {
    data: {
      expectedRevision: model.revision,
      idempotencyKey: randomUUID(),
      mutation: {
        action: "create",
        typeId: presetId(companyId, "deal"),
        fields: [{ fieldId: presetId(companyId, "deal.name"), value: { kind: "text", value: name } }],
      },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  expect(RecordOperationResultSchema.parse(await response.json()).status).toBe("completed");
}

async function shareFixture(page: Page, companyId: string, name: string, hiddenColumns: string[]) {
  const typeId = presetId(companyId, "deal");
  await createDeal(page, companyId, `Shared ${name}`);
  const surfaceKey = `records:${typeId}`;
  const sortDescriptor = { field: presetId(companyId, "deal.totalValue"), direction: "desc" };
  const response = await page.request.post("/api/v1/data-views/create", {
    data: { surfaceKey, name, state: { searchTerm: "Shared", pageSize: 10, sortDescriptor, hiddenColumns } },
  });
  expect(response.status(), await response.text()).toBe(200);
  const { viewKey } = (await response.json()) as { viewKey: string };
  return { typeId, surfaceKey, sortDescriptor, viewId: viewKey };
}

test("opens a colleague's view link as unsaved changes and saves it as an independent personal view", async ({
  page,
  browser,
  database,
  companyId,
  workspace,
}, testInfo: TestInfo) => {
  test.setTimeout(240000);
  const errors = collectPageErrors(page);
  const quantity = presetId(companyId, "deal.totalQuantity");
  const name = `Shared pipeline ${randomUUID().slice(0, 6)}`;
  const { typeId, surfaceKey, sortDescriptor, viewId } = await shareFixture(page, companyId, name, [quantity]);
  const [original] = await viewRows(database, companyId, surfaceKey, name);

  const link = await copyViewLink(page, typeId, viewId);
  expect(link.pathname).toBe(`/en/records/${typeId}`);
  expect(link.searchParams.get("view")).toBe(viewId);
  expect(link.searchParams.has("viewShare")).toBe(true);

  const colleague = await secondUser(browser, database, companyId, testInfo);
  try {
    await openAsUnsavedChanges(colleague.page, link, name);
    if (testInfo.project.name !== "mobile") {
      await expect(columnHeader(colleague.page, "Value")).toBeVisible();
      await expect(columnHeader(colleague.page, "Quantity")).toHaveCount(0);
    }
    await colleague.page.screenshot({ path: testInfo.outputPath("shared-view-recipient.png"), animations: "disabled" });
    await saveAsOwnView(colleague.page, name);

    await expect.poll(async () => (await viewRows(database, companyId, surfaceKey, name)).length).toBe(2);
    const [sender, recipient] = await viewRows(database, companyId, surfaceKey, name);
    expect(sender).toEqual(original);
    expect(sender.userId).toBe(workspace.userId);
    expect(recipient.userId).not.toBe(workspace.userId);
    expect(recipient.id).not.toBe(viewId);
    expect(recipient).toMatchObject({ searchTerm: "Shared", pageSize: 10, sortDescriptor, hiddenColumns: [quantity] });
    expect(colleague.errors).toEqual([]);
  } finally {
    await colleague.close();
  }

  await page.goto(`${link.pathname}${link.search}`);
  const own = page.locator(`[data-focus-target="view:${viewId}"]`);
  await expect(own).toHaveAttribute("aria-current", "page");
  await expect(own).not.toHaveAttribute("data-view-modified");
  await expect(page.locator("#global-data-views-proposed")).toHaveCount(0);
  await expect(page).toHaveURL((url) => !url.searchParams.has("viewShare") && url.searchParams.get("view") === viewId);
  expect(errors).toEqual([]);
});

test("leaves out a shared column from a list the colleague cannot read", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo: TestInfo) => {
  test.setTimeout(240000);
  const quantity = presetId(companyId, "deal.totalQuantity");
  const organizations = relationshipColumnKey(presetId(companyId, "deal.organizations"), "outgoing");
  const name = `Shared without organizations ${randomUUID().slice(0, 6)}`;
  const { typeId, surfaceKey, viewId } = await shareFixture(page, companyId, name, [quantity, organizations]);
  const [original] = await viewRows(database, companyId, surfaceKey, name);
  expect(original.hiddenColumns).toEqual([quantity, organizations]);
  const link = await copyViewLink(page, typeId, viewId);

  const model = await page.request.post("/api/v1/model/read", { data: {} });
  const { revision } = (await model.json()) as { revision: number };
  const saved = await page.request.post("/api/v1/roles/save", {
    data: {
      name: `Deals only ${randomUUID().slice(0, 6)}`,
      description: "Reads deals and nothing else",
      permissions: [{ resource: "company", actions: [] }],
      recordGrants: [{ typeId, actions: ["readAll"] }],
      expectedRevision: revision,
      idempotencyKey: randomUUID(),
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const roleId = ((await saved.json()) as { role: { id: string } }).role.id;
  const member = await secondUser(browser, database, companyId, testInfo, roleId);
  try {
    await openAsUnsavedChanges(member.page, link, name);
    if (testInfo.project.name !== "mobile") {
      await expect(columnHeader(member.page, "Value")).toBeVisible();
      await expect(columnHeader(member.page, "Organizations")).toHaveCount(0);
    }
    await saveAsOwnView(member.page, name);

    await expect.poll(async () => (await viewRows(database, companyId, surfaceKey, name)).length).toBe(2);
    const [sender, recipient] = await viewRows(database, companyId, surfaceKey, name);
    expect(sender).toEqual(original);
    expect(recipient.hiddenColumns).toEqual([quantity]);
    expect(JSON.stringify(recipient)).not.toContain(organizations);
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
});
