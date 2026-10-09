import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect, isBenignPageError } from "./fixtures";
import { openRecordDetails, recordItem } from "./record-rows";
import { presetId } from "../../features/records/crm-preset";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test("edits two formatted text fields inline in the overview, collapses long text and shows table excerpts", async ({
  page,
  companyId,
}, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    if (!isBenignPageError(error.message)) errors.push(error.message);
  });
  const typeId = presetId(companyId, "organization");
  await page.goto(`/en/records/${typeId}`);
  const current = await post(page, "/api/v1/model/discover", {});
  const summaryId = randomUUID();
  const applied = await post(page, "/api/v1/model/apply", {
    expectedRevision: current.revision,
    idempotencyKey: randomUUID(),
    operations: [
      {
        operation: "putField",
        field: {
          id: summaryId,
          typeId,
          label: "Summary",
          valueType: "richText",
          required: false,
          behavior: { kind: "input" },
          options: [],
          position: 99,
        },
      },
    ],
  });
  expect(applied).toMatchObject({ status: "completed" });

  const name = `Formatted ${randomUUID().slice(0, 6)}`;
  await page.reload();
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  await expect(drawer.getByRole("tab", { name: "Notes", exact: true })).toHaveCount(0);
  await expect(drawer.getByText("Add Notes", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Add Summary", { exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Edit Notes", exact: true }).click();
  const notes = drawer.getByRole("textbox", { name: "Notes", exact: true });
  await expect(notes).toBeFocused();
  await page.keyboard.type(
    Array.from({ length: 12 }, (_, index) => `Line ${index + 1} about the renewal call.`).join("\n"),
  );
  await page.keyboard.press("Escape");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-formatted-text-field][data-state="display"]')).toHaveCount(2);
  await expect(drawer.getByRole("button", { name: "Edit Notes", exact: true })).toBeFocused();
  await expect(drawer.getByRole("button", { name: "Show more", exact: true })).toBeVisible();
  await expect(drawer.getByText("Line 12 about the renewal call.", { exact: true })).not.toBeInViewport();
  await drawer.getByRole("button", { name: "Show more", exact: true }).click();
  await drawer.getByText("Line 12 about the renewal call.", { exact: true }).scrollIntoViewIfNeeded();
  await expect(drawer.getByText("Line 12 about the renewal call.", { exact: true })).toBeInViewport();
  await expect(drawer.getByRole("button", { name: "Show less", exact: true })).toBeVisible();

  await drawer.getByRole("button", { name: "Edit Summary", exact: true }).click();
  await drawer.getByRole("textbox", { name: "Summary", exact: true }).fill("Expansion likely in Q3");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).click();
  await expect(drawer.locator('[data-formatted-text-field][data-state="editing"]')).toHaveCount(0);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  const row = recordItem(page, name);
  await expect(row).toContainText("Line 1 about the renewal call. Line 2 about the renewal call.");
  await expect(row).toContainText("Expansion likely in");
  await page.getByPlaceholder("Search...").first().fill("renewal call");
  await expect(recordItem(page, name)).toBeVisible();
  await page.getByPlaceholder("Search...").first().fill("Q3");
  await expect(recordItem(page, name)).toBeVisible();
  await page.getByPlaceholder("Search...").first().fill("");

  await openRecordDetails(page, name);
  await expect(drawer.getByRole("textbox", { name: "Summary", exact: true })).toContainText("Expansion likely in Q3");
  await page.screenshot({ path: testInfo.outputPath("formatted-text-drawer.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});
