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

const CALL_TIMEOUT_MS = 30_000;

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

  let ws = null;
  let nextId = 0;
  let sessionId = null;
  const pending = new Map();
  const listeners = new Map();

  function onEvent(method, handler) {
    const existing = listeners.get(method) ?? [];
    listeners.set(method, [...existing, handler]);
  }

  function send(method, params = {}, session) {
    const id = (nextId += 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`devtools call timed out after ${CALL_TIMEOUT_MS}ms (${method})`));
      }, CALL_TIMEOUT_MS);
      pending.set(id, { method, reject, resolve, timer });
      ws.send(JSON.stringify({ id, method, params, sessionId: session }));
    });
  }

  const call = (method, params) => send(method, params, sessionId);

  // Every in-flight call has to be settled by something. Without this a lost reply -- a
  // renderer crash part way through a few hundred screenshots, or an unresponsive browser --
  // leaves its promise pending forever, and the script hangs silently with no error and no
  // cleanup instead of failing.
  function rejectAll(reason) {
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(new Error(`${reason} (${entry.method})`));
    }
  }

  async function teardown() {
    rejectAll("devtools connection closed");
    try {
      ws?.close();
    } catch {
      // already gone
    }

    // Wait for Chrome to actually exit before deleting its profile. Removing it while the
    // browser is still flushing raises ENOTEMPTY, and a cleanup step must never be the thing
    // that fails the caller, so the removal is best-effort too.
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => {
        const done = setTimeout(resolve, 5000);
        child.once("exit", () => {
          clearTimeout(done);
          resolve();
        });
        child.kill("SIGTERM");
      });
    }

    try {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // a leftover temp profile is not worth failing a capture over
    }
  }

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("devtools websocket failed to open")), { once: true });
    });

    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.method) {
        for (const handler of listeners.get(message.method) ?? []) handler(message.params);
        return;
      }
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`));
      else entry.resolve(message.result);
    });

    ws.addEventListener("close", () => rejectAll("devtools connection closed"));
    ws.addEventListener("error", () => rejectAll("devtools connection errored"));
    child.on("exit", (code) => rejectAll(`chrome exited (${code})`));

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const attached = await send("Target.attachToTarget", { targetId, flatten: true });
    sessionId = attached.sessionId;

    await call("Page.enable");
    await call("Runtime.enable");
    await call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: false,
    });
  } catch (error) {
    // Nothing has been handed to the caller yet, so nothing else can clean this up.
    await teardown();
    throw error;
  }

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
    // Runs before any page script on every navigation. Used to pin the clock: the app renders
    // relative times client-side from Date.now(), and the inbox seed anchors to wall-clock at
    // seed time, so without this two capture passes disagree on every "x minutes ago".
    async addInitScript(source) {
      await call("Page.addScriptToEvaluateOnNewDocument", { source });
    },

    // Seeded avatars are stored as absolute customermates.com URLs even though the same files
    // ship locally under public/demo/. Left alone a capture depends on the network and races
    // the initials fallback, so requests to that origin are served from the local app instead.
    async rewriteOrigin(fromPrefix, toPrefix) {
      await call("Fetch.enable", { patterns: [{ urlPattern: `${fromPrefix}*` }] });
      onEvent("Fetch.requestPaused", (params) => {
        const next = params.request.url.startsWith(fromPrefix)
          ? toPrefix + params.request.url.slice(fromPrefix.length)
          : null;
        const action = next
          ? call("Fetch.continueRequest", { requestId: params.requestId, url: next })
          : call("Fetch.continueRequest", { requestId: params.requestId });
        action.catch(() => {
          // the request was already torn down with the page
        });
      });
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
      await teardown();
    },
  };
}
