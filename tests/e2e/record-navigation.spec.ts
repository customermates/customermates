import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { expect, test, isAppConsoleError, isBenignPageError } from "./fixtures";

test("opens original CRM URLs in the shared record screens", async ({ page, database, companyId }) => {
  for (const [path, kind] of [
    ["contacts", "contact"],
    ["organizations", "organization"],
    ["deals", "deal"],
    ["services", "service"],
    ["tasks", "task"],
  ] as const) {
    await page.goto(`/en/${path}`);
    await expect(page).toHaveURL(`/en/records/${presetId(companyId, kind)}`);
    await expect(page.locator("#records-add")).toBeVisible();
  }
  const serviceId = presetId(companyId, "service");
  await page.goto(`/en/records/${serviceId}`);
  await page.locator("#records-add").click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Legacy link target");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  const stored = await database.query(
    'SELECT id FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2 ORDER BY "createdAt" DESC LIMIT 1',
    [companyId, serviceId],
  );
  const recordId = stored.rows[0]?.id;
  expect(recordId).toBeTruthy();
  await page.goto(`/en/services/${recordId}`);
  await expect(page).toHaveURL(`/en/records/${serviceId}/${recordId}`);
  await expect(page.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Legacy link target");
  await page.close();
});

test("opens a legacy create deep link through the shared record editor", async ({ page, database, companyId }) => {
  const name = `Deep link catalog item ${randomUUID().slice(0, 8)}`;
  await page.goto("/en/dashboard?open=service:new");
  const editor = page.getByRole("dialog");
  await expect(editor.getByRole("textbox", { name: "Name", exact: false })).toBeVisible();
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page).not.toHaveURL(/open=service%3Anew/);
  const generic = await database.query(
    'SELECT r.id FROM "CrmRecord" r JOIN "RecordValue" v ON v."companyId"=r."companyId" AND v."typeId"=r."typeId" AND v."recordId"=r.id WHERE r."companyId"=$1 AND r."typeId"=$2 AND v."textValue"=$3',
    [companyId, presetId(companyId, "service"), name],
  );
  expect(generic.rows).toHaveLength(1);
  expect((await database.query("SELECT to_regclass('\"Service\"') AS table")).rows[0].table).toBeNull();
});

test("uses configured navigation, quick creation, rename-safe routes, and hidden types", async ({
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
  const serviceId = presetId(companyId, "service");
  await page.goto(`/en/records/${serviceId}`);
  const openSidebar = async () => {
    if (!(await page.locator("#nav-add").isVisible())) await page.locator("#sidebar-trigger").click();
    await expect(page.locator("#nav-add")).toBeVisible();
  };
  await openSidebar();
  for (const [key, label] of [
    ["contact", "Contacts"],
    ["organization", "Organizations"],
    ["deal", "Deals"],
    ["service", "Services"],
    ["task", "Tasks"],
  ]) {
    const link = page.locator(`[id="nav-records:${presetId(companyId, key)}"]`);
    await expect(link).toHaveText(label);
    await expect(link).toHaveAttribute("href", `/en/records/${presetId(companyId, key)}`);
  }
  await page.locator("#nav-add").click();
  await page.getByRole("dialog").getByRole("button", { name: "Add Service", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByRole("textbox", { name: "Name", exact: false }).fill("Quick catalog entry");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Quick catalog entry", exact: true })).toBeVisible();
  const saved = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, serviceId],
  );
  expect(saved.rows).toEqual([{ count: 1 }]);
  await openSidebar();
  await page.locator("#nav-add").click();
  await page.getByRole("dialog").getByRole("button", { name: "Create list", exact: true }).click();
  await editor.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
  await editor.getByRole("button", { name: "Create list", exact: true }).click();
  await expect(page).toHaveURL(/\/records\/[a-f0-9-]+$/);
  await expect(editor).not.toBeVisible();
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  const navLink = page.locator(`[id="nav-records:${typeId}"]`);
  await openSidebar();
  await expect(navLink).toHaveText("Projects");
  await navLink.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
  await expect(page.locator("#records-add")).toBeVisible();
  await page.getByRole("link", { name: "Configure", exact: true }).and(page.locator("#records-configure")).click();
  await page.getByRole("button", { name: "Type settings", exact: true }).click();
  await editor.getByRole("textbox", { name: "Name", exact: false }).first().fill("Engagement");
  await editor.getByRole("textbox", { name: "Navigation label", exact: false }).fill("Engagements");
  await editor.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Ready to apply");
  await editor.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await openSidebar();
  await expect(navLink).toHaveText("Engagements");
  await expect(navLink).toHaveAttribute("href", `/en/records/${typeId}`);
  await navLink.click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
  await expect(page.locator("#records-add")).toBeVisible();
  await page.getByRole("link", { name: "Configure", exact: true }).and(page.locator("#records-configure")).click();
  await page.getByRole("button", { name: "Type settings", exact: true }).click();
  await editor.getByRole("switch", { name: "Show in navigation", exact: true }).uncheck();
  await editor.getByRole("button", { name: "Preview changes", exact: true }).click();
  await editor.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(editor).not.toBeVisible();
  await openSidebar();
  await expect(navLink).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  await page.goto(`/en/records/${typeId}`);
  await expect(page.locator("#records-add")).toBeVisible();
  await openSidebar();
  await expect(page.locator("#nav-assistant")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.reload();
  await openSidebar();
  await expect(navLink).toHaveCount(0);
  const type = await database.query('SELECT definition FROM "RecordTypeDefinition" WHERE "companyId"=$1 AND id=$2', [
    companyId,
    typeId,
  ]);
  expect(type.rows[0].definition).toMatchObject({
    pluralLabel: "Engagements",
    navigationVisible: false,
    archived: false,
  });
  await page.screenshot({
    path: testInfo.outputPath("configured-navigation.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
