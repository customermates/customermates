import { randomUUID } from "node:crypto";
import { addFromConfigure, openConfigure } from "./configure";
import { test, expect, isAppConsoleError, isBenignPageError } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";

test("searches custom records across pages, opens generic drawers, and attaches AI context", async ({
  page,
  database,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  page.on("console", (message) => {
    if (isAppConsoleError(message)) errors.push(message.text());
  });
  await openConfigure(page);
  await addFromConfigure(page, "List");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Name", exact: false }).first().fill("Projects");
  await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page).toHaveURL(/\/en\/records\/[a-f0-9-]+$/);
  await expect(dialog).not.toBeVisible();
  const typeId = new URL(page.url()).pathname.split("/").at(-1);
  await page.locator("#records-add").click();
  await dialog.getByRole("textbox", { name: "Projects", exact: false }).fill("Searchable project");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Searchable project", exact: true })).toBeVisible();
  for (let index = 0; index < 41; index += 1) {
    const response = await page.request.post("/api/v1/records/mutate", {
      data: {
        expectedRevision: 2,
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId: presetId(companyId, "service"),
          fields: [
            {
              fieldId: presetId(companyId, "service.name"),
              value: { kind: "text", value: `Searchable service ${String(index).padStart(2, "0")}` },
            },
          ],
        },
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toMatchObject({ status: "completed" });
  }
  const openSearch = async () => {
    if (!(await page.locator("#nav-search").isVisible())) await page.locator("#sidebar-trigger").click();
    await page.locator("#nav-search").click();
    await expect(page.locator("#global-search-input input")).toBeVisible();
  };
  await openSearch();
  await page.locator("#global-search-input input").fill("Searchable");
  await expect(dialog.getByRole("option").filter({ hasText: "Searchable service" })).toHaveCount(40);
  await expect(dialog.getByRole("option").filter({ hasText: "Searchable project" })).toHaveCount(0);
  await dialog.getByRole("option", { name: "Load more", exact: true }).click();
  await expect(dialog.getByRole("option").filter({ hasText: "Searchable service" })).toHaveCount(41);
  await dialog.getByRole("option").filter({ hasText: "Searchable project" }).click();
  await expect(dialog.getByRole("textbox", { name: "Projects", exact: false })).toHaveValue("Searchable project");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await openSearch();
  await expect(page.locator("#global-search-input input")).toHaveValue("");
  await dialog.getByRole("option").filter({ hasText: "Searchable project" }).click();
  await dialog.getByRole("link", { name: "Open page", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/records/${typeId}/[a-f0-9-]+$`));
  await expect(dialog).not.toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(
    page.getByTestId("agent-composer-contexts").getByText("Searchable project", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add context", exact: true }).click();
  await page.getByPlaceholder("Search records…", { exact: true }).fill("Searchable service 40");
  await page.getByRole("option").filter({ hasText: "Searchable service 40" }).click();
  await expect(
    page.getByTestId("agent-composer-contexts").getByText("Searchable service 40", { exact: true }),
  ).toBeVisible();
  const persisted = await database.query(
    'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId"=$1 AND "typeId"=$2',
    [companyId, presetId(companyId, "service")],
  );
  expect(persisted.rows).toEqual([{ count: 41 }]);
  const messages = await database.query('SELECT COUNT(*)::integer AS count FROM "AgentMessage" WHERE "companyId"=$1', [
    companyId,
  ]);
  expect(messages.rows).toEqual([{ count: 0 }]);
  await page.screenshot({
    path: testInfo.outputPath("generic-search-ai-context.png"),
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});
