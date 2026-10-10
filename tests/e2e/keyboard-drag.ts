import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

const liveRegionText = (page: Page) =>
  page
    .locator('[id^="DndLiveRegion"]')
    .evaluateAll((regions) => regions.map((region) => region.textContent ?? "").join("\n"));

export async function moveWithKeyboard(
  page: Page,
  handle: Locator,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
) {
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => liveRegionText(page)).not.toBe("");
  await handle.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const pickedUp = await liveRegionText(page);
  await page.keyboard.press(key);
  await expect
    .poll(() => liveRegionText(page), { message: "the keyboard move is announced before the drop" })
    .not.toBe(pickedUp);
  await page.keyboard.press("Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");
}
