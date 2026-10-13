import { randomUUID } from "node:crypto";
import { presetId } from "../../features/records/crm-preset";
import { addFromConfigure, openConfigure, saveDrawer } from "./configure";
import { test, expect } from "./fixtures";


test("marks invalid values on their field, normalises phone numbers and keeps table switches compact", async ({
  page,
  companyId,
}) => {
  test.setTimeout(300000);
  const typeId = presetId(companyId, "organization");
  const suffix = randomUUID().slice(0, 6);
  const phoneLabel = `Phone ${suffix}`;
  const siteLabel = `Site ${suffix}`;
  const activeLabel = `Active ${suffix}`;
  const name = `Feedback ${suffix}`;

  await openConfigure(page, typeId);
  for (const [label, type] of [
    [phoneLabel, "Phone"],
    [siteLabel, "Web address"],
    [activeLabel, "Yes or no"],
  ] as const) {
    await addFromConfigure(page, "Field");
    const drawer = page.getByRole("dialog");
    await drawer.getByRole("textbox", { name: "Name", exact: false }).fill(label);
    await drawer.getByRole("combobox", { name: "Value type", exact: true }).click();
    await page.getByRole("option", { name: type, exact: true }).click();
    await saveDrawer(page);
  }

  await page.goto(`/en/records/${typeId}?viewMode=table`);
  const recordDrawer = page.getByRole("dialog", { name: "Organization", exact: true });
  await page.locator("#records-add").click();
  await recordDrawer.getByRole("textbox", { name: "Name", exact: false }).fill(name);
  const site = recordDrawer.getByRole("textbox", { name: siteLabel, exact: true });
  const phone = recordDrawer.getByRole("textbox", { name: phoneLabel, exact: true });
  await site.fill("not a url");
  await phone.fill("+49 30 1234567");
  await recordDrawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(site).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a valid URL.", { exact: true })).toBeVisible();
  await expect(phone).not.toHaveAttribute("aria-invalid", "true");

  await site.fill(`https://example.test/${suffix}`);
  await recordDrawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect(recordDrawer).not.toBeVisible();

  test.skip(Boolean(test.info().project.use.isMobile), "Phone rows have no table cells to measure");
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("+49301234567");
  const toggle = row.getByRole("switch", { name: `Edit ${activeLabel}`, exact: true });
  await toggle.scrollIntoViewIfNeeded();
  const before = await toggle.boundingBox();
  if (!before) throw new Error("The yes or no switch is not rendered");
  expect(before.width).toBeLessThanOrEqual(32);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  const thumb = toggle.locator('[data-slot="switch-thumb"]');
  await expect
    .poll(async () => {
      const [track, knob] = await Promise.all([toggle.boundingBox(), thumb.boundingBox()]);
      return track && knob ? Math.round(track.x + track.width - (knob.x + knob.width)) : null;
    })
    .toBeLessThanOrEqual(2);
});
