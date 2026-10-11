import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * Item menus follow one pattern (components/ui/item-actions.tsx): on a fine pointer the "···" trigger appears on
 * hover and right-click opens the same items at the pointer; on touch there is no visible trigger and a long press
 * opens the menu. Playwright cannot long-press on WebKit touch emulation (neither `click({ delay })` nor `tap()`
 * holds a touch), so on touch projects the helpers dispatch the `contextmenu` event the long press would end in.
 * The shared component handles that event exactly like a right-click, so both paths open the identical menu.
 */
export const FINE_HOVER = "(hover: hover) and (pointer: fine)";

export function usesTouch() {
  const use = test.info().project.use;
  return Boolean(use.hasTouch || use.isMobile);
}

export function itemArea(trigger: Locator) {
  return trigger.locator("xpath=ancestor-or-self::*[@data-item-actions][1]");
}

export async function openItemMenu(page: Page, trigger: Locator) {
  const area = itemArea(trigger);
  const menu = page.getByRole("menu");
  await expect(menu).toHaveCount(0);
  await expect(async () => {
    if (!(await menu.isVisible())) {
      if (usesTouch()) await area.dispatchEvent("contextmenu");
      else {
        await area.hover({ position: { x: 4, y: 4 } });
        await trigger.click();
      }
    }
    await expect(menu).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  return menu;
}

export async function openItemContextMenu(page: Page, area: Locator) {
  await expect(page.getByRole("menu")).toHaveCount(0);
  if (usesTouch()) await area.dispatchEvent("contextmenu");
  else await area.click({ button: "right", position: { x: 8, y: 8 } });
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  return menu;
}

export async function runItemAction(page: Page, trigger: Locator, label: string) {
  const menu = await openItemMenu(page, trigger);
  await menu.getByRole("menuitem", { name: label, exact: true }).click();
}

export async function itemMenuLabels(page: Page, menu: Locator) {
  const labels = await menu.getByRole("menuitem").allInnerTexts();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  return labels.map((label) => label.trim());
}

export async function expectTriggerVisuallyHidden(trigger: Locator) {
  await expect(trigger).toBeAttached();
  await expect
    .poll(() =>
      trigger.evaluate((element) => {
        const style = getComputedStyle(element);
        return `${element.offsetWidth}x${element.offsetHeight} ${style.position} ${style.clipPath} ${style.opacity}`;
      }),
    )
    .toMatch(/^1x1 absolute inset\(50%\)/);
}
