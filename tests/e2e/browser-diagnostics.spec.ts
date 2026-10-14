import { randomUUID } from "node:crypto";

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

    const response = await page.goto(`/en/contacts/${randomUUID()}`);
    expect(response?.status()).toBe(404);
    await page.evaluate(async () => {
      await fetch("/api/v1/diagnostics-probe-missing", { method: "POST", body: "{}" });
      const script = document.createElement("script");
      script.src = "/_next/static/chunks/diagnostics-probe-missing.js";
      document.head.append(script);
      const flag = new Image();
      flag.src = "https://flagcdn.com/w40/de.png";
      document.body.append(flag);
    });

    await expect
      .poll(() => diagnostics.unexpected.map(({ source }) => new URL(source).pathname).sort())
      .toEqual(["/_next/static/chunks/diagnostics-probe-missing.js", "/api/v1/diagnostics-probe-missing"]);
    expect(errors).toHaveLength(2);
    expect(diagnostics.unexpected.every(({ text }) => text.startsWith("Failed to load resource"))).toBe(true);
    if (testInfo.project.name === "chromium") expect(notFound.events).toHaveLength(1);
    await expect(diagnostics.verify(testInfo)).rejects.toThrow("/api/v1/diagnostics-probe-missing");
  } finally {
    await probe.close();
  }
});
