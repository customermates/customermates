import type { Locator } from "@playwright/test";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("opens a stable record page, preserves its draft alongside the assistant, and saves notes", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  const typeId = (key: string) => presetId(companyId, key);
  const dialogs = page.getByRole("dialog");
  const waitForDealReads = async (container: Locator) => {
    const overview = container.getByRole("tab", { name: "Overview", exact: true });
    if (await overview.isVisible()) await overview.click();
    for (const [key, direction, label] of [
      ["deal.contacts", "outgoing", "Contacts"],
      ["deal.organizations", "outgoing", "Organizations"],
      ["task.deals", "incoming", "Tasks"],
    ]) {
      const field = container.locator(`[data-entity-field="relationship:${typeId(key)}:${direction}"]`);
      await expect(field).toBeVisible();
      await expect(field.getByRole("combobox", { name: label, exact: true })).toBeEnabled();
      await expect(field.locator('[aria-busy="true"]')).toHaveCount(0);
    }
    const lines = container.getByRole("region", { name: "Line items", exact: true });
    await expect(lines.getByRole("table")).toBeVisible();
    await expect(lines.getByRole("status")).toHaveCount(0);
    const services = container.getByRole("region", { name: "Services", exact: true });
    await expect(services.getByText("—", { exact: true })).toBeVisible();
    await expect(services.getByRole("status")).toHaveCount(0);
    await expect(services.getByRole("alert")).toHaveCount(0);
  };
  await page.goto(`/en/records/${typeId("deal")}`);
  await page.locator("#records-add").click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Local opportunity");
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialogs).not.toBeVisible();
  await page.getByRole("button", { name: "Local opportunity", exact: true }).click();
  await waitForDealReads(dialogs);
  await dialogs.getByRole("link", { name: "Open page", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId("deal")}/[a-f0-9-]+$`));
  await expect(dialogs).not.toBeVisible();
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Name", exact: false }).fill("Opportunity with notes");
  await main.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(
    page.getByTestId("agent-composer-contexts").getByText("Local opportunity", { exact: true }),
  ).toBeVisible();
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Opportunity with notes");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await main.getByRole("tab", { name: "Notes", exact: true }).click();
  await main.getByRole("textbox", { name: "Notes", exact: true }).fill("Saved quote reviewed locally.");
  await main.getByRole("button", { name: "Save", exact: true }).click();
  await expect(main.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Opportunity with notes" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Reset", exact: true })).not.toBeVisible();
  await waitForDealReads(main);
  await page.reload();
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Opportunity with notes");
  await main.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Notes", exact: true })).toContainText(
    "Saved quote reviewed locally.",
  );
  const notes = await database.query(
    'SELECT "jsonValue"::text AS notes FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3',
    [companyId, typeId("deal"), typeId("deal.notes")],
  );
  expect(notes.rows[0].notes).toContain("Saved quote reviewed locally.");
  const messages = await database.query('SELECT COUNT(*)::integer AS count FROM "AgentMessage" WHERE "companyId"=$1', [
    companyId,
  ]);
  expect(messages.rows).toEqual([{ count: 0 }]);
  const recordUrl = page.url();
  const recordId = new URL(recordUrl).pathname.split("/").at(-1);
  const searchButton = page.locator("#nav-search");
  if (!(await searchButton.isVisible())) await page.locator("#sidebar-trigger").click();
  await searchButton.click();
  await page.locator("#global-search-input input").fill("Opportunity with notes");
  await page.locator(`[data-value="${typeId("deal")}:${recordId}"]`).click();
  await waitForDealReads(dialogs);
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Same page drawer draft");
  await dialogs.getByRole("tab", { name: "Notes", exact: true }).click();
  await dialogs.getByRole("textbox", { name: "Notes", exact: true }).fill("Draft transferred onto the mounted page.");
  await dialogs.getByRole("link", { name: "Open page", exact: true }).click();
  await expect(page).toHaveURL(recordUrl);
  await expect(dialogs).not.toBeVisible();
  await main.getByRole("tab", { name: "Overview", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Same page drawer draft");
  await main.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Notes", exact: true })).toContainText(
    "Draft transferred onto the mounted page.",
  );
  await main.getByRole("button", { name: "Save", exact: true }).click();
  await expect(main.getByRole("button", { name: "Reset", exact: true })).not.toBeVisible();
  await page.reload();
  await expect(main.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Same page drawer draft");
  const transferredNotes = await database.query(
    'SELECT "jsonValue"::text AS notes FROM "RecordValue" WHERE "companyId"=$1 AND "typeId"=$2 AND "fieldId"=$3 AND "recordId"=$4',
    [companyId, typeId("deal"), typeId("deal.notes"), recordId],
  );
  expect(transferredNotes.rows[0].notes).toContain("Draft transferred onto the mounted page.");
  await page.screenshot({ path: testInfo.outputPath("record-notes-page.png"), fullPage: true, animations: "disabled" });
  await main.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Deals: 1");
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId("deal")}(?:\\?.*)?$`));
  const remaining = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, typeId("deal")],
  );
  expect(remaining.rows).toEqual([{ count: 0 }]);
  expect(errors).toEqual([]);
});
