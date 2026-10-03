import { test, expect } from "./fixtures";
import { presetId } from "../../features/records/crm-preset";
import { APP_LOCALES } from "../../i18n/locale-registry";
import { APP_LOCALE_COOKIE_NAME } from "../../i18n/locale-preference";
import { localE2eEnvironment } from "./local-environment";

test("renders the configurable record surface in all application locales and both themes without document overflow", async ({
  context,
  companyId,
  database,
  workspace,
}, testInfo) => {
  test.setTimeout(240000);
  const typeId = presetId(companyId, "contact");
  for (const locale of APP_LOCALES) {
    await database.query('UPDATE "User" SET "displayLanguage"=$3 WHERE "companyId"=$1 AND id=$2', [
      companyId,
      workspace.userId,
      locale,
    ]);
    await context.addCookies([
      { name: APP_LOCALE_COOKIE_NAME, value: locale, url: localE2eEnvironment().baseUrl, sameSite: "Lax" },
    ]);
    for (const theme of ["light", "dark"]) {
      const page = await context.newPage();
      await page.bringToFront();
      await page.addInitScript((preference) => window.localStorage.setItem("theme", preference), theme);
      const errors: string[] = [];
      page.on("pageerror", (error) => {
        if (error.message !== "ResizeObserver loop completed with undelivered notifications.")
          errors.push(error.message);
      });
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`/${locale}/records/${typeId}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveClass(new RegExp(`(?:^|\\s)${theme}(?:\\s|$)`));
      await expect(page.locator("#records-add")).toBeVisible();
      await expect(page.locator("header")).toContainText("Contacts");
      await expect(page.getByRole("main")).not.toContainText(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`records-${locale}-${theme}.png`), animations: "disabled" });
      expect(errors).toEqual([]);
      await page.close();
    }
  }
});
