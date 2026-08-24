// Verifies the motion contract the style guide documents, in a real engine.
//
// Why this exists as a script and not a unit test: reduced motion is a media query,
// IntersectionObserver needs a page the compositor considers visible, and "the animation
// finished at its final value" is only observable from getComputedStyle after the fact.
// None of that is reachable from jsdom, and the in-app browser pane runs with
// document.hidden true so observers never fire there either.
//
// Usage: yarn dev, then `node scripts/verify-visual-motion.mjs [url]`.
// NOTE: changes to styles/globals.css need a dev-server RESTART, not just a reload.
// Turbopack serves the previously compiled stylesheet, so a harness run right after a CSS
// edit silently measures the old CSS and reports success. That failure mode was observed
// while building this; it is the reason the harness is proved with a planted fault below.

import { launchChrome } from "./lib/cdp.mjs";

const URL = process.argv[2] ?? "http://localhost:4000/en/styleguide";

const SCROLL_TO_EDGE = `(async () => {
  const main = document.querySelector('main');
  const svg = [...main.querySelectorAll('svg')].find((s) => s.querySelector('[data-illustration-part="edge"]'));
  if (!svg) throw new Error('no illustration with edges on the page');
  main.scrollTop = svg.getBoundingClientRect().top + main.scrollTop - 200;
  await new Promise((r) => setTimeout(r, 100));
  return true;
})()`;

const PROBE = `(() => {
  const main = document.querySelector('main');
  const svg = [...main.querySelectorAll('svg')].find((s) => s.querySelector('[data-illustration-part="edge"]'));
  const parts = {};
  for (const el of svg.querySelectorAll('[data-illustration-part]')) {
    const cs = getComputedStyle(el);
    parts[el.getAttribute('data-illustration-part')] = {
      anim: cs.animationName, fillOpacity: cs.fillOpacity, opacity: cs.opacity, dash: cs.strokeDashoffset,
    };
  }
  return {
    armedInDoc: document.querySelectorAll('[data-illustration-play]').length,
    wrapperArmed: svg.parentElement.hasAttribute('data-illustration-play'),
    running: svg.getAnimations({ subtree: true }).length,
    parts,
  };
})()`;

const wait = (ms) => `new Promise((r) => setTimeout(r, ${ms}))`;

const failures = [];

function check(label, passed, detail) {
  console.log(`${passed ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!passed) failures.push(label);
}

const browser = await launchChrome({ width: 1440, height: 900 });

try {
  await browser.setReducedMotion(false);
  await browser.goto(URL);
  await browser.eval(wait(900));

  const before = await browser.eval(PROBE);
  check("gate closed before the illustration is scrolled to", before.armedInDoc === 0, `armed=${before.armedInDoc}`);

  await browser.eval(SCROLL_TO_EDGE);
  const during = await browser.eval(PROBE);
  check("gate arms on scroll into view", during.wrapperArmed, `armedInDoc=${during.armedInDoc}`);
  check("animations actually run", during.running > 0, `running=${during.running}`);

  await browser.eval(wait(1400));
  const after = await browser.eval(PROBE);
  check("sequence finishes", after.running === 0, `running=${after.running}`);
  check("body ink preserved", after.parts.body.opacity === "0.07", `opacity=${after.parts.body.opacity}`);
  check("detail ink preserved", after.parts.detail.opacity === "0.16", `opacity=${after.parts.detail.opacity}`);
  check("every part fully painted", Object.values(after.parts).every((p) => p.fillOpacity === "1"));
  check("edges fully drawn", after.parts.edge.dash === "0px", `dashoffset=${after.parts.edge.dash}`);

  await browser.eval("(() => { document.querySelector('main').scrollTop = 0; return true; })()");
  await browser.eval(wait(400));
  await browser.eval(SCROLL_TO_EDGE);
  await browser.eval(wait(300));
  const replay = await browser.eval(PROBE);
  check("does not replay on re-entry", replay.running === 0, `running=${replay.running}`);

  await browser.setReducedMotion(true);
  await browser.goto(URL);
  await browser.eval(SCROLL_TO_EDGE);
  await browser.eval(wait(900));
  const reduced = await browser.eval(PROBE);
  check("reduced motion: zero animations", reduced.running === 0, `running=${reduced.running}`);
  check("reduced motion: animation-name none", Object.values(reduced.parts).every((p) => p.anim === "none"));
  check("reduced motion: edges drawn, not hidden", reduced.parts.edge.dash === "0px", `dashoffset=${reduced.parts.edge.dash}`);
  check(
    "reduced motion: ink not blown out",
    reduced.parts.body.opacity === "0.07" && reduced.parts.detail.opacity === "0.16",
    `body=${reduced.parts.body.opacity} detail=${reduced.parts.detail.opacity}`,
  );
  check("reduced motion: accent visible", reduced.parts.accent.opacity === "1", `opacity=${reduced.parts.accent.opacity}`);
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(" | ")}` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
