import { test, expect } from "./fixtures";

test("records list header keeps Configure icon-only and left of the primary Add action", async ({ page }) => {
  await page.goto("/en/contacts");
  const header = page.locator("header.sticky");
  const configure = header.locator("#records-configure");
  const add = header.locator("#records-add");
  await expect(configure).toBeVisible();
  await expect(add).toBeVisible();
  await expect(configure).toHaveAccessibleName("Configure");
  await expect(configure).toHaveText("");
  const [configureBox, addBox] = await Promise.all([configure.boundingBox(), add.boundingBox()]);
  expect(configureBox!.x).toBeLessThan(addBox!.x);
  await configure.hover();
  await expect(page.getByRole("tooltip", { name: "Configure" })).toBeVisible();
});
