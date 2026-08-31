import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { BREAKPOINT_QUERY } from "@/hooks/use-media-query";

const SCANNED_ROOTS = [
  join(REPO_ROOT, "app", "[locale]", "(static)", "styleguide"),
  join(REPO_ROOT, "components", "marketing", "visuals"),
];

const ISOLATED_MARKETING_COMPONENTS = [
  "components/marketing/marketing-container.tsx",
  "components/marketing/marketing-section.tsx",
  "components/marketing/browser-frame.tsx",
  "components/marketing/process-steps.tsx",
].map((path) => join(REPO_ROOT, path));

const GLOBALS_CSS = join(REPO_ROOT, "styles", "globals.css");

const RULES = [
  {
    id: "wash-as-resting-fill",
    pattern: /\bbg-(muted|accent|selected|placeholder)\/\d+/g,
    reason:
      "a wash carries state, not resting elevation, and inverts between themes when pinned to a surface. Use bg-card, bg-background or bg-sidebar.",
  },
  {
    id: "foreground-alpha-border",
    pattern: /\bborder-(foreground|background)\/\d+/g,
    reason:
      "borders come from --border, --input or --border-strong, whose alphas are derived per theme.",
  },
  {
    id: "raw-colour",
    pattern: /(?:rgba?\(\s*\d|#[0-9a-fA-F]{6}\b)/g,
    reason:
      "colour comes from the tokens in styles/globals.css, never from a literal.",
  },
  {
    id: "bespoke-radius",
    pattern: /\brounded-\[[^\]]+\]/g,
    reason:
      "radius comes from the --radius scale. Marketing chrome takes rounded-card and rounded-panel.",
  },
  {
    id: "bespoke-breakpoint",
    pattern: /\b(?:min|max)-\[\d+(?:rem|px)\]:/g,
    reason:
      "the target marketing navigation boundary is the nav: variant, defined once as --breakpoint-nav.",
  },
  {
    id: "bespoke-display-size",
    pattern: /\btext-\[clamp\(/g,
    reason:
      "display sizes come from .text-hero, .text-display and .text-display-sm.",
  },
];

function scannedFiles(): string[] {
  return [
    ...SCANNED_ROOTS.flatMap((root) =>
      walkFiles(
        root,
        (path) => /\.tsx$/.test(path) && !path.includes("__tests__"),
      ),
    ),
    ...ISOLATED_MARKETING_COMPONENTS,
  ];
}

describe("marketing token discipline", () => {
  const files = scannedFiles();

  it("scans only the noindex guide and its isolated visual layer", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.map((file) => relative(REPO_ROOT, file))).not.toContain(
      "app/components/public-navbar.tsx",
    );
  });

  for (const rule of RULES) {
    it(`rejects ${rule.id}`, () => {
      const offences: string[] = [];

      for (const file of files) {
        const source = readFileSync(file, "utf8");
        source.split("\n").forEach((line, index) => {
          const matches = line.match(new RegExp(rule.pattern.source, "g"));
          if (matches)
            offences.push(
              `${relative(REPO_ROOT, file)}:${index + 1} ${matches.join(", ")}`,
            );
        });
      }

      expect(offences, `${rule.reason}\n${offences.join("\n")}`).toEqual([]);
    });
  }
});

describe("marketing navigation breakpoint", () => {
  it("states the target guide-switcher boundary once", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    const declared = css.match(/--breakpoint-nav:\s*([^;]+);/);

    expect(
      declared,
      "styles/globals.css must declare --breakpoint-nav",
    ).not.toBeNull();
    expect(BREAKPOINT_QUERY.nav).toBe(`(min-width: ${declared?.[1].trim()})`);
  });
});

describe("style-guide CSS isolation", () => {
  it("keeps current public radii, the approved dark ladder and scoped inverse color schemes", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");

    expect(css).toContain("--radius-sm: calc(var(--radius) - 4px);");
    expect(css).toContain("--radius-md: calc(var(--radius) - 2px);");
    expect(css).toContain("--radius-xl: calc(var(--radius) + 4px);");
    expect(css).toContain("--container-marketing: 80rem;");
    expect(css).toMatch(
      /\.marketing-container-wide\s*\{\s*max-width:\s*96rem;/u,
    );
    expect(css).toMatch(/\.dark,[\s\S]*?--background:\s*#0d0d10;/u);
    expect(css).toMatch(/\.dark,[\s\S]*?--card:\s*#151518;/u);
    expect(css).toMatch(
      /\.dark,[\s\S]*?--border:\s*rgb\(255 255 255 \/ 7\.5%\);/u,
    );
    expect(css).toMatch(/\.dark,[\s\S]*?--sidebar:\s*#08080b;/u);
    expect(css).not.toMatch(/(?:^|\n):root\s*\{[^}]*color-scheme:/u);
    expect(css).toMatch(
      /\.dark \[data-marketing-tone="inverse"\]\s*\{\s*color-scheme:\s*light;/u,
    );
    expect(css).toMatch(
      /:root:not\(\.dark\) \[data-marketing-tone="inverse"\],[\s\S]*?color-scheme:\s*dark;/u,
    );
  });

  it("declares the approved neutral hero role and continuous-flow divider ownership", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");

    expect(css).toMatch(
      /\.text-hero\s*\{[\s\S]*?font-size:\s*clamp\(3rem, 6\.5vw, 6rem\);/u,
    );
    expect(css).toMatch(
      /\.text-display\s*\{[\s\S]*?@apply font-medium text-balance;/u,
    );
    expect(css).toMatch(
      /\.text-display-sm\s*\{[\s\S]*?@apply font-medium text-balance;/u,
    );
    expect(css).toMatch(
      /\[data-marketing-flow="continuous"\]\s+\.marketing-section:not/u,
    );
  });
});
