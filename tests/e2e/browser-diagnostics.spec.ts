import { randomUUID } from "node:crypto";

import { appPath } from "./app-paths";
import { BrowserDiagnostics, expectNotFoundDocuments } from "./browser-diagnostics";
import { collectPageErrors, expect, test } from "./fixtures";
import { localE2eEnvironment } from "./local-environment";

test("an expected 404 document and sandboxed requests leave unrelated API and chunk failures visible", async ({
  browser,
  context,
}, testInfo) => {
  const probe = await browser.newContext({
    baseURL: localE2eEnvironment().baseUrl,
    storageState: await context.storageState(),
    viewport: testInfo.project.use.viewport,
    isMobile: testInfo.project.use.isMobile,
    hasTouch: testInfo.project.use.hasTouch,
    userAgent: testInfo.project.use.userAgent,
    locale: "en-GB",
  });
  await probe.route(
    (url) => url.hostname === "flagcdn.com",
    (route) => route.abort("blockedbyclient"),
  );
  const diagnostics = new BrowserDiagnostics().watch(probe);
  try {
    const page = await probe.newPage();
    const errors = collectPageErrors(page);
    const notFound = expectNotFoundDocuments(page);

    const response = await page.goto(`/en/diagnostics-probe-missing/${randomUUID()}`);
    expect(response?.status()).toBe(404);
    await page.evaluate(async () => {
      const api = await fetch("/api/v1/diagnostics-probe-missing", { method: "POST", body: "{}" });
      if (api.status !== 404) throw new Error(`The missing API answered ${api.status}`);
      // WebKit fires no error event for a load the sandbox route aborts, so a load settles on error, load or 10 s.
      const settled = (element: HTMLScriptElement | HTMLImageElement) =>
        new Promise((resolve) => {
          element.addEventListener("error", resolve, { once: true });
          element.addEventListener("load", resolve, { once: true });
          setTimeout(resolve, 10000);
        });
      const script = document.createElement("script");
      script.src = "/_next/static/chunks/diagnostics-probe-missing.js";
      const scriptFailed = settled(script);
      document.head.append(script);
      const flag = new Image();
      const flagFailed = settled(flag);
      flag.src = "https://flagcdn.com/w40/de.png";
      document.body.append(flag);
      await Promise.all([scriptFailed, flagFailed]);
    });

    await expect
      .poll(() => diagnostics.unexpected.map(({ source }) => new URL(source).pathname).sort())
      .toEqual(["/_next/static/chunks/diagnostics-probe-missing.js", "/api/v1/diagnostics-probe-missing"]);
    expect(errors).toHaveLength(2);
    expect(diagnostics.unexpected.every(({ text }) => text.startsWith("Failed to load resource"))).toBe(true);
    expect(notFound.events.map(({ source }) => new URL(source).pathname)).toEqual([
      expect.stringMatching(/^\/en\/diagnostics-probe-missing\//),
    ]);
    await expect(diagnostics.verify(testInfo)).rejects.toThrow("/api/v1/diagnostics-probe-missing");
  } finally {
    await probe.close();
  }
});

// Chromium and WebKit log most failed loads to the console, Firefox none. The diagnostics read the responses instead,
// so a server error behind a page fails the test on every target the same way.
test("an injected server error fails the test on every browser", async ({ page, diagnostics, slug }, testInfo) => {
  await page.route("**/api/v1/diagnostics-probe-error", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"injected"}' }),
  );
  await page.route("**/en/diagnostics-probe-error-page", (route) =>
    route.fulfill({ status: 500, contentType: "text/html", body: "<!doctype html><title>Injected</title>" }),
  );
  // The page is signed in, so a public page such as the sign-in would redirect away; the dashboard stays put.
  await page.goto(appPath(slug, "/dashboard"));
  await expect(page.locator("#sidebar-trigger")).toHaveAttribute("aria-disabled", "false");
  await page.waitForLoadState("networkidle");
  const status = await page.evaluate(async () => {
    const answer = await fetch("/api/v1/diagnostics-probe-error", { method: "POST", body: "{}" });
    return answer.status;
  });
  expect(status).toBe(500);
  expect((await page.goto("/en/diagnostics-probe-error-page"))?.status()).toBe(500);
  await expect
    .poll(() => diagnostics.unexpected.map(({ source }) => new URL(source).pathname).sort())
    .toEqual(["/api/v1/diagnostics-probe-error", "/en/diagnostics-probe-error-page"]);
  for (const diagnostic of diagnostics.unexpected)
    expect(diagnostic.text).toMatch(/^Failed to load resource: the server responded with a status of 500/);
  await expect(diagnostics.verify(testInfo)).rejects.toThrow("/api/v1/diagnostics-probe-error");
  // The test passes once the diagnostics have proven they would fail it.
  diagnostics.unexpected.splice(0);
});
