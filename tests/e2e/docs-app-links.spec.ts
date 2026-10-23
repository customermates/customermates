import { workspaceEntryHref } from "../../core/navigation/workspace-paths";
import { CONTENT_LOCALES } from "../../i18n/locale-registry";
import { expect, test } from "./fixtures";
import { appPath } from "./app-paths";

const ADD_ROLE = "/settings/roles?focus=control%3Asettings-roles-add";

test("opens a docs page link and highlights its control", async ({ page, slug }) => {
  await page.goto(appPath(slug, ADD_ROLE));
  await expect(page.locator("#settings-roles-add")).toHaveAttribute("data-focus-highlight", "");
  await expect(page).toHaveURL(appPath(slug, "/settings/roles"));
});

test("rendered Add links on Roles in both languages open the page and highlight Add", async ({ page, slug }) => {
  for (const locale of CONTENT_LOCALES) {
    await page.goto(`/${locale}/docs/app-company`);
    const link = page.locator(`a[href$="${workspaceEntryHref(ADD_ROLE)}"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/[a-z]{2}/w/${slug}/settings/roles(?:\\?|$)`));
    await expect(page.locator("#settings-roles-add")).toHaveAttribute("data-focus-highlight", "");
  }
});
