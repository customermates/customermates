import { presetId } from "../../features/records/crm-preset";
import { openRecordDetails } from "./record-rows";
import { test, expect, collectPageErrors } from "./fixtures";

test("browser Back guards a record drawer draft and an immediate Open page handoff", async ({ page, companyId }) => {
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "service");
  await page.goto("/en/dashboard");
  await page.goto(`/en/records/${typeId}`);
  await page.locator("#records-add").click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Back guard service");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(drawer).not.toBeVisible();

  await openRecordDetails(page, "Back guard service");
  await drawer.getByRole("textbox", { name: "Name", exact: false }).fill("Back guard draft");
  await page.evaluate(() => history.back());
  const guard = page.getByRole("alertdialog", { name: "Unsaved Changes", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(drawer.getByRole("textbox", { name: "Name", exact: false })).toHaveValue("Back guard draft");

  await drawer.getByRole("link", { name: "Open page", exact: true }).click();
  await page.evaluate(() => history.back());
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect
    .poll(async () =>
      Promise.all(
        (await page.getByRole("textbox", { name: "Name", exact: false }).all()).map((input) => input.inputValue()),
      ),
    )
    .toContain("Back guard draft");
  expect(errors).toEqual([]);
});
