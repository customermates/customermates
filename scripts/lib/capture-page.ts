import { createHash } from "node:crypto";

import type { Browser, BrowserContext, Page } from "@playwright/test";

import { captureNavigationUrl } from "./capture-solutions-options";

import { formattingTagFor, isLocaleCode } from "@/i18n/locale-registry";

const READY_TIMEOUT_MS = 60_000;
const STABLE_SAMPLES = 3;
const STABLE_SAMPLE_INTERVAL_MS = 400;
const NAVIGATION_TIMEOUT_MS = 90_000;
const CAPTURE_ATTEMPTS = 3;
const HIDE_DEV_OVERLAY_CSS = "nextjs-portal { display: none !important; }";

export type CaptureViewport = { deviceScaleFactor: number; height: number; width: number };

export type CaptureLook = { locale: string; theme: "dark" | "light" };

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(new Uint8Array(buffer)).digest("hex");
}

async function waitForStableGeometry(page: Page): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let previous = "";
  let stableSamples = 0;
  while (stableSamples < STABLE_SAMPLES) {
    if (Date.now() > deadline) throw new Error(`${page.url()}: charts kept moving for ${READY_TIMEOUT_MS} ms`);
    await page.waitForTimeout(STABLE_SAMPLE_INTERVAL_MS);
    const current = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main svg path, main svg rect, main svg circle"))
        .map(
          (node) =>
            `${node.getAttribute("d") ?? ""}|${node.getAttribute("height") ?? ""}|${node.getAttribute("r") ?? ""}`,
        )
        .join(";"),
    );
    stableSamples = current === previous ? stableSamples + 1 : 0;
    previous = current;
  }
  await page.mouse.move(0, 0);
}

export async function newCaptureContext(
  browser: Browser,
  look: CaptureLook,
  viewport: CaptureViewport,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    colorScheme: look.theme,
    deviceScaleFactor: viewport.deviceScaleFactor,
    locale: isLocaleCode(look.locale) ? formattingTagFor(look.locale) : undefined,
    timezoneId: "Europe/Berlin",
    viewport: { height: viewport.height, width: viewport.width },
  });
  await context.addInitScript((theme) => window.localStorage.setItem("theme", theme), look.theme);
  return context;
}

export async function openReadyPage(
  context: BrowserContext,
  baseUrl: string,
  key: string,
  route: string,
  area?: { height: number; width: number },
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(captureNavigationUrl(baseUrl, route), { timeout: NAVIGATION_TIMEOUT_MS, waitUntil: "networkidle" });
  const expected = new URL(route, `${baseUrl}/`).pathname;
  const landed = new URL(page.url()).pathname;
  if (landed !== expected) throw new Error(`${key}: landed on ${landed}, expected ${expected}`);

  await page.addStyleTag({ content: HIDE_DEV_OVERLAY_CSS });
  await page.waitForFunction(
    (visible) =>
      document.fonts.status === "loaded" &&
      document.querySelector("main") !== null &&
      Array.from(document.querySelectorAll('[aria-busy="true"], .animate-pulse')).every((node) => {
        if (!visible) return false;
        const box = node.getBoundingClientRect();
        return box.left >= visible.width || box.top >= visible.height || box.width === 0 || box.height === 0;
      }),
    area ?? null,
    { timeout: READY_TIMEOUT_MS },
  );
  await waitForStableGeometry(page);
  return page;
}

export async function withRetries<T>(key: string, run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= CAPTURE_ATTEMPTS) throw error;
      console.warn(
        `${key}: attempt ${attempt} failed (${error instanceof Error ? error.message.split("\n")[0] : error})`,
      );
    }
  }
}
