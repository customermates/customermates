import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { APP_LOCALES, CONTENT_LOCALES, DEFAULT_LOCALE, ROUTING_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const PRODUCT_NAMES = [
  "ChatGPT",
  "Claude",
  "Claude Code",
  "Claude Desktop",
  "Codex",
  "Cursor",
  "Customermates",
  "Gemini",
  "Gmail",
  "IMAP",
  "Instagram",
  "LinkedIn",
  "MCP",
  "Next.js",
  "OAuth",
  "Outlook",
  "Sentry",
  "Telegram",
  "WhatsApp",
];

const ALLOWED_LOCALIZED_NUMBERS = new Set(["fr:ContactPage.description"]);

const PROTECTED_SOURCE_TERMS = ["open core"];

const REQUIRED_TRANSLATION_FRAGMENTS: Record<string, Record<string, readonly string[]>> = {
  de: {
    "HomepagePricing.cloud.tag": ["datenbank-region eu"],
    "LegalDocumentNotice.contractObjection": ["vor ablauf"],
    "LegalDocumentNotice.subprocessorObjectionWithDeadline": ["bis zum"],
    "LegalUpdateAlert.adminDescription": ["bis zum"],
    "LegalUpdateAlert.memberDescription": ["bis zum"],
    "LegalUpdateView.subtitle": ["bis zum"],
  },
  fr: {
    "HomepagePricing.cloud.tag": ["région ue"],
    "LegalDocumentNotice.contractObjection": ["avant la date limite"],
    "LegalDocumentNotice.subprocessorObjectionWithDeadline": ["au plus tard"],
    "LegalUpdateAlert.adminDescription": ["au plus tard"],
    "LegalUpdateAlert.memberDescription": ["au plus tard"],
    "LegalUpdateView.subtitle": ["au plus tard"],
  },
  it: {
    "HomepagePricing.cloud.tag": ["regione ue"],
    "LegalDocumentNotice.contractObjection": ["prima del termine"],
    "LegalDocumentNotice.subprocessorObjectionWithDeadline": ["entro il"],
    "LegalUpdateAlert.adminDescription": ["entro il"],
    "LegalUpdateAlert.memberDescription": ["entro il"],
    "LegalUpdateView.subtitle": ["entro il"],
  },
  es: {
    "HomepagePricing.cloud.tag": ["región ue"],
    "LegalDocumentNotice.contractObjection": ["antes de la fecha límite"],
    "LegalDocumentNotice.subprocessorObjectionWithDeadline": ["a más tardar"],
    "LegalUpdateAlert.adminDescription": ["a más tardar"],
    "LegalUpdateAlert.memberDescription": ["a más tardar"],
    "LegalUpdateView.subtitle": ["a más tardar"],
  },
};

const ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS = new Set([
  "de:ConnectedAccountsCard.channels.linkedinClassic",
  "de:ConnectedAccountsCard.channels.linkedinRecruiter",
  "de:ConnectedAccountsCard.channels.linkedinSalesNavigator",
  "de:ContactPage.highlights.direct.title",
  "de:Common.inputs.defaultOption",
  "de:DocsSidebar.openapi",
  "de:DocsSidebar.selfHosting",
  "de:OnboardingWizard.ai.choices.claudeDesktop",
  "de:RoleModal.resources.api",
  "de:Subscription.planStatusLabel",
  "fr:AgplGithubBadge.label",
  "fr:Common.inputs.defaultOption",
  "fr:Common.filters.fields.participants",
  "fr:Common.filters.fields.timelineThreadId",
  "fr:ConnectedAccountsCard.channels.linkedinClassic",
  "fr:Dashboard.tabs.config",
  "fr:DocsSidebar.introduction",
  "fr:DocsSidebar.openapi",
  "fr:NavigationBar.docs",
  "fr:OnboardingWizard.ai.choices.claudeDesktop",
  "fr:Subscription.planStatusLabel",
  "fr:UserAvatar.documentation",
  "it:AgplGithubBadge.label",
  "it:ConnectedAccountsCard.channels.linkedinClassic",
  "it:DocsSidebar.openapi",
  "it:OnboardingWizard.ai.choices.claudeDesktop",
  "it:Subscription.planStatusLabel",
  "es:ConnectedAccountsCard.channels.linkedinClassic",
  "es:DocsSidebar.openapi",
  "es:OnboardingWizard.ai.choices.claudeDesktop",
  "es:Subscription.planStatusLabel",
]);

type IcuElement = {
  type: number;
  value?: string;
  options?: Record<string, { value: IcuElement[] }>;
  children?: IcuElement[];
  pluralType?: string;
  offset?: number;
};

const localeLeavesCache = new Map<string, Map<string, string>>();

function listBundleLocales(): string[] {
  return readdirSync(join(REPO_ROOT, "i18n", "locales"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

function contentCollections(): string[] {
  return readdirSync(join(REPO_ROOT, "content"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function loadLocaleLeaves(locale: string): Map<string, string> {
  const cached = localeLeavesCache.get(locale);
  if (cached) return cached;

  const raw = readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8");
  const leaves = new Map<string, string>();
  collectLeaves(JSON.parse(raw), "", leaves);
  localeLeavesCache.set(locale, leaves);
  return leaves;
}

function collectLeaves(value: unknown, prefix: string, into: Map<string, string>): void {
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectLeaves(child, prefix ? `${prefix}.${key}` : key, into);
    return;
  }

  into.set(prefix, String(value));
}

function listContentFiles(root: string): string[] {
  return walkFiles(root, (path) => !basename(path).startsWith("."))
    .map((path) => relative(root, path))
    .sort();
}

function numericTokens(value: string): string[] {
  return [...value.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(",", ".")).sort();
}

function colonDelimitedTokens(value: string): string[] {
  return [...value.matchAll(/\b[a-z][\w-]*:[\w.-]+\b/g)].map((match) => match[0]).sort();
}

function icuStructure(value: string, locale: string): string {
  const elements = new IntlMessageFormat(value, locale).getAst() as IcuElement[];

  const visit = (nodes: IcuElement[]): string =>
    nodes
      .flatMap((node): string[] => {
        if (node.type === 0) return [];
        if (node.options) {
          const options = Object.entries(node.options)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, option]) => `${key}{${visit(option.value)}}`)
            .join("|");
          return [
            `choice(${node.value}:${node.type}:${node.pluralType ?? "select"}:offset=${node.offset ?? 0})[${options}]`,
          ];
        }
        if (node.type === 7) return ["pound"];
        if (node.children) return [`tag(${node.value ?? ""})[${visit(node.children)}]`];
        if (node.type >= 1 && node.type <= 4) return [`argument(${node.value}:${node.type})`];
        return [`type(${node.type}:${node.value ?? ""})`];
      })
      .sort((left, right) => left.localeCompare(right))
      .join("|");

  return visit(elements);
}

describe("i18n parity", () => {
  const referenceLeaves = loadLocaleLeaves(DEFAULT_LOCALE);
  const otherRoutingLocales = ROUTING_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
  const otherAppLocales = APP_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
  const reviewedSourceIdenticalLocales = new Set<string>(otherAppLocales);

  it("allows translators to reorder ICU arguments and sibling rich-text tags", () => {
    expect(icuStructure("{first} {last}", "en")).toBe(icuStructure("{last}, {first}", "en"));
    expect(icuStructure("<strong>{first}</strong> {last}", "en")).toBe(
      icuStructure("{last}, <strong>{first}</strong>", "en"),
    );
  });

  it("still detects divergent ICU branches and rich-text nesting", () => {
    expect(icuStructure("{count, plural, one {One} other {#}}", "en")).not.toBe(
      icuStructure("{count, plural, other {#}}", "en"),
    );
    expect(icuStructure("<strong>{name}</strong>", "en")).not.toBe(icuStructure("{name}<strong></strong>", "en"));
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has every default-locale leaf key in every routing locale", () => {
    const problems: string[] = [];
    for (const locale of otherRoutingLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const key of referenceLeaves.keys()) if (!leaves.has(key)) problems.push(`${locale}.json is missing ${key}`);
    }
    expect(problems, `leaf keys missing from a routing locale:\n${problems.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has no leaf key outside the default locale catalog", () => {
    const problems: string[] = [];
    for (const locale of otherRoutingLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const key of leaves.keys())
        if (!referenceLeaves.has(key)) problems.push(`${DEFAULT_LOCALE}.json is missing ${key} (present in ${locale})`);
    }
    expect(problems, `leaf keys missing from the default locale:\n${problems.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("ships exactly one bundle per routing locale", () => {
    const onDisk = listBundleLocales();
    const registered: string[] = [...ROUTING_LOCALES].sort();

    const unregistered = onDisk.filter((locale) => !registered.includes(locale));
    const missing = registered.filter((locale) => !onDisk.includes(locale));

    expect(
      { unregistered, missing },
      `i18n/locales/*.json must correspond one-to-one with ROUTING_LOCALES.\n` +
        `on disk but not registered: ${unregistered.join(", ") || "none"}\n` +
        `registered but no bundle: ${missing.join(", ") || "none"}`,
    ).toEqual({ unregistered: [], missing: [] });
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("gives every locale the same number of keys", () => {
    const counts = Object.fromEntries(
      listBundleLocales().map((locale) => [locale, loadLocaleLeaves(locale).size] as const),
    );
    const expected = Object.fromEntries(Object.keys(counts).map((locale) => [locale, referenceLeaves.size] as const));

    expect(counts, `every bundle must hold exactly ${referenceLeaves.size} keys, the ${DEFAULT_LOCALE} count`).toEqual(
      expected,
    );
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "compiles every message and keeps ICU argument types and branches aligned",
    () => {
      const mismatches: string[] = [];
      for (const [key, referenceValue] of referenceLeaves) {
        let referenceStructure: string;
        try {
          referenceStructure = icuStructure(referenceValue, DEFAULT_LOCALE);
        } catch (error) {
          mismatches.push(`${DEFAULT_LOCALE}:${key} does not compile: ${String(error)}`);
          continue;
        }

        for (const locale of otherRoutingLocales) {
          const value = loadLocaleLeaves(locale).get(key);
          if (value === undefined) continue;
          try {
            const structure = icuStructure(value, locale);
            if (structure !== referenceStructure)
              mismatches.push(`${key}: ${DEFAULT_LOCALE}=[${referenceStructure}] ${locale}=[${structure}]`);
          } catch (error) {
            mismatches.push(`${locale}:${key} does not compile: ${String(error)}`);
          }
        }
      }
      expect(mismatches, `invalid or structurally divergent ICU messages:\n${mismatches.join("\n")}`).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("preserves product names in translated messages", () => {
    const mismatches: string[] = [];
    for (const locale of otherRoutingLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const [key, referenceValue] of referenceLeaves) {
        const value = leaves.get(key);
        if (value === undefined) continue;
        for (const product of PRODUCT_NAMES) {
          if (referenceValue.includes(product) !== value.includes(product))
            mismatches.push(`${key}: ${DEFAULT_LOCALE} and ${locale} disagree on ${product}`);
        }
      }
    }
    expect(mismatches, `product-name translation drift:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("preserves protected source terminology", () => {
    const mismatches: string[] = [];
    for (const locale of otherRoutingLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const [key, referenceValue] of referenceLeaves) {
        const value = leaves.get(key);
        if (value === undefined) continue;
        for (const term of PROTECTED_SOURCE_TERMS) {
          if (referenceValue.toLocaleLowerCase().includes(term) && !value.toLocaleLowerCase().includes(term))
            mismatches.push(`${locale}:${key} does not preserve ${JSON.stringify(term)}`);
        }
      }
    }
    expect(mismatches, `protected source terminology drift:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("preserves meaningful numbers in translated messages", () => {
    const mismatches: string[] = [];
    for (const locale of otherRoutingLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const [key, referenceValue] of referenceLeaves) {
        const value = leaves.get(key);
        if (value === undefined || ALLOWED_LOCALIZED_NUMBERS.has(`${locale}:${key}`)) continue;
        const referenceNumbers = numericTokens(referenceValue);
        const localeNumbers = numericTokens(value);
        if (referenceNumbers.join(",") !== localeNumbers.join(",")) {
          mismatches.push(
            `${key}: ${DEFAULT_LOCALE}=[${referenceNumbers.join(", ")}] ${locale}=[${localeNumbers.join(", ")}]`,
          );
        }
      }
    }
    expect(mismatches, `numeric translation drift:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("preserves colon-delimited API tokens", () => {
    const mismatches: string[] = [];
    for (const locale of otherRoutingLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const [key, referenceValue] of referenceLeaves) {
        const value = leaves.get(key);
        if (value === undefined) continue;
        const referenceTokens = colonDelimitedTokens(referenceValue);
        const localeTokens = colonDelimitedTokens(value);
        if (referenceTokens.join(",") !== localeTokens.join(",")) {
          mismatches.push(
            `${key}: ${DEFAULT_LOCALE}=[${referenceTokens.join(", ")}] ${locale}=[${localeTokens.join(", ")}]`,
          );
        }
      }
    }
    expect(mismatches, `colon-delimited API token drift:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "requires explicit review for long translations that remain identical to English",
    () => {
      const unreviewed: string[] = [];
      for (const locale of otherAppLocales) {
        const leaves = loadLocaleLeaves(locale);
        for (const [key, referenceValue] of referenceLeaves) {
          if (referenceValue.length < 12 || leaves.get(key) !== referenceValue) continue;
          if (!ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS.has(`${locale}:${key}`)) unreviewed.push(`${locale}:${key}`);
        }
      }
      expect(unreviewed, `source-identical translations without an explicit review:\n${unreviewed.join("\n")}`).toEqual(
        [],
      );

      const stale = [...ALLOWED_SOURCE_IDENTICAL_TRANSLATIONS].filter((entry) => {
        const separator = entry.indexOf(":");
        if (separator <= 0) return true;

        const locale = entry.slice(0, separator);
        const key = entry.slice(separator + 1);
        const referenceValue = referenceLeaves.get(key);
        if (!reviewedSourceIdenticalLocales.has(locale) || referenceValue === undefined || referenceValue.length < 12)
          return true;

        return loadLocaleLeaves(locale).get(key) !== referenceValue;
      });
      expect(stale, `stale source-identical translation reviews:\n${stale.join("\n")}`).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps Spanish API-key terminology consistent", () => {
    const leaves = loadLocaleLeaves("es");
    const mismatches: string[] = [];
    for (const [key, referenceValue] of referenceLeaves) {
      if (!/API[- ]keys?/i.test(referenceValue)) continue;
      const value = leaves.get(key);
      if (!value || !/claves? de API/i.test(value)) mismatches.push(`es:${key} must use clave(s) de API`);
    }
    expect(mismatches, `Spanish API-key terminology drift:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps distinct Spanish deal presets unambiguous", () => {
    const leaves = loadLocaleLeaves("es");
    const deal = {
      plural: leaves.get("EntityTerminology.presets.deal.deal.plural"),
      singular: leaves.get("EntityTerminology.presets.deal.deal.singular"),
    };
    const opportunity = {
      plural: leaves.get("EntityTerminology.presets.deal.opportunity.plural"),
      singular: leaves.get("EntityTerminology.presets.deal.opportunity.singular"),
    };

    expect(deal).toEqual({
      plural: "Oportunidades",
      singular: "Oportunidad",
    });
    expect(opportunity).toEqual({
      plural: "Oportunidades comerciales",
      singular: "Oportunidad comercial",
    });
    expect(deal).not.toEqual(opportunity);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("preserves reviewed semantic translation fragments", () => {
    const mismatches: string[] = [];
    for (const [locale, expectations] of Object.entries(REQUIRED_TRANSLATION_FRAGMENTS)) {
      const leaves = loadLocaleLeaves(locale);
      for (const [key, fragments] of Object.entries(expectations)) {
        const value = leaves.get(key)?.toLocaleLowerCase();
        for (const fragment of fragments) {
          if (!value?.includes(fragment)) mismatches.push(`${locale}:${key} must include ${JSON.stringify(fragment)}`);
        }
      }
    }
    expect(mismatches, `reviewed semantic translation drift:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("mirrors every content collection across content locales", () => {
    const problems: string[] = [];
    const collections = contentCollections();

    expect(collections.length, "expected content collections on disk").toBeGreaterThan(0);

    for (const collection of collections) {
      const referenceDir = join(REPO_ROOT, "content", collection, DEFAULT_LOCALE);
      if (!existsSync(referenceDir)) {
        problems.push(`content/${collection} is missing the default-locale directory ${DEFAULT_LOCALE}/`);
        continue;
      }
      const referenceFiles = new Set(listContentFiles(referenceDir));

      for (const locale of CONTENT_LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        const localeDir = join(REPO_ROOT, "content", collection, locale);
        const localeFiles = new Set(existsSync(localeDir) ? listContentFiles(localeDir) : []);

        for (const file of referenceFiles)
          if (!localeFiles.has(file)) problems.push(`content/${collection}/${locale} is missing ${file}`);

        for (const file of localeFiles) {
          if (!referenceFiles.has(file))
            problems.push(`content/${collection}/${DEFAULT_LOCALE} is missing ${file} (present in ${locale})`);
        }
      }
    }

    expect(problems, `content tree locale mismatches:\n${problems.join("\n")}`).toEqual([]);
  });
});
