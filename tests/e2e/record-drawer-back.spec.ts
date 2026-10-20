import { presetId } from "../../features/records/crm-preset";
import { openRecordDetails } from "./record-rows";
import { openSidebar } from "./sidebar";
import { test, expect, collectPageErrors } from "./fixtures";

for (const { title, discard } of [
  { title: "browser Back guards a record drawer draft and an immediate Open page handoff", discard: false },
  { title: "browser Back discards a transferred draft while its record page is still loading", discard: true },
]) test(title, async ({ page, companyId, isMobile }, testInfo) => {
  const errors = collectPageErrors(page);
  const typeId = presetId(companyId, "service");
  await page.goto("/en/dashboard");
  await openSidebar(page);
  await page.locator(`[id="nav-records:${typeId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/en/records/${typeId}$`));
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

  const openPage = drawer.getByRole("link", { name: "Open page", exact: true });
  const detailPath = new URL((await openPage.getAttribute("href"))!, page.url()).pathname;
  const gate = Promise.withResolvers<void>();
  let heldScripts = 0;
  let holdScripts = true;
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (holdScripts && route.request().resourceType() === "script") {
      heldScripts += 1;
      await gate.promise;
    }
    await route.continue();
  });
  try {
    await openPage.click();
    await expect(page).toHaveURL((url) => url.pathname === detailPath);
    await expect.poll(() => heldScripts).toBeGreaterThan(0);
    await expect(page.locator('[data-page-state="loading"]')).toBeVisible();
    await expect(drawer).not.toBeVisible();
    await page.evaluate(() => history.back());
    await expect(guard).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("guarded-loading-handoff.png"), animations: "disabled" });
    await guard.getByRole("button", { name: discard ? "Discard" : "Cancel", exact: true }).click();
    await expect(guard).not.toBeVisible();
    if (discard) await expect(page).toHaveURL((url) => url.pathname === `/en/records/${typeId}`);
    else await expect(page).toHaveURL((url) => url.pathname === detailPath);
    if (!discard) {
      await openSidebar(page, ["sidebar-trigger"]);
      await page.locator("#nav-dashboard").click();
      await expect(guard).toBeVisible();
      await guard.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(guard).not.toBeVisible();
      await expect(page).toHaveURL((url) => url.pathname === detailPath);
      if (isMobile) await page.keyboard.press("Escape");
    }
    holdScripts = false;
    gate.resolve();
    await page.unrouteAll({ behavior: "wait" });
    if (discard) await page.goForward();
    const name = page.getByRole("textbox", { name: "Name", exact: false });
    await expect(name).toHaveValue(discard ? "Back guard service" : "Back guard draft");
    const bar = page.locator('[data-slot="unsaved-changes-bar"]');
    if (discard) await expect(bar).toHaveCount(0);
    else await expect(bar).toBeVisible();
  } finally {
    holdScripts = false;
    gate.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
  expect(errors).toEqual([]);
});
