import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const GLOBALS_CSS = join(REPO_ROOT, "styles", "globals.css");

const TAILWIND_THEME = join(REPO_ROOT, "node_modules", "tailwindcss", "theme.css");

const SCENES_DIR = join(REPO_ROOT, "components", "marketing", "scenes");

const BARREL = join(SCENES_DIR, "platform", "index.ts");

const DEPICTIONS = new Set(["scene-cursor.tsx"]);

// The product overrides its own primitives in places, and copying those overrides is fidelity
// rather than drift. Each entry names the product file that applies the identical class, so an
// override nobody can point at is rejected and a stale entry fails on its own.
const PRODUCT_OVERRIDES = new Map([
  ["Button rounded-r-none", "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx"],
  ["Button pr-2.5", "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx"],
  ["Button rounded-l-none", "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx"],
  ["Button border-l", "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx"],
  ["Button border-primary-foreground/20", "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx"],
  ["Button px-1.5", "app/[locale]/(protected)/inbox/components/thread-reply-composer.tsx"],
  ["Card gap-2", "components/data-view/data-kanban-view.tsx"],
  ["Card py-3", "components/data-view/data-kanban-view.tsx"],
  ["Card gap-0", "components/card/app-card.tsx"],
  ["Card py-0", "components/card/app-card.tsx"],
  ["Card size-full", "app/[locale]/(protected)/dashboard/components/chart-widget-card.tsx"],
  ["Card h-full", "app/[locale]/(protected)/dashboard/components/chart-widget-card.tsx"],
  ["Card w-full", "app/[locale]/(protected)/dashboard/components/chart-widget-card.tsx"],
  ["CardHeader gap-0.5", "app/[locale]/(protected)/dashboard/components/chart-widget-card.tsx"],
  ["CardHeader p-6", "components/card/app-card-header.tsx"],
  ["CardHeader pb-0", "components/card/app-card-header.tsx"],
  ["CardContent px-3", "components/data-view/data-kanban-view.tsx"],
  ["CardContent p-6", "components/card/app-card-body.tsx"],
  ["CardContent min-h-0", "components/card/app-card-body.tsx"],
]);

// A leaf whose pixels a scene may not restate. The list is the barrel's own export set, read at
// test time, so adding a primitive to the barrel automatically puts it under this rule.
const RESTATED_PROPERTY =
  /^(?:rounded|border|shadow|text-(?:xs|sm|base|lg|xl|\d+xl)|h|w|size|min-h|min-w|p[xytblr]?|m[xytblr]?|gap)-/u;

function globals(): string {
  return readFileSync(GLOBALS_CSS, "utf8");
}

function pxOf(value: string): number {
  const rem = value.match(/^([\d.]+)rem$/u);
  if (rem) return Number.parseFloat(rem[1]) * 16;

  const px = value.match(/^([\d.]+)px$/u);
  if (px) return Number.parseFloat(px[1]);

  throw new Error(`not a length: ${value}`);
}

function tailwindScale(): Record<string, number> {
  const source = readFileSync(TAILWIND_THEME, "utf8");
  const scale: Record<string, number> = {};
  for (const match of source.matchAll(/^\s*(--(?:spacing|text-[a-z0-9]+)):\s*([^;]+);$/gmu)) {
    if (match[1].endsWith("--line-height")) continue;
    try {
      scale[match[1]] = pxOf(match[2].trim());
    } catch {
      continue;
    }
  }
  return scale;
}

function scenePlatformBlock(): string {
  const block = globals().match(/\.scene-platform\s*\{([\s\S]*?)\n {2}\}/u);
  if (!block) throw new Error(".scene-platform block not found in styles/globals.css");
  return block[1];
}

function sceneFiles(): string[] {
  return readdirSync(SCENES_DIR).filter((file) => file.endsWith(".tsx"));
}

function barrelExports(): string[] {
  const source = readFileSync(BARREL, "utf8");
  return [...source.matchAll(/export\s*\{([^}]+)\}/gu)]
    .flatMap((match) => match[1].split(","))
    .map((name) => name.trim())
    .filter((name) => /^[A-Z]/u.test(name));
}

describe("a scene is the platform, rescaled", () => {
  it("derives its ratio table from Tailwind rather than restating it", () => {
    const scale = tailwindScale();
    const unit = scale["--spacing"];
    const block = scenePlatformBlock();
    const problems: string[] = [];

    expect(unit, "Tailwind must declare --spacing for the ratios to mean anything").toBeGreaterThan(0);

    if (!/--spacing:\s*var\(--scene-unit\)/u.test(block)) {
      problems.push("--spacing must be exactly var(--scene-unit)");
    }

    for (const [token, px] of Object.entries(scale)) {
      if (token === "--spacing") continue;

      const declared = block.match(new RegExp(`${token}:\\s*calc\\(var\\(--scene-unit\\) \\* ([\\d.]+)\\)`, "u"));
      if (!declared) {
        problems.push(`${token} is not rescaled, so it would stay at its native size inside a scene`);
        continue;
      }

      const expected = px / unit;
      if (Math.abs(Number.parseFloat(declared[1]) - expected) > 1e-9) {
        problems.push(`${token} is ${declared[1]} units where Tailwind's own value is ${expected}`);
      }
    }

    expect(problems).toEqual([]);
  });

  it("rescales the radius scale by ratio, because an offset keeps its pixels", () => {
    const offenders = [...globals().matchAll(/(--radius-[a-z]+):\s*calc\(var\(--radius\)\s*[+-]\s*[\d.]+px\)/gu)].map(
      (match) => match[1],
    );

    expect(
      offenders,
      "calc(var(--radius) - 2px) keeps its 2px wherever --radius lands, so the step stops being a ratio the moment a scene rescales it",
    ).toEqual([]);
  });

  it("scales by one factor, so boxes and type can never drift apart again", () => {
    const block = scenePlatformBlock();
    const declarations = [...block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/gu)];
    const offenders = declarations
      .filter(([, name]) => name !== "--scene-unit")
      .filter(([, , value]) => /cqw|cqi|vw/u.test(value))
      .map(([, name]) => name);

    expect(
      offenders,
      "a second container-relative coefficient is a second scale, which is the two-rate system this replaced",
    ).toEqual([]);
    expect(block.match(/--scene-unit:/gu)?.length ?? 0).toBe(1);
  });

  it("routes every platform primitive through the barrel", () => {
    const offenders: string[] = [];

    for (const file of sceneFiles()) {
      const source = readFileSync(join(SCENES_DIR, file), "utf8");
      for (const match of source.matchAll(/from "@\/components\/(ui|chip|data-view|shared)\/[^"]+"/gu)) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }

    expect(
      offenders,
      "importing a platform component directly makes the allowlist unenforceable, and one of those files drags mobx and Prisma into the marketing bundle",
    ).toEqual([]);
  });

  it("composes primitives rather than restyling them", () => {
    const primitives = barrelExports();
    const offenders: string[] = [];

    expect(primitives.length).toBeGreaterThan(4);

    for (const file of sceneFiles()) {
      if (DEPICTIONS.has(file)) continue;

      const source = readFileSync(join(SCENES_DIR, file), "utf8");
      for (const match of source.matchAll(/<([A-Z][A-Za-z]*)\s([^>]*?)className="([^"]*)"/gsu)) {
        if (!primitives.includes(match[1])) continue;

        for (const token of match[3].split(/\s+/u)) {
          const bare = token.replace(/^!/u, "");
          if (!RESTATED_PROPERTY.test(bare)) continue;
          if (PRODUCT_OVERRIDES.has(`${match[1]} ${bare}`)) continue;
          offenders.push(`${file}: <${match[1]} className="… ${token} …">`);
        }
      }
    }

    expect(
      offenders,
      "cn is twMerge, so a size or radius passed to a platform component replaces the component's own rather than adding to it. That is how a depiction drifts with no bespoke syntax to catch it. If the product applies the same override, record it in PRODUCT_OVERRIDES with the file that proves it",
    ).toEqual([]);
  });

  it("keeps every recorded override pointed at a file that still applies it", () => {
    const stale: string[] = [];

    for (const [key, source] of PRODUCT_OVERRIDES) {
      const token = key.slice(key.indexOf(" ") + 1);
      const contents = readFileSync(join(REPO_ROOT, source), "utf8");
      if (!contents.includes(token)) stale.push(`${key} is no longer in ${source}`);
    }

    expect(stale, "an override survives only while the product still applies it").toEqual([]);
  });
});
