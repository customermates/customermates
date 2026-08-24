import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { RETIRED_CLAIMS } from "./lib/retired-claims-data";
import { REPO_ROOT } from "./walk";

const SCENES_DIR = join(REPO_ROOT, "components", "marketing", "scenes");

const STYLEGUIDE_DIR = join(REPO_ROOT, "app", "[locale]", "(static)", "styleguide", "components");

const STYLEGUIDE_FILES = ["visual-standards.tsx", "image-classes.tsx"];

const MIN_WORDS = 3;

const CLASS_ATTRIBUTE = /^[\w\s:/[\]()#.,%-]*$/u;

const HANDWRITTEN_MONEY =
  /(?:^|\s)(?:[€$£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:EUR|USD|GBP|euro|dollars?))\b/iu;

const SEAT_ARITHMETIC = /\b\d+\s+(?:seats?|users?|Nutzer|Sitze)\b/iu;

type Literal = {
  file: string;
  line: number;
  text: string;
};

function sourceFiles(): string[] {
  const scenes = readdirSync(SCENES_DIR)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => join(SCENES_DIR, file));
  return [...scenes, ...STYLEGUIDE_FILES.map((file) => join(STYLEGUIDE_DIR, file))];
}

// A scene carries its copy as plain string literals in JSX rather than as markdown, so the
// markdown-shaped extractors the other claim guards use cannot see it. Pulling every quoted
// string and every run of JSX text is deliberately blunt: over-collecting costs nothing here
// because the claim patterns only fire on product assertions, while under-collecting would
// let a drawn window state something the product cannot do.
function literals(file: string): Literal[] {
  const source = readFileSync(file, "utf8");
  const found: Literal[] = [];

  source.split("\n").forEach((line, index) => {
    const quoted = [...line.matchAll(/"([^"\\]{4,})"/gu), ...line.matchAll(/`([^`$\\]{4,})`/gu)];
    for (const match of quoted) {
      const text = match[1].trim();
      if (CLASS_ATTRIBUTE.test(text)) continue;
      if (text.split(/\s+/u).length < MIN_WORDS) continue;
      found.push({ file, line: index + 1, text });
    }

    const jsxText = line.match(/>\s*([A-Za-z][^<>{}]{12,})\s*</u);
    if (jsxText) found.push({ file, line: index + 1, text: jsxText[1].trim() });
  });

  return found;
}

function allLiterals(): Literal[] {
  return sourceFiles().flatMap((file) => literals(file));
}

describe("scene copy claim discipline", () => {
  const collected = allLiterals();

  it("finds copy to check", () => {
    expect(collected.length).toBeGreaterThan(10);
  });

  it("states no claim the product has retired", () => {
    const offences: string[] = [];

    for (const literal of collected) {
      for (const claim of RETIRED_CLAIMS) {
        if (!claim.pattern.test(literal.text)) continue;
        if (claim.permittedContext.some((context) => context.test(literal.text))) continue;
        offences.push(
          `${relative(REPO_ROOT, literal.file)}:${literal.line} [${claim.id}] ${literal.text}\n    ${claim.why} (${claim.authority})`,
        );
      }
    }

    expect(
      offences,
      "a drawn product window is a claim. Copy retired for marketing prose may not return as a picture",
    ).toEqual([]);
  });

  it("prices nothing by hand", () => {
    const offences = collected
      .filter((literal) => HANDWRITTEN_MONEY.test(literal.text) || SEAT_ARITHMETIC.test(literal.text))
      .map((literal) => `${relative(REPO_ROOT, literal.file)}:${literal.line} ${literal.text}`);

    expect(
      offences,
      "commercial figures come from the catalog, and a scene cannot resolve a token, so it must not state one",
    ).toEqual([]);
  });
});
