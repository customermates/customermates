import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("opens a stable record page, preserves its draft alongside the assistant, and saves notes", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (error.message !== "ResizeObserver loop completed with undelivered notifications.") errors.push(error.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  const typeId = (key: string) => presetId(companyId, key);
  const dialogs = page.getByRole("dialog");
  await page.goto(`/en/records/${typeId("deal")}`);
  await page.locator("#records-add").click();
  await dialogs.getByRole("textbox", { name: "Name", exact: false }).fill("Local opportunity");
  await dialogs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialogs).not.toBeVisible();
  await page.getByRole("button", { name: "Local opportunity", exact: true }).click();
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
