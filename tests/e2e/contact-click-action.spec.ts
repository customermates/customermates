import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { addFromConfigure, openConfigure, saveDrawer } from "./configure";
import { test, expect } from "./fixtures";

test("opens or copies contact values and edits them from empty cell space", async ({
  page,
  context,
  companyId,
}, testInfo) => {
  test.setTimeout(300000);
  if (testInfo.project.name === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const typeId = presetId(companyId, "organization");
  const suffix = randomUUID().slice(0, 6);
  const emailLabel = `Billing email ${suffix}`;
  const siteLabel = `Homepage ${suffix}`;

  await openConfigure(page, typeId);
  for (const [label, type, action] of [
    [emailLabel, "Email", "Copy address"],
    [siteLabel, "Web address", null],
  ] as const) {
    await addFromConfigure(page, "Field");
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(label);
    await drawer.getByRole("combobox", { name: "Value type", exact: true }).click();
    await page.getByRole("option", { name: type, exact: true }).click();
    const onClick = drawer.getByRole("combobox", { name: "On click", exact: true });
    await expect(onClick).toContainText(type === "Email" ? "Open in mail app" : "Open link");
    if (action) {
      await onClick.click();
      await page.getByRole("option", { name: action, exact: true }).click();
    }
    await saveDrawer(page);
  }

  const email = `billing-${suffix}@example.test`;
  const site = `https://example.test/${suffix}`;
  await page.goto(`/en/records/${typeId}?viewMode=table`);
  const recordDrawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await page.locator("#records-add").click();
  await recordDrawer.getByRole("textbox", { name: "Name", exact: false }).fill(`Contact ${suffix}`);
  await recordDrawer.getByRole("textbox", { name: emailLabel, exact: true }).fill(email);
  await recordDrawer.getByRole("textbox", { name: siteLabel, exact: true }).fill(site);
  await expect(recordDrawer.getByRole("button", { name: "Copy address", exact: true })).toBeVisible();
  await expect(recordDrawer.getByRole("link", { name: "Open link", exact: true })).toHaveAttribute("href", site);
  await recordDrawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(recordDrawer).not.toBeVisible();

  const row = page.getByRole("row").filter({ hasText: `Contact ${suffix}` });
  const link = row.getByRole("link", { name: site, exact: true });
  await expect(link).toHaveAttribute("href", site);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(row.getByRole("link", { name: email, exact: true })).toHaveCount(0);

  await row.getByRole("button", { name: email, exact: true }).click();
  await expect(page.getByText(`${email} copied to clipboard`, { exact: true })).toBeVisible();
  if (testInfo.project.name === "chromium")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(email);
  await expect(recordDrawer).not.toBeVisible();

  const space = row.locator(`[data-inline-edit-space]`).filter({ hasText: email });
  await space.scrollIntoViewIfNeeded();
  const box = await space.boundingBox();
  if (!box) throw new Error("The email cell is not rendered");
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  const editor = page.locator('[data-slot="popover-content"]').filter({ has: page.getByRole("textbox") });
  await expect(editor.getByRole("textbox", { name: emailLabel, exact: true })).toHaveValue(email);
  await expect(recordDrawer).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
});
