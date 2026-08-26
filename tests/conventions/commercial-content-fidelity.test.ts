import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  contentLocaleFromPath,
  resolveCommercialTokens,
  unresolvedCommercialTokens,
} from "@/core/commercial/commercial-tokens";

import { REPO_ROOT, walkFiles } from "./walk";

// A "### question" heading and a "<FaqItem question=...>" opening are the same section
// boundary. The FAQ accordion replaced the former with the latter, and a scanner that only
// resets on markdown headings silently carries state across every answer on the page.
const SECTION_BOUNDARY = /^#{1,6}\s|^<FaqItem\b/u;

const CONTENT_ROOT = join(REPO_ROOT, "content");
const CONTENT_FILES = walkFiles(CONTENT_ROOT, (path) => path.endsWith(".mdx"));
const README_PATH = join(REPO_ROOT, "README.md");
const TOKENISH = /\[\[commercial\./;
const TOKEN_TRAILING_LETTERS = /\]\][\p{L}]/u;
const TOKEN_ADJACENT_CURRENCY =
  /(?:(?:\\u20ac|€|EUR|\$)\s*)\[\[commercial\.price\.[^\]]+\]\]|\[\[commercial\.price\.[^\]]+\]\]\s*(?:\\u20ac|€|EUR|\$)/i;
const TOKEN_LEADING_FRONTMATTER = /^\s*[\w-]+:\s*\[\[commercial\./;
const FIRST_PARTY_SOURCE = /^\s*source:/;
const FIRST_PARTY_HINT = /^\s*hint:/;
const PRICE_LITERAL =
  /(?:EUR\s*)?(?:€\s*)?(?:12|29|69)(?:\s*€)?(?:\s*\/|\s+per\b|\s+pro\b)/i;
const PRICE_VALUE =
  /\[\[commercial\.price\.[^\]]+\]\]|(?:\\u20ac|€|EUR|\$)\s*[1-9]\d*(?:[.,]\d+)?|[1-9]\d*(?:[.,]\d+)?\s*(?:€|EUR|\$)/i;
const ANNUAL_CADENCE =
  /\b(?:annual(?:ly| billing| plan)?|yearly|jährlich\w*|jahres(?:plan|abrechnung))\b/i;
const FIRST_PARTY_TOTAL_LABEL =
  /\b(?:annual total|3-year total|jahressumme|3-jahres-summe)\b/i;
const FIRST_PARTY_DERIVED_TABLE_LABEL =
  /\b(?:year 1 total|annual total|3-year total|year 1 ROI|gesamt jahr 1|jahressumme|3-jahres-summe|ROI jahr 1|savings?|Ersparnis(?:se)?)\b/i;
const HANDWRITTEN_CURRENCY_AMOUNT =
  /(?:\\u20ac|€|EUR|Euro|\$)\s*\d|\d[\d.,]*\s*(?:€|EUR|Euro|\$)/i;
const FIRST_PARTY_DOLLAR_FX = /\bCustomermates\b[^.\n]{0,80}(?:~\s*)?\$\s*\d/i;
const RETIRED_ANNUAL_OFFER =
  /(?:€\s?(?:10|24|57)|(?:10|24|57)\s?€|(?:10|24|57)\s+(?:euro|eur)).{0,45}(?:yearly|annual(?: billing| plan)?|jährlich|jahresplan)|(?:yearly|annual(?: billing| plan)?|jährlich|jahresplan).{0,45}(?:€\s?(?:10|24|57)|(?:10|24|57)\s?€|(?:10|24|57)\s+(?:euro|eur))/i;
const TOKEN_ARITHMETIC =
  /\[\[commercial\.price\.(?:starter|pro|business)\.monthly\]\].{0,40}(?:x|×|\*)\s*\d+.{0,25}=\s*(?:€|EUR)?\s*\d/i;
const TOKEN_PAREN_TOTAL =
  /\[\[commercial\.price\.(?:starter|pro|business)\.monthly\]\].{0,30}\([^)]{0,80}(?:team|users?|nutzer)[^)]{0,80}(?:€\s*\d|EUR\s*\d|\d[\d.,]*\s*(?:€|EUR|Euro))/i;
const UNVERIFIED_MANAGED_WHITE_LABEL_RATE =
  /(?:€\s*149[^\n]{0,100}€\s*5|€\s*5[^\n]{0,100}€\s*149|€\s*399[^\n]{0,50}(?:agency|agentur)|(?:agency|agentur)[^\n]{0,50}€\s*399)/i;
const DERIVED_OUTPUT_WITH_EXACT_VALUE =
  /\b(?:saves?|savings?|saved|ROI|payback|Ersparnis(?:se)?|spart|gespart|Amortisation)\b[^\n]{0,100}(?:(?:\\u20ac|€|EUR|Euro|\$)\s*\d|\d[\d.,]*\s*(?:€|EUR|Euro|\$|%|x|×|times?|mal|fach(?:e[nsr]?)?))/i;
const TOKEN_TAIL_FX_ESTIMATE =
  /^[^\n]{0,80}\(\s*[^)]{0,40}\b(?:about|around|approximately|approx\.?|ca\.?)\s*\$\s*\d/i;
const FIRST_PARTY_EXACT_SAVING =
  /(?:\bCustomermates\b[^\n]{0,160}\b(?:saves?|saved|spart|gespart)\b|\b(?:saves?|savings?|saved|Ersparnis(?:se)?|spart|gespart)\b[^\n]{0,160}\bCustomermates\b)[^\n]{0,100}(?:\\u20ac|€|EUR|Euro|\$)\s*\d/i;
const MIXED_STACK =
  /(?:\bCustomermates\b|\[\[commercial\.price\.)[^\n]{0,220}(?:\b(?:plus|with|and|combined with|mit|und|kombiniert mit)\b|\+)[^\n]{0,160}\b(?:Claude|ChatGPT|AI|KI|n8n|Lexware)\b/i;
const EXACT_ALL_IN_OUTPUT =
  /(?:(?:all-in|total(?: realistic)? budget|under|below|less than|Gesamtbudget|Gesamtbetrag|unter|weniger als)[^\n]{0,80}(?:\\u20ac|€|EUR|Euro|\$)\s*\d|\b(?:costs?|runs?|kostet|laufen)\b[^\n]{0,80}(?:\\u20ac|€|EUR|Euro|\$)\s*\d[^\n]{0,40}(?:all-in|total|gesamt))/i;
const CONNECTED_ACCOUNT_LITERAL =
  /\b(?:two extra connected accounts|unlimited accounts|more than one connected account|zwei zusätzliche verbundene Konten|unbegrenzte Konten|mehr als ein verbundenes Konto)\b/i;
const HISTORICAL_CONTEXT =
  /\b(?:in|during|from|through|as of|im|während|von|bis|stand)\s+(?:20\d{2}|Q[1-4]\s+20\d{2})\b|\b(?:historically|previously|formerly|damals|historisch|früher)\b/i;

function lines(path: string): string[] {
  return readFileSync(path, "utf8").split("\n");
}

function tableCells(line: string): string[] {
  return line
    .replace(/^\s*\|/u, "")
    .replace(/\|\s*$/u, "")
    .split(/(?<!\\)\|/u)
    .map((cell) => cell.trim());
}

function tableContextIsHistorical(
  sourceLines: string[],
  headerIndex: number,
): boolean {
  for (let index = headerIndex - 1; index >= 0; index -= 1) {
    const context = sourceLines[index].trim();
    if (!context) continue;
    if (!HISTORICAL_CONTEXT.test(context)) return false;
    return SECTION_BOUNDARY.test(context) || /\bCustomermates\b/i.test(context);
  }
  return false;
}

function firstPartyTableAnnualOffersFromLines(
  sourceLines: string[],
  file: string,
): string[] {
  const violations: string[] = [];

  for (let index = 0; index < sourceLines.length - 1; index += 1) {
    if (
      !/^\s*\|/u.test(sourceLines[index]) ||
      !/^\s*\|?\s*:?-{3,}/u.test(sourceLines[index + 1])
    )
      continue;
    const tableIsHistorical = tableContextIsHistorical(sourceLines, index);
    const headers = tableCells(sourceLines[index]);
    const productIndex = headers.findIndex((header) =>
      /\bCustomermates\b/i.test(header),
    );
    if (productIndex < 0) continue;

    index += 1;
    while (
      index + 1 < sourceLines.length &&
      /^\s*\|/u.test(sourceLines[index + 1])
    ) {
      index += 1;
      const cells = tableCells(sourceLines[index]);
      const label = cells[0] ?? "";
      const productValue = cells[productIndex] ?? "";
      if (
        !tableIsHistorical &&
        !HISTORICAL_CONTEXT.test(`${label} ${productValue}`) &&
        PRICE_VALUE.test(productValue) &&
        ANNUAL_CADENCE.test(`${label} ${productValue}`)
      ) {
        violations.push(
          `${file}:${index + 1} ${label} — Customermates: ${productValue}`,
        );
      }
    }
  }

  return violations;
}

function firstPartyTableAnnualOffers(path: string): string[] {
  const sourceLines = lines(path);
  return firstPartyTableAnnualOffersFromLines(
    sourceLines,
    relative(REPO_ROOT, path),
  );
}

function isCurrentFirstPartyEntitlementClaim(line: string): boolean {
  if (HISTORICAL_CONTEXT.test(line)) return false;
  if (/\bCustomermates\b|\[\[commercial\.entitlement\./i.test(line))
    return true;

  const normalized = line
    .replace(/^\s*(?:[-*]|\|)\s*/u, "")
    .replace(/^\*{1,2}/u, "");
  return /^(?:(?:our|the|on|with|in|der|die|das|im|mit|beim|unser(?:e[rmns]?)?)\s+)?(?:Pro|Business|Enterprise)(?:[-\s](?:plan|tier|tarif|stufe))?\b/i.test(
    normalized,
  );
}

function firstPartyTableDerivedOutputs(path: string): string[] {
  const sourceLines = lines(path);
  const violations: string[] = [];

  for (let index = 0; index < sourceLines.length - 1; index += 1) {
    if (
      !/^\s*\|/u.test(sourceLines[index]) ||
      !/^\s*\|?\s*:?-{3,}/u.test(sourceLines[index + 1])
    )
      continue;
    const headers = tableCells(sourceLines[index]);
    const productIndex = headers.findIndex((header) =>
      /\bCustomermates\b/i.test(header),
    );
    if (productIndex < 0) continue;

    const rows: Array<{ line: number; label: string; productValue: string }> =
      [];
    index += 1;
    while (
      index + 1 < sourceLines.length &&
      /^\s*\|/u.test(sourceLines[index + 1])
    ) {
      index += 1;
      const cells = tableCells(sourceLines[index]);
      rows.push({
        line: index + 1,
        label: cells[0] ?? "",
        productValue: cells[productIndex] ?? "",
      });
    }

    if (!rows.some(({ productValue }) => TOKENISH.test(productValue))) continue;
    rows.forEach(({ line, label, productValue }) => {
      if (
        FIRST_PARTY_DERIVED_TABLE_LABEL.test(label) &&
        (HANDWRITTEN_CURRENCY_AMOUNT.test(productValue) ||
          /\d[\d.,]*\s*(?:%|x|×)/i.test(productValue)) &&
        !TOKENISH.test(productValue)
      ) {
        violations.push(
          `${relative(REPO_ROOT, path)}:${line} ${label} — Customermates: ${productValue}`,
        );
      }
    });
  }

  return violations;
}

describe("commercial content follows the product catalog", () => {
  it("resolves every commercial token in its content locale", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const text = readFileSync(path, "utf8");
      if (!TOKENISH.test(text)) continue;
      try {
        const resolved = resolveCommercialTokens(
          text,
          contentLocaleFromPath(path),
        );
        if (unresolvedCommercialTokens(resolved).length > 0)
          violations.push(`${relative(REPO_ROOT, path)} unresolved`);
      } catch (error) {
        violations.push(
          `${relative(REPO_ROOT, path)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps token boundaries free of migrated word fragments", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const file = relative(REPO_ROOT, path);
      lines(path).forEach((line, index) => {
        if (TOKEN_TRAILING_LETTERS.test(line))
          violations.push(
            `${file}:${index + 1} token must not be followed directly by a letter`,
          );
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not add a second currency marker beside a commercial price token", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const file = relative(REPO_ROOT, path);
      lines(path).forEach((line, index) => {
        if (TOKEN_ADJACENT_CURRENCY.test(line))
          violations.push(
            `${file}:${index + 1} currency is already supplied by the commercial token`,
          );
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("quotes token-leading frontmatter values and derives first-party compare/CTA facts", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const file = relative(REPO_ROOT, path);
      lines(path).forEach((line, index) => {
        if (TOKEN_LEADING_FRONTMATTER.test(line))
          violations.push(
            `${file}:${index + 1} token-leading YAML must be quoted`,
          );
        if (
          file.includes("content/compare-pages/") &&
          FIRST_PARTY_SOURCE.test(line) &&
          PRICE_LITERAL.test(line) &&
          !TOKENISH.test(line)
        ) {
          violations.push(
            `${file}:${index + 1} first-party compare source must use a commercial token`,
          );
        }
        if (
          /content\/(?:compare-pages|feature-pages|for-pages)\/(?:en|de)\//.test(
            file,
          ) &&
          FIRST_PARTY_HINT.test(line) &&
          /(?:trial|free|test|kostenlos)/i.test(line) &&
          !line.includes("[[commercial.trial.days]]")
        ) {
          violations.push(
            `${file}:${index + 1} CTA trial duration must use the catalog token`,
          );
        }
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("publishes no retired Customermates annual self-serve offer", () => {
    const violations: string[] = [];

    for (const path of [...CONTENT_FILES, README_PATH]) {
      const file = relative(REPO_ROOT, path);
      lines(path).forEach((line, index) => {
        const aboutCustomermates =
          path === README_PATH || /customermates|\[\[commercial\./i.test(line);
        if (
          aboutCustomermates &&
          !HISTORICAL_CONTEXT.test(line) &&
          RETIRED_ANNUAL_OFFER.test(line)
        ) {
          violations.push(`${file}:${index + 1} ${line.trim()}`);
        }
        if (
          file.includes("content/compare-pages/") &&
          FIRST_PARTY_SOURCE.test(line) &&
          !HISTORICAL_CONTEXT.test(line) &&
          PRICE_VALUE.test(line) &&
          ANNUAL_CADENCE.test(line)
        ) {
          violations.push(
            `${file}:${index + 1} first-party source advertises an annual self-serve offer`,
          );
        }
      });
      if (file.includes("content/compare-pages/"))
        violations.push(...firstPartyTableAnnualOffers(path));
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("publishes no unverified managed white-label rate", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES.filter((path) =>
      path.endsWith("/white-label-crm.mdx"),
    )) {
      const file = relative(REPO_ROOT, path);
      lines(path).forEach((line, index) => {
        if (UNVERIFIED_MANAGED_WHITE_LABEL_RATE.test(line))
          violations.push(`${file}:${index + 1} ${line.trim()}`);
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps current first-party seat arithmetic catalog-derived", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const file = relative(REPO_ROOT, path);
      lines(path).forEach((line, index) => {
        if (TOKEN_ARITHMETIC.test(line))
          violations.push(
            `${file}:${index + 1} token arithmetic must use a seats/months token`,
          );
        if (TOKEN_PAREN_TOTAL.test(line) && !line.includes(".seats."))
          violations.push(
            `${file}:${index + 1} token-adjacent seat total must use a seats token`,
          );
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("does not pair catalog pricing with handwritten first-party totals or FX estimates", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const file = relative(REPO_ROOT, path);
      const sourceLines = lines(path);
      let inCatalogScenario = false;

      sourceLines.forEach((line, index) => {
        if (SECTION_BOUNDARY.test(line)) {
          inCatalogScenario =
            /\bCustomermates\b/i.test(line) && TOKENISH.test(line);
        }
        if (
          path.endsWith("/crm-cost.mdx") &&
          inCatalogScenario &&
          FIRST_PARTY_TOTAL_LABEL.test(line) &&
          HANDWRITTEN_CURRENCY_AMOUNT.test(line)
        ) {
          violations.push(
            `${file}:${index + 1} catalog scenario total must stay token-derived or be omitted`,
          );
        }
        if (
          path.endsWith("/crm-software.mdx") &&
          FIRST_PARTY_DOLLAR_FX.test(line)
        ) {
          violations.push(
            `${file}:${index + 1} Customermates price must use the EUR catalog token, not an FX estimate`,
          );
        }
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("keeps first-party derived outputs and mixed-stack ceilings independent of mutable prices", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const file = relative(REPO_ROOT, path);
      let catalogScenario = false;
      lines(path).forEach((line, index) => {
        if (SECTION_BOUNDARY.test(line)) catalogScenario = false;
        const followsCatalogInput = catalogScenario;
        const lastTokenEnd = line.lastIndexOf("]]");
        const tokenTail = lastTokenEnd >= 0 ? line.slice(lastTokenEnd + 2) : "";
        const tokenTailHasDerivedNumber =
          DERIVED_OUTPUT_WITH_EXACT_VALUE.test(tokenTail);
        const firstPartyStart = line.search(
          /\bCustomermates\b|\[\[commercial\.price\./i,
        );
        const firstPartyText =
          firstPartyStart >= 0 ? line.slice(firstPartyStart) : "";

        if (
          FIRST_PARTY_EXACT_SAVING.test(line) ||
          tokenTailHasDerivedNumber ||
          TOKEN_TAIL_FX_ESTIMATE.test(tokenTail)
        ) {
          violations.push(
            `${file}:${index + 1} derived first-party output must use current inputs or a formula`,
          );
        }
        if (
          MIXED_STACK.test(firstPartyText) &&
          EXACT_ALL_IN_OUTPUT.test(firstPartyText)
        ) {
          violations.push(
            `${file}:${index + 1} mixed-stack total must not publish a fixed all-in output`,
          );
        }
        if (
          /\/crm-(?:for-small-business|roi)\.mdx$/u.test(path) &&
          followsCatalogInput &&
          DERIVED_OUTPUT_WITH_EXACT_VALUE.test(line) &&
          !/\b(?:formula|Formel)\b/u.test(line)
        ) {
          violations.push(
            `${file}:${index + 1} catalog scenario must not publish a fixed ROI or payback output`,
          );
        }
        if (/\[\[commercial\.price\./u.test(line)) catalogScenario = true;
      });
      violations.push(...firstPartyTableDerivedOutputs(path));
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("recognizes representative mutable-output regressions", () => {
    expect(
      RETIRED_ANNUAL_OFFER.test(
        "Cloud pricing from €12/user/month (or €10/user/month billed yearly)",
      ),
    ).toBe(true);
    expect(
      FIRST_PARTY_EXACT_SAVING.test(
        "Customermates saves this team over €2,700 per year.",
      ),
    ).toBe(true);
    expect(
      DERIVED_OUTPUT_WITH_EXACT_VALUE.test("The ROI is approximately 5,880%."),
    ).toBe(true);
    expect(
      MIXED_STACK.test(
        "Customermates plus Claude costs $1,500 per year all-in.",
      ) &&
        EXACT_ALL_IN_OUTPUT.test(
          "Customermates plus Claude costs $1,500 per year all-in.",
        ),
    ).toBe(true);
    expect(
      CONNECTED_ACCOUNT_LITERAL.test("Enterprise includes unlimited accounts."),
    ).toBe(true);
    expect(
      HISTORICAL_CONTEXT.test("In 2025, Customermates offered €10 yearly."),
    ).toBe(true);
    expect(
      isCurrentFirstPartyEntitlementClaim(
        "Rival Enterprise includes unlimited accounts.",
      ),
    ).toBe(false);
    expect(
      isCurrentFirstPartyEntitlementClaim(
        "In 2025, Customermates Enterprise included unlimited accounts.",
      ),
    ).toBe(false);
    expect(
      isCurrentFirstPartyEntitlementClaim(
        "Enterprise includes unlimited accounts.",
      ),
    ).toBe(true);
    expect(
      isCurrentFirstPartyEntitlementClaim(
        "Our Enterprise plan includes unlimited accounts.",
      ),
    ).toBe(true);
    expect(
      isCurrentFirstPartyEntitlementClaim(
        "Im Enterprise-Tarif sind unbegrenzte Konten enthalten.",
      ),
    ).toBe(true);
    expect(
      firstPartyTableAnnualOffersFromLines(
        [
          "## Customermates pricing in 2025",
          "| Plan | Customermates |",
          "| --- | --- |",
          "| Annual | €10 yearly |",
        ],
        "fixture.mdx",
      ),
    ).toEqual([]);
    expect(
      firstPartyTableAnnualOffersFromLines(
        [
          "## Customermates pricing",
          "| Plan | Customermates |",
          "| --- | --- |",
          "| Annual | €10 yearly |",
        ],
        "fixture.mdx",
      ),
    ).toHaveLength(1);
    expect(
      firstPartyTableAnnualOffersFromLines(
        [
          "## Pricing",
          "In 2025, Rival sold an annual plan.",
          "### Current Customermates pricing",
          "| Plan | Customermates |",
          "| --- | --- |",
          "| Annual | €10 yearly |",
        ],
        "fixture.mdx",
      ),
    ).toHaveLength(1);
  });

  it("derives connected-account allowances from entitlement tokens", () => {
    const violations: string[] = [];

    for (const path of CONTENT_FILES) {
      const file = relative(REPO_ROOT, path);
      lines(path).forEach((line, index) => {
        if (
          CONNECTED_ACCOUNT_LITERAL.test(line) &&
          isCurrentFirstPartyEntitlementClaim(line) &&
          !line.includes("[[commercial.entitlement.")
        ) {
          violations.push(
            `${file}:${index + 1} connected-account allowance must use an entitlement token`,
          );
        }
      });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
