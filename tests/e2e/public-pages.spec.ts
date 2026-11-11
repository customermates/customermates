import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import { anonymous } from "./view-sharing-helpers";

const THEMES = ["light", "dark"] as const;

async function openHomepage(page: Page, theme: (typeof THEMES)[number], reducedMotion: "reduce" | "no-preference") {
  await page.emulateMedia({ colorScheme: theme, reducedMotion });
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("theme", value);
    } catch {
      return;
    }
  }, theme);
  await page.goto("/en");
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/);
  const film = page.locator("[data-product-film]");
  await film.scrollIntoViewIfNeeded();
  return {
    film,
    video: film.locator("video"),
    play: film.locator("[data-film-play]"),
    poster: (name: (typeof THEMES)[number]) => film.locator(`[data-product-film-poster="${name}"]`),
  };
}

async function expectPosterOnly(film: Awaited<ReturnType<typeof openHomepage>>, theme: (typeof THEMES)[number]) {
  const other = theme === "dark" ? "light" : "dark";
  await expect(film.poster(theme)).toBeVisible();
  await expect(film.poster(other)).toBeHidden();
  await expect
    .poll(() => film.poster(theme).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true);
}

test.describe("homepage film", () => {
  for (const theme of THEMES) {
    test(`shows the ${theme} poster with a play button until playback starts, then the film with native controls`, async ({
      browser,
    }, testInfo) => {
      const visitor = await anonymous(browser, testInfo);
      try {
        const { page } = visitor;
        const film = await openHomepage(page, theme, "reduce");

        await expect(film.play).toBeVisible();
        await expect(film.play).toHaveAttribute("aria-label", "Play the film");
        await expect(film.video).not.toHaveAttribute("data-film-ready", "");
        await expect(film.video).toHaveCSS("opacity", "0");
        await expect(film.video).toHaveAttribute("aria-hidden", "true");
        await expect(film.video).toHaveJSProperty("controls", false);
        await expectPosterOnly(film, theme);
        await page.waitForTimeout(1500);
        expect(await film.video.evaluate((video: HTMLVideoElement) => [video.paused, video.currentTime])).toEqual([
          true,
          0,
        ]);
        await expect(film.play).toBeVisible();

        await film.play.click();

        await expect(film.video).toHaveAttribute("data-film-ready", "");
        await expect(film.video).toHaveCSS("opacity", "1");
        await expect(film.video).toHaveAttribute("aria-hidden", "false");
        await expect(film.video).toHaveJSProperty("controls", true);
        await expect(film.play).toHaveCount(0);
        await expect.poll(() => film.video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
        expect(await film.video.evaluate((video: HTMLVideoElement) => [video.paused, video.muted])).toEqual([
          false,
          false,
        ]);
        await page.screenshot({ path: testInfo.outputPath(`film-${theme}-playing.png`), animations: "disabled" });
        expect(visitor.errors).toEqual([]);
      } finally {
        await visitor.close();
      }
    });
  }

  test("starts muted by itself once the film is mostly in view when the visitor accepts motion", async ({
    browser,
  }, testInfo) => {
    const visitor = await anonymous(browser, testInfo);
    try {
      const { page } = visitor;
      const film = await openHomepage(page, "light", "no-preference");

      await expect(film.video).toHaveAttribute("data-film-ready", "", { timeout: 30_000 });
      await expect(film.play).toHaveCount(0);
      await expect(film.video).toHaveCSS("opacity", "1");
      await expect(film.video).toHaveJSProperty("controls", true);
      await expect.poll(() => film.video.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
      expect(await film.video.evaluate((video: HTMLVideoElement) => [video.paused, video.muted])).toEqual([
        false,
        true,
      ]);
      expect(visitor.errors).toEqual([]);
    } finally {
      await visitor.close();
    }
  });

  test("does not start before the film is in view, and the poster and play button wait for it", async ({
    browser,
  }, testInfo) => {
    const visitor = await anonymous(browser, testInfo);
    try {
      const { page } = visitor;
      await page.emulateMedia({ colorScheme: "light", reducedMotion: "no-preference" });
      await page.goto("/en");
      const video = page.locator("[data-product-film] video");
      await page.waitForLoadState("load");
      expect(
        await video.evaluate((element: HTMLVideoElement) => {
          const box = element.getBoundingClientRect();
          return Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)) / box.height;
        }),
      ).toBeLessThan(0.35);
      await page.waitForTimeout(2500);
      expect(await video.evaluate((element: HTMLVideoElement) => [element.paused, element.currentTime])).toEqual([
        true,
        0,
      ]);
      await expect(video).not.toHaveAttribute("data-film-ready", "");
      await expect(page.locator("[data-product-film] [data-film-play]")).toHaveCount(1);
      expect(visitor.errors).toEqual([]);
    } finally {
      await visitor.close();
    }
  });
});

test.describe("public navbar", () => {
  test("shows its desktop actions only on pages that offer them", async ({ browser }, testInfo) => {
    const visitor = await anonymous(browser, testInfo);
    try {
      const { page } = visitor;
      await page.setViewportSize({ width: 1440, height: 900 });
      const header = page.locator("[data-public-scrollport] > header");
      const actions = header.locator("[data-public-nav-actions]");
      const login = actions.getByRole("link", { name: "Login", exact: true });
      const trial = header.locator("[data-public-nav-trial]");

      await page.goto("/en/auth/signin");
      await expect(header.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
      await expect(actions).toHaveCount(0);
      await expect(header.getByRole("link", { name: "Login", exact: true })).toHaveCount(0);
      await expect(trial).toHaveCount(0);

      await page.goto("/en");
      await expect(actions).toBeVisible();
      await expect(login).toBeVisible();
      await expect(trial).toBeVisible();
      await expect(trial).toHaveText("Start free trial");

      await page.goto("/en/auth/signup");
      await expect(actions).toBeVisible();
      await expect(login).toBeVisible();
      await expect(trial).toHaveCount(0);

      await page.goto("/en/auth/signin");
      await expect(actions).toHaveCount(0);
      expect(visitor.errors).toEqual([]);
    } finally {
      await visitor.close();
    }
  });
});
