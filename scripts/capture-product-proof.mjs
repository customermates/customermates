// Captures real product screenshots ("product proof") deterministically.
//
// The style guide says a capture is evidence and a scene is a drawing. Evidence has to come
// from the running product, so this drives a seeded local instance rather than compositing
// anything. Determinism matters because a capture that differs run to run cannot be reviewed:
// you never know whether a diff is a product change or the clock moving.
//
// Three things would otherwise make two passes disagree, and each is handled here:
//   - relative times ("7 minutes ago") come from client-side Date.now(), so the clock is
//     frozen before any page script runs;
//   - seeded avatars are stored as absolute customermates.com URLs though the same files ship
//     locally, so that origin is rewritten to the local app;
//   - content surfaces run a 220ms entrance and dashboard charts animate on mount, so a frame
//     is only accepted once two consecutive screenshots agree.
//
// Usage:
//   APP_MODE=demo yarn dev          (demo mode auto-signs-in as the seed user; writes are blocked)
//   node scripts/capture-product-proof.mjs [--verify] [--only inbox]
//
// Note: after `yarn db:reset` the dev server must be restarted (the reset drops the workflow
// schemas), and after any styles/globals.css edit it must be restarted too (Turbopack otherwise
// serves the previously compiled stylesheet).

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { launchChrome } from "./lib/cdp.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const BASE = flag("url", "http://localhost:4000");
const LOCALE = flag("locale", "en");
const ONLY = flag("only", null);
const WIDTH = 1920;
const HEIGHT = 1080;
const OUT_DIR = "public/captures";
const AVATAR_ORIGIN = "https://customermates.com/demo/";

// Each target names a route and, when the view it needs is not reachable by URL, the clicks
// that get there. Adding a capture is adding an entry here.
const TARGETS = [
  // An inbox with nothing selected shows the empty-state background, which reads as a
  // half-loaded screenshot. Opening a seeded thread is what the picture is actually about.
  { actions: [{ text: "Next steps for the Roche rollout" }], name: "inbox", path: "/inbox" },
  { name: "deals", path: "/deals" },
  // The chart library animates in JavaScript and ignores reduced motion, and its responsive
  // container re-measures after mount, so this one needs longer than the rest before it holds still.
  { name: "dashboard", path: "/dashboard", settleFloorMs: 7000 },
  // The layout switch lives inside the Appearance popover, so reaching the board is two clicks.
  {
    actions: [{ label: "Appearance" }, { label: "Switch to kanban view" }],
    dismissAfterActions: true,
    name: "deals-board",
    path: "/deals",
  },
];

const THEMES = ["light", "dark"];

const SETTLED = `(() => {
  const busy = document.querySelector('[data-page-skeleton-loading], [data-page-state="loading"], [data-page-loading], [aria-busy="true"]');
  if (busy) return false;
  const images = [...document.images];
  return images.every((image) => image.complete);
})()`;

async function waitFor(browser, expression, label, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await browser.eval(expression)) return;
    await browser.eval("new Promise((r) => setTimeout(r, 250))");
  }
  throw new Error(`timed out waiting for ${label}`);
}

// Reduced motion stops every CSS animation, including the 220ms entrance on content surfaces,
// but dashboard charts animate in JavaScript and ignore it. So the frame is only accepted after
// a floor has elapsed AND three consecutive screenshots agree: two in a row can coincide part
// way through a slow chart grow-in, which is how three of these targets were still drifting.
const SETTLE_FLOOR_MS = 3000;
const STABLE_FRAMES = 4;

async function settledScreenshot(browser, floorMs = SETTLE_FLOOR_MS, attempts = 40) {
  await browser.eval("document.fonts.ready.then(() => true)");
  await browser.eval(`new Promise((r) => setTimeout(r, ${floorMs}))`);

  let last = null;
  let lastHash = "";
  let stable = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const next = await browser.screenshot();
    const nextHash = createHash("sha1").update(next).digest("hex");
    stable = nextHash === lastHash ? stable + 1 : 0;
    last = next;
    lastHash = nextHash;
    if (stable >= STABLE_FRAMES - 1) return next;
    await browser.eval("new Promise((r) => setTimeout(r, 400))");
  }

  return last;
}

// Controls are found by visible text or by accessible name, whichever the component exposes:
// the layout switcher is icon-only with an aria-label, while menu items carry text.
async function click(browser, action) {
  const needle = JSON.stringify((action.text ?? action.label).toLowerCase());
  const clicked = await browser.eval(`(() => {
    const nodes = [...document.querySelectorAll('button, a, [role="menuitem"], [role="option"], [role="tab"]')];
    const hit = nodes.find((node) => {
      if (node.getAttribute("aria-disabled") === "true" || node.disabled) return false;
      const name = (node.getAttribute("aria-label") ?? node.textContent ?? "").trim().toLowerCase();
      return name.includes(${"$"}{needle});
    });
    if (!hit) return false;
    hit.click();
    return true;
  })()`.replace("${needle}", needle));
  if (!clicked) throw new Error(`no enabled control named "${action.text ?? action.label}"`);
  await browser.eval("new Promise((r) => setTimeout(r, 700))");
}

// The theme is persisted by the app in localStorage and a cookie, both written from effects.
// A first navigation therefore renders the server's theme and swaps after hydration, while
// every later one is already correct server-side -- which made pass one and pass two of the
// same capture differ. Persisting the choice, then navigating a second time, removes the swap.
async function applyTheme(browser, theme) {
  await browser.eval(`(() => {
    localStorage.setItem("theme", ${JSON.stringify(theme)});
    document.cookie = "theme=" + ${JSON.stringify(theme)} + "; path=/; max-age=604800";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(${JSON.stringify(theme)});
    return true;
  })()`);
}

async function captureTarget(browser, target, theme) {
  const url = `${BASE}/${LOCALE}${target.path}`;
  await browser.goto(url);
  await applyTheme(browser, theme);
  await browser.goto(url);
  await applyTheme(browser, theme);
  await waitFor(browser, SETTLED, `${target.name} (${theme}) to settle`);

  for (const action of target.actions ?? []) {
    await click(browser, action);
    await waitFor(browser, SETTLED, `${target.name} after ${action.text ?? action.label}`);
  }

  // A control reached through a popover leaves that popover open, and whether it is open is
  // the difference between two otherwise identical passes. Dismissing it also means the
  // capture shows the view rather than the menu that selected it.
  if (target.dismissAfterActions) {
    await browser.eval(`(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return true;
    })()`);
    await browser.eval("new Promise((r) => setTimeout(r, 700))");
  }

  return settledScreenshot(browser, target.settleFloorMs);
}

const frozenAt = Date.now();
const browser = await launchChrome({ width: WIDTH, height: HEIGHT, scale: 1 });
const failures = [];

try {
  // Kills the entrance animation on every content surface and the skeleton pulse. It does not
  // reach the chart library, which animates in JavaScript; the settle floor covers that.
  await browser.setReducedMotion(true);
  // Freeze before any navigation so every page in the run shares one instant.
  await browser.addInitScript(`(() => {
    const FROZEN = ${frozenAt};
    const RealDate = Date;
    const FrozenDate = new Proxy(RealDate, {
      construct(target, argumentsList) {
        return argumentsList.length ? new target(...argumentsList) : new target(FROZEN);
      },
      apply() {
        return new RealDate(FROZEN).toString();
      },
    });
    FrozenDate.now = () => FROZEN;
    globalThis.Date = FrozenDate;
    // performance.now() is deliberately NOT frozen. Only Date drives the relative times this
    // needs to pin, while animation libraries measure progress from performance.now via
    // requestAnimationFrame -- freezing it leaves a chart permanently mid-flight, which showed
    // up as the dashboard drifting between passes.
  })();`);
  await browser.rewriteOrigin(AVATAR_ORIGIN, `${BASE}/demo/`);

  await browser.goto(`${BASE}/${LOCALE}/dashboard`);
  const signedIn = await browser.eval("!location.pathname.includes('/auth/')");
  if (!signedIn) {
    throw new Error(
      "not signed in. Captures need APP_MODE=demo, which auto-signs-in as the seed user. Set it in .env and restart yarn dev.",
    );
  }

  const targets = ONLY ? TARGETS.filter((target) => target.name === ONLY) : TARGETS;

  await mkdir(join(OUT_DIR, "light"), { recursive: true });
  await mkdir(join(OUT_DIR, "dark"), { recursive: true });

  // Theme is the OUTER loop and is persisted once before any target is visited. Setting it per
  // target meant the first navigation of a capture rendered whatever theme the previous capture
  // left behind and then swapped after hydration, while the second navigation was already
  // correct, so pass one and pass two disagreed on whichever target followed a theme change.
  //
  // Each theme block warms every target first by walking its real path, clicks included, and
  // throwing the result away. The dev server compiles a route and its data on first use, so
  // without this whichever target ran first was captured colder than the rest. It is a warm-up,
  // not a retry: nothing kept is ever re-taken hoping for a better frame.
  for (const theme of THEMES) {
    await browser.goto(`${BASE}/${LOCALE}/dashboard`);
    await applyTheme(browser, theme);

    // Twice, not once. Opening a thread for the first time changes state that outlives the
    // navigation, so a single warm pass still left the first measured capture starting from a
    // different place than the second. Two passes exhaust that first-open effect.
    for (const pass of [0, 1]) {
      for (const target of targets) {
        try {
          await captureTarget(browser, target, theme);
        } catch {
          // a target that cannot warm reports its real error when it is captured below
        }
      }
      void pass;
    }

    for (const target of targets) {
      try {
        const first = await captureTarget(browser, target, theme);

        if (args.includes("--verify")) {
          const second = await captureTarget(browser, target, theme);
          const a = createHash("sha1").update(first).digest("hex");
          const b = createHash("sha1").update(second).digest("hex");
          if (a !== b) {
            failures.push(`${target.name} (${theme}) is not deterministic`);
            console.log(`NOT deterministic: ${target.name} (${theme})`);
          } else {
            console.log(`deterministic: ${target.name} (${theme})`);
          }
        }

        await writeFile(join(OUT_DIR, theme, `${target.name}.png`), first);
        console.log(`wrote ${OUT_DIR}/${theme}/${target.name}.png`);
      } catch (error) {
        failures.push(`${target.name} (${theme}): ${error.message}`);
        console.log(`FAILED ${target.name} (${theme}): ${error.message}`);
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`\n${failures.length} failed:\n  ${failures.join("\n  ")}`);
  process.exitCode = 1;
}
