import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { BREAKPOINT_QUERY } from "@/hooks/use-media-query";

const SCANNED_ROOTS = [
  join(REPO_ROOT, "app", "[locale]", "(static)"),
  join(REPO_ROOT, "app", "components"),
  join(REPO_ROOT, "components", "marketing"),
];

const GLOBALS_CSS = join(REPO_ROOT, "styles", "globals.css");

const DEPICTIONS = new Map([
  [
    "app/[locale]/(static)/components/homepage-clip-terminal.tsx",
    "renders a simulated terminal. Its palette depicts terminal output, which is dark in both themes, so it is content rather than a surface the design system owns.",
  ],
  [
    "app/[locale]/(static)/components/homepage-stats-row.tsx",
    "inlines the n8n brand mark. A third-party logo keeps its own colour and must never be tokenised.",
  ],
]);

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
    reason: "borders come from --border, --input or --border-strong, whose alphas are derived per theme.",
  },
  {
    id: "raw-colour",
    pattern: /(?:rgba?\(\s*\d|#[0-9a-fA-F]{6}\b)/g,
    reason: "colour comes from the tokens in styles/globals.css, never from a literal.",
  },
  {
    id: "bespoke-radius",
    pattern: /\brounded-\[[^\]]+\]/g,
    reason: "radius comes from the --radius scale: rounded-card and rounded-panel for marketing surfaces.",
  },
  {
    id: "bespoke-breakpoint",
    pattern: /\b(?:min|max)-\[\d+(?:rem|px)\]:/g,
    reason: "the public navigation boundary is the nav: variant, defined once as --breakpoint-nav.",
  },
  {
    id: "bespoke-display-size",
    pattern: /\btext-\[clamp\(/g,
    reason: "display sizes come from .text-display and .text-display-sm.",
  },
];

function scannedFiles(): string[] {
  return SCANNED_ROOTS.flatMap((root) =>
    walkFiles(root, (path) => /\.tsx$/.test(path) && !path.includes("__tests__")),
  );
}

function isDepiction(file: string, ruleId: string): boolean {
  return ruleId === "raw-colour" && DEPICTIONS.has(relative(REPO_ROOT, file));
}

describe("marketing token discipline", () => {
  const files = scannedFiles();

  it("scans the public marketing surface", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const rule of RULES) {
    it(`rejects ${rule.id}`, () => {
      const offences: string[] = [];

      for (const file of files) {
        if (isDepiction(file, rule.id)) continue;

        const source = readFileSync(file, "utf8");
        source.split("\n").forEach((line, index) => {
          const matches = line.match(new RegExp(rule.pattern.source, "g"));
          if (matches) offences.push(`${relative(REPO_ROOT, file)}:${index + 1} ${matches.join(", ")}`);
        });
      }

      expect(offences, `${rule.reason}\n${offences.join("\n")}`).toEqual([]);
    });
  }
});

describe("marketing colour depictions", () => {
  it("keeps every recorded exception pointing at a file that still exists", () => {
    const scanned = new Set(scannedFiles().map((file) => relative(REPO_ROOT, file)));

    for (const file of DEPICTIONS.keys()) expect(scanned, `${file} no longer exists`).toContain(file);
  });
});

describe("marketing navigation breakpoint", () => {
  it("states the public navigation boundary once", () => {
    const css = readFileSync(GLOBALS_CSS, "utf8");
    const declared = css.match(/--breakpoint-nav:\s*([^;]+);/);

    expect(declared, "styles/globals.css must declare --breakpoint-nav").not.toBeNull();
    expect(BREAKPOINT_QUERY.nav).toBe(`(min-width: ${declared?.[1].trim()})`);
  });
});
