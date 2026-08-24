// Minimal Chrome DevTools Protocol client. No dependencies: Node 24 ships a global
// WebSocket, so this needs neither puppeteer nor chrome-remote-interface.
//
// It exists because the visual standards on /styleguide can only be verified in a real
// engine: reduced motion is a media query, IntersectionObserver needs a visible page, and
// deterministic video capture needs frame-exact control of the clock. The in-app browser
// pane runs with document.hidden true, so observers never fire there.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function waitForJson(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      // Chrome is not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`devtools endpoint never came up: ${url}`);
}

export async function launchChrome({ port = 9333, width = 1440, height = 900, scale = 1 } = {}) {
  const profile = await mkdtemp(join(tmpdir(), "cdp-profile-"));
  const child = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${scale}`,
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
    else entry.resolve(message.result);
  });

  function send(method, params = {}, sessionId) {
    const id = (nextId += 1);
    return new Promise((resolve, reject) => {
      pending.set(id, { method, resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params) => send(method, params, sessionId);

  await call("Page.enable");
  await call("Runtime.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });

  return {
    call,
    async goto(url) {
      await call("Page.navigate", { url });
      // Page.loadEventFired is unreliable for streamed RSC, so poll readiness instead.
      for (let i = 0; i < 240; i += 1) {
        const ready = await this.eval("document.readyState === 'complete'");
        if (ready) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error(`page never reached readyState complete: ${url}`);
    },
    async eval(expression) {
      const result = await call("Runtime.evaluate", {
        expression: `(() => (${expression}))()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? "evaluate failed");
      }
      return result.result.value;
    },
    async setReducedMotion(reduce) {
      await call("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: reduce ? "reduce" : "no-preference" }],
      });
    },
    async resize(nextWidth, nextHeight) {
      await call("Emulation.setDeviceMetricsOverride", {
        width: nextWidth,
        height: nextHeight,
        deviceScaleFactor: scale,
        mobile: false,
      });
    },
    async screenshot(clip) {
      const { data } = await call("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: Boolean(clip),
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      });
      return Buffer.from(data, "base64");
    },
    async close() {
      try {
        ws.close();
      } catch {
        // already gone
      }
      child.kill("SIGTERM");
      await rm(profile, { recursive: true, force: true });
    },
  };
}
