import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import { RecordModelSchema } from "../../features/records/record-model.schema";
import { RoleApiMutationResultSchema } from "../../features/role/role-management.schema";
import { presetId } from "../../features/records/crm-preset";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { secondUser } from "./second-user";

async function post(page: Page, path: string, data: unknown): Promise<unknown> {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

async function showOverview(scope: Locator) {
  const overview = scope.getByRole("tab", { name: "Overview", exact: true });
  if (await overview.isVisible()) await overview.click();
}

test("renders every record detail field in the input box and explains calculated values from an info button", async ({
  page,
  browser,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const typeId = (key: string) => presetId(companyId, key);
  const dialogs = page.getByRole("dialog");
  await page.goto(`/en/records/${typeId("deal")}`);
  await page.locator("#records-add").click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Boxed opportunity");
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialogs).not.toBeVisible();
  const created = await database.query(
    'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1',
    [companyId, typeId("deal")],
  );
  await page.goto(`/en/records/${typeId("deal")}/${created.rows[0].id}`);
  const recordUrl = page.url();
  const main = page.getByRole("main");
  await showOverview(main);

  const lines = main.getByRole("region", { name: "Line items", exact: true });
  await lines.getByRole("button", { name: "Add Line item", exact: true }).click();
  await lines.getByRole("textbox", { name: "Add Line item", exact: true }).fill("Boxed line");
  await page.keyboard.press("Enter");
  await expect(lines.getByText("Boxed line", { exact: true }).first()).toBeVisible();
  const frame = lines.locator("[data-embedded-frame]");
  await expect(frame).toHaveCSS("border-top-width", "1px");
  await expect(frame).toHaveCSS("border-top-left-radius", /^[1-9]/);
  await expect(lines.locator("[data-embedded-count]")).toHaveText("1");

  const quantity = main.locator(`[data-entity-field="${typeId("deal.totalQuantity")}"]`);
  const output = quantity.locator('[data-field-state="read-only"]');
  const name = main.getByRole("textbox", { name: "Name", exact: false });
  await expect(output).toHaveCSS("border-top-width", "1px");
  await expect(output).toHaveCSS("padding-left", "12px");
  const [outputBox, nameBox] = [await output.boundingBox(), await name.boundingBox()];
  expect(outputBox?.height).toBe(nameBox?.height);
  await expect(quantity.getByText(/Calculated ·|adds up the/)).toHaveCount(0);
  await expect(quantity.locator("p")).toHaveCount(0);
  const createdAt = main.locator('[data-entity-field="system:createdAt"] [data-field-state="read-only"]');
  if (await createdAt.count()) await expect(createdAt).toHaveCSS("border-top-width", "1px");
  await expect(main.locator("[data-formatted-text-area]").first()).toHaveCSS("border-top-width", "1px");
  const services = main.getByRole("region", { name: "Services", exact: true });
  await expect(services.getByRole("button", { name: "Where Services comes from", exact: true })).toBeVisible();
  const switcher = page.locator('[data-detail-panel-switcher] [data-slot="segmented-control-list"]');
  if (await switcher.isVisible()) await expect(switcher).toHaveCSS("border-top-width", "1px");

  const info = quantity.getByRole("button", { name: "How Quantity is calculated", exact: true });
  const infoBox = await info.boundingBox();
  expect(infoBox?.width).toBe(16);
  const infoEnd = (infoBox?.x ?? 0) + (infoBox?.width ?? 0);
  expect(Math.abs(infoEnd - ((outputBox?.x ?? 0) + (outputBox?.width ?? 0) - 12))).toBeLessThanOrEqual(1);
  await info.click();
  const derivation = page.getByRole("dialog", { name: "How Quantity is calculated", exact: true });
  await expect(derivation).toBeVisible();
  const diagram = derivation.locator("[data-field-derivation-view] [data-calculation-readonly]");
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText("Line items");
  await expect(diagram).toContainText("Quantity");
  await expect(derivation.getByRole("button", { name: /^Add/ })).toHaveCount(0);
  const configure = derivation.getByRole("link", { name: "Edit in Configure", exact: true });
  await expect(configure).toHaveAttribute(
    "href",
    new RegExp(`/configure\\?typeId=${typeId("deal")}&tab=fields&focus=field%3A${typeId("deal.totalQuantity")}$`),
  );
  await page.screenshot({
    path: testInfo.outputPath(`deal-record-derivation-${testInfo.project.name}.png`),
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(derivation).toHaveCount(0);
  await expect(info).toBeFocused();

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await showOverview(main);
    await page.screenshot({
      path: testInfo.outputPath(`deal-record-${scheme}-${testInfo.project.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await lines.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`deal-record-${scheme}-${testInfo.project.name}-lines.png`),
      animations: "disabled",
    });
  }
  const viewport = page.viewportSize();
  if (viewport && viewport.width > 500) {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await showOverview(main);
      await page.screenshot({
        path: testInfo.outputPath(`deal-record-${scheme}-phone-width.png`),
        fullPage: true,
        animations: "disabled",
      });
      await lines.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: testInfo.outputPath(`deal-record-${scheme}-phone-width-lines.png`),
        animations: "disabled",
      });
    }
    await page.setViewportSize(viewport);
  }
  await page.emulateMedia({ colorScheme: "light" });

  const discovered = RecordModelSchema.parse(await post(page, "/api/v1/model/discover", {}));
  const saved = RoleApiMutationResultSchema.parse(
    await post(page, "/api/v1/roles/save", {
      name: "Deal readers",
      description: "Read deals without changing them or their configuration",
      permissions: [{ resource: "company", actions: [] }],
      recordGrants: ["deal", "service", "contact", "organization", "task"].map((key) => ({
        typeId: typeId(key),
        actions: ["readAll"],
      })),
      expectedRevision: discovered.revision,
      idempotencyKey: randomUUID(),
    }),
  );
  const member = await secondUser(browser, database, companyId, testInfo, saved.role.id);
  try {
    await member.page.goto(recordUrl);
    const memberMain = member.page.getByRole("main");
    await showOverview(memberMain);
    const memberQuantity = memberMain.locator(`[data-entity-field="${typeId("deal.totalQuantity")}"]`);
    const memberInfo = memberQuantity.getByRole("button", { name: "How Quantity is calculated", exact: true });
    await memberInfo.click();
    const memberDerivation = member.page.getByRole("dialog", { name: "How Quantity is calculated", exact: true });
    await expect(memberDerivation.locator("[data-field-derivation-view]")).toContainText("Line items");
    await expect(memberDerivation.getByRole("link", { name: "Edit in Configure", exact: true })).toHaveCount(0);
    await member.page.keyboard.press("Escape");
    await expect(memberDerivation).toHaveCount(0);
    const memberName = memberMain.getByRole("textbox", { name: "Name", exact: false });
    await expect(memberName).toHaveAttribute("readonly", "");
    await memberName.focus();
    await expect(member.page.getByRole("tooltip", { name: "You can't edit this field", exact: true })).toBeVisible();
    await expect(
      memberMain.locator(`[data-entity-field="${typeId("deal.name")}"]`).locator("[data-field-derivation-trigger]"),
    ).toHaveCount(0);
    await member.page.screenshot({
      path: testInfo.outputPath(`deal-record-member-${testInfo.project.name}.png`),
      fullPage: true,
      animations: "disabled",
    });
    expect(member.errors).toEqual([]);
  } finally {
    await member.close();
  }
  expect(errors).toEqual([]);
});
