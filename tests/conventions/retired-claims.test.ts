import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import {
  DENIED,
  EXTERNAL,
  NO_OR_EXTERNAL,
  RETIRED_CLAIMS,
  type ClaimUnit,
  type RetiredClaim,
  type UnitKind,
} from "./lib/retired-claims-data";

const MIXED_SECTIONS = new Set(["blog-posts", "compare-pages", "for-pages"]);
// These are the canonical first-party surfaces owned by this recurrence guard.
// Long-form blog, comparison, and vertical landing pages are handled by their
// dedicated SEO review; this guard avoids reinterpreting competitor/editorial copy.
const CANONICAL_SECTIONS = new Set([
  "affiliate",
  "api-overview",
  "auth",
  "automation",
  "blog",
  "compare",
  "feature-pages",
  "features",
  "features-all",
  "for",
  "help-and-feedback",
  "homepage",
  "pricing",
]);
const PRODUCT = /\bCustomermates\b/iu;
const COMPETITOR =
  /^\s*(?:HubSpot|Salesforce|Pipedrive|Zoho|Folk|Freshsales|Salesflare|monday|Cobra|GoHighLevel|Close|Attio|Twenty|Odoo)\b/iu;
const UNAVAILABLE_VALUE =
  /^(?:false|none|no|not available|not included|unavailable|nein|nicht verfügbar|nicht enthalten)(?:\b|\s*[-—:])/iu;

function normalized(file: string): string {
  return file.split(sep).join("/");
}

function mixedSurface(file: string): boolean {
  const [, section] = normalized(file).split("/");
  return MIXED_SECTIONS.has(section);
}

function stripMarkup(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(
      /<Status(Available|Partial|Unavailable)\b[^>]*\/>/gu,
      (_match, status: string) => status.toLowerCase(),
    )
    .replace(/<[^>]+>/gu, " ")
    .replace(/[`*_~]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function tableCells(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let escaped = false;
  for (const char of line.replace(/^\s*\|/u, "").replace(/\|\s*$/u, "")) {
    if (escaped) {
      cell += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
      cell += char;
    } else if (char === "|") {
      cells.push(stripMarkup(cell));
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(stripMarkup(cell));
  return cells;
}

function scalarValue(line: string): string | undefined {
  const match = line.match(/^\s*(?:-\s*)?[A-Za-z][\w-]*:\s*(.+?)\s*$/u);
  if (!match) return undefined;
  return stripMarkup(match[1].replace(/^(["'])(.*)\1$/u, "$2"));
}

function splitAssertions(line: string): string[] {
  return stripMarkup(line)
    .split(
      /(?<=[.!?;])\s+|\s+(?:but|however|whereas|aber|allerdings|hingegen)\s+/iu,
    )
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.endsWith("?"));
}

function extractMdxUnits(file: string, source: string): ClaimUnit[] {
  const units: ClaimUnit[] = [];
  const lines = source.split("\n");
  const isMixed = mixedSurface(file);
  let inFence = false;
  let inFrontmatter = lines[0]?.trim() === "---";
  let pendingName: { text: string; line: number } | undefined;
  let pendingTitle: { text: string; line: number } | undefined;
  let productHeadingDepth: number | undefined;

  const flushTitle = () => {
    if (!pendingTitle) return;
    units.push({ file, locator: String(pendingTitle.line), kind: "frontmatter", text: pendingTitle.text });
    pendingTitle = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    const line = index + 1;

    if (/^```|^~~~/u.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*(?:import|export)\s/iu.test(raw)) continue;

    if (index === 0 && inFrontmatter) continue;
    if (inFrontmatter && trimmed === "---") {
      flushTitle();
      inFrontmatter = false;
      continue;
    }

    if (inFrontmatter) {
      const name = raw.match(/^\s*-?\s*name:\s*(.+?)\s*$/u);
      if (name) pendingName = { text: stripMarkup(name[1]), line };
      const sourceValue = raw.match(/^\s*source:\s*(.+?)\s*$/u);
      if (isMixed && sourceValue && pendingName) {
        const value = stripMarkup(sourceValue[1]);
        units.push({
          file,
          locator: String(pendingName.line),
          kind: "product-source",
          text: `${pendingName.text} — Customermates: ${value}`,
          productValue: value,
        });
        pendingName = undefined;
        continue;
      }
      if (!isMixed) {
        const block = raw.match(/^(\s*)(?:-\s*)?[A-Za-z][\w-]*:\s*\|-?\s*$/u);
        if (block) {
          const indent = block[1].length;
          const collected: string[] = [];
          let cursor = index + 1;
          while (cursor < lines.length) {
            const next = lines[cursor];
            if (next.trim() && next.search(/\S/u) <= indent) break;
            collected.push(next.trim());
            cursor += 1;
          }
          // A block scalar carries prose, so scan it the way body prose is scanned:
          // one unit per assertion, with interrogatives dropped. The question that
          // labels it is not a claim, exactly as a body heading is not one.
          for (const line of collected) {
            for (const assertion of splitAssertions(line.replace(/^\s*(?:[-*+] |\d+\. )/u, ""))) {
              if (!assertion || (COMPETITOR.test(assertion) && !PRODUCT.test(assertion))) continue;
              units.push({ file, locator: String(pendingTitle?.line ?? line), kind: "prose", text: assertion });
            }
          }
          pendingTitle = undefined;
          index = cursor - 1;
          continue;
        }

        const title = raw.match(/^\s*(?:-\s*)?title:\s*(.+?)\s*$/u);
        if (title) {
          flushTitle();
          pendingTitle = { text: scalarValue(raw) ?? "", line };
          continue;
        }

        flushTitle();
        const value = scalarValue(raw);
        if (value)
          units.push({
            file,
            locator: String(line),
            kind: "frontmatter",
            text: value,
          });
      }
      continue;
    }

    if (
      /^\s*\|/u.test(raw) &&
      /^\s*\|?\s*:?-{3,}/u.test(lines[index + 1] ?? "")
    ) {
      const headers = tableCells(raw);
      const productIndex = headers.findIndex((header) => PRODUCT.test(header));
      index += 1;
      while (index + 1 < lines.length && /^\s*\|/u.test(lines[index + 1])) {
        index += 1;
        const cells = tableCells(lines[index]);
        if (productIndex >= 0 && cells[productIndex] !== undefined) {
          const value = cells[productIndex];
          units.push({
            file,
            locator: String(index + 1),
            kind: "product-table-cell",
            text: `${cells[0] ?? "Feature"} — Customermates: ${value}`,
            productValue: value,
          });
        } else if (!isMixed) {
          units.push({
            file,
            locator: String(index + 1),
            kind: "prose",
            text: stripMarkup(lines[index]),
          });
        }
      }
      continue;
    }

    const heading = raw.match(/^(#{1,6})\s+(.+)$/u);
    if (heading) {
      const depth = heading[1].length;
      if (productHeadingDepth !== undefined && depth <= productHeadingDepth)
        productHeadingDepth = undefined;
      if (
        /^(?:Customermates\b|What is Customermates\b|Was ist Customermates\b)/iu.test(
          stripMarkup(heading[2]),
        )
      ) {
        productHeadingDepth = depth;
      }
    }

    if (!trimmed || /^\s*\|/u.test(raw)) continue;
    const assertions = splitAssertions(
      raw.replace(/^\s*(?:[-*+] |\d+\. )/u, ""),
    );
    const lineMentionsProduct = assertions.some((assertion) =>
      PRODUCT.test(assertion),
    );
    for (const assertion of assertions) {
      if (
        !assertion ||
        (COMPETITOR.test(assertion) && !PRODUCT.test(assertion))
      )
        continue;
      if (
        !isMixed ||
        lineMentionsProduct ||
        productHeadingDepth !== undefined
      ) {
        units.push({
          file,
          locator: String(line),
          kind: "prose",
          text: assertion,
        });
      }
    }
  }
  return units;
}

function extractJsonValueUnits(file: string, source: string): ClaimUnit[] {
  const units: ClaimUnit[] = [];
  const visit = (value: unknown, pointer: string): void => {
    if (typeof value === "string") {
      units.push({
        file,
        locator: pointer || "#",
        kind: "json-value",
        text: value,
      });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${pointer}/${index}`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) =>
        visit(
          item,
          `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`,
        ),
      );
    }
  };
  visit(JSON.parse(source), "#");
  return units;
}

function extractClaimUnits(file: string, source: string): ClaimUnit[] {
  return file.endsWith(".json")
    ? extractJsonValueUnits(file, source)
    : extractMdxUnits(file, source);
}

function isPermitted(claim: RetiredClaim, unit: ClaimUnit): boolean {
  if (unit.productValue && UNAVAILABLE_VALUE.test(unit.productValue))
    return true;
  const match = unit.text.match(claim.pattern);
  const matchIndex = match?.index ?? 0;
  const matchedText = match?.[0] ?? "";
  const localContext = unit.text.slice(
    Math.max(0, matchIndex - 72),
    matchIndex + matchedText.length + 32,
  );
  return claim.permittedContext.some((pattern) => {
    if (pattern === DENIED || pattern === EXTERNAL)
      return pattern.test(localContext);
    return pattern.test(unit.text);
  });
}

function findViolationsInSource(file: string, source: string): string[] {
  const violations: string[] = [];
  for (const unit of extractClaimUnits(file, source)) {
    for (const claim of RETIRED_CLAIMS) {
      if (claim.appliesTo && !claim.appliesTo(unit)) continue;
      const match = unit.text.match(claim.pattern);
      if (!match || isPermitted(claim, unit)) continue;
      violations.push(
        `${unit.file}:${unit.locator} [${claim.id}] "${match[0].trim()}" — ${claim.why} (${claim.authority})`,
      );
    }
  }
  return violations;
}

function scannedFiles(): string[] {
  const legalRoot = normalized(join(REPO_ROOT, "content", "legal"));
  return [
    ...walkFiles(join(REPO_ROOT, "content"), (path) => {
      if (!path.endsWith(".mdx") || normalized(path).startsWith(legalRoot))
        return false;
      const [, section] = normalized(relative(REPO_ROOT, path)).split("/");
      return CANONICAL_SECTIONS.has(section);
    }),
    ...walkFiles(join(REPO_ROOT, "i18n", "locales"), (path) =>
      path.endsWith(".json"),
    ),
  ].sort();
}

describe("retired claims stay retired", () => {
  it("keeps auditable, non-stateful rules", () => {
    expect(new Set(RETIRED_CLAIMS.map((claim) => claim.id)).size).toBe(
      RETIRED_CLAIMS.length,
    );
    expect(RETIRED_CLAIMS.every((claim) => claim.why && claim.authority)).toBe(
      true,
    );
    expect(
      RETIRED_CLAIMS.every(
        (claim) => !claim.pattern.global && !claim.pattern.sticky,
      ),
    ).toBe(true);
  });

  it("scans first-party content units independent of their collection", () => {
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "CSV import is included.",
      ),
    ).toHaveLength(1);
    expect(
      findViolationsInSource(
        "content/feature-pages/en/example.mdx",
        "Built-in AI assistant for every user.",
      ),
    ).toHaveLength(1);
  });

  it("binds a denial to the capability instead of a nearby unrelated sentence", () => {
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "No Slack app. Import contacts with our CSV uploader.",
      ),
    ).toHaveLength(1);
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Customermates has no CSV importer; prepare data for REST.",
      ),
    ).toEqual([]);
  });

  it("attributes mixed prose and tables only to Customermates", () => {
    const prose =
      "HubSpot includes native AI. Customermates has no built-in AI and connects external clients through MCP.";
    expect(
      findViolationsInSource("content/blog-posts/en/example.mdx", prose),
    ).toEqual([]);

    const table = [
      "| Feature | Customermates | Rival |",
      "| --- | --- | --- |",
      "| Mobile app | Responsive web only | Native iOS app |",
      "| CSV import | Included | Included |",
    ].join("\n");
    const violations = findViolationsInSource(
      "content/compare-pages/en/example.mdx",
      table,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("csv-importer");
  });

  it("carries same-line Customermates attribution across split assertions", () => {
    const firstParty = "Customermates stores contacts; CSV import is included.";
    const violations = findViolationsInSource(
      "content/blog-posts/en/example.mdx",
      firstParty,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("csv-importer");

    const competitor =
      "Customermates has no built-in AI; HubSpot includes native AI.";
    expect(
      findViolationsInSource("content/blog-posts/en/example.mdx", competitor),
    ).toEqual([]);
  });

  it("preserves status components when evaluating product tables", () => {
    const available = [
      "| Feature | Customermates |",
      "| --- | --- |",
      "| Built-in AI | <StatusAvailable /> |",
    ].join("\n");
    expect(
      findViolationsInSource("content/features/en/example.mdx", available),
    ).toHaveLength(1);

    const unavailable = [
      "| Feature | Customermates |",
      "| --- | --- |",
      "| Built-in AI | <StatusUnavailable /> |",
    ].join("\n");
    expect(
      findViolationsInSource("content/features/en/example.mdx", unavailable),
    ).toEqual([]);
  });

  it("recognizes active bundled-runtime, scoring, calendar-write, and compliance grammar", () => {
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Customermates integrates n8n directly.",
      )[0],
    ).toContain("bundled-n8n-runtime");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "n8n runs on your infrastructure.",
      )[0],
    ).toContain("bundled-n8n-runtime");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "AI agents score leads.",
      )[0],
    ).toContain("lead-scoring-or-enrichment");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Calendar events are created from contact records.",
      )[0],
    ).toContain("calendar-write-or-booking");
    expect(
      findViolationsInSource(
        "content/features/de/example.mdx",
        "Kalendertermine erscheinen in einer schreibgeschützten CRM-Ansicht.",
      ),
    ).toEqual([]);
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "Full GDPR compliance.",
      )[0],
    ).toContain("unsupported-compliance-claim");
    expect(
      findViolationsInSource(
        "content/features/de/example.mdx",
        "DSGVO-Konformität.",
      )[0],
    ).toContain("unsupported-compliance-claim");
    expect(
      findViolationsInSource(
        "content/features/en/example.mdx",
        "EU/GDPR hosting.",
      )[0],
    ).toContain("unsupported-compliance-claim");
  });

  it("combines compare frontmatter names with source values", () => {
    const source = [
      "---",
      "features:",
      "  - name: Email sequences",
      "    source: true",
      "    competitor: false",
      "---",
    ].join("\n");
    expect(
      findViolationsInSource("content/compare-pages/en/example.mdx", source),
    ).toHaveLength(1);
  });

  it("scans JSON values rather than key names", () => {
    const source = JSON.stringify({
      offlineAccess: "Use it from a browser",
      banner: "Native iOS app included",
    });
    const violations = findViolationsInSource("i18n/locales/en.json", source);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("#/banner");
  });

  it("finds no retired claim in public marketing copy", () => {
    const violations = scannedFiles().flatMap((path) => {
      const file = normalized(relative(REPO_ROOT, path));
      return findViolationsInSource(file, readFileSync(path, "utf8"));
    });
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
