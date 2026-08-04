import { readFileSync } from "node:fs";
import { join } from "node:path";

import { icuArgumentNames, richTextTagNames } from "./lib/icu";

import { APP_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

type Leaves = Map<string, string>;

const REPO_ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

const SHARED_VALUE_PREFIXES = [
  "Common.types.",
  "Common.validations.",
  "Common.providers.",
  "Common.filters.operators.",
  "Common.seedData.contact.",
  "Common.seedData.organization.",
  "Common.benjamin.name",
  "Common.de",
  "Common.en",
  "DocsSidebar.mcp",
  "DocsSidebar.n8n",
  "DocsSidebar.openapi",
  "ConnectedAccountsCard.channels.",
  "OnboardingWizard.ai.choices.",
  "Subscription.planNames.",
  "Subscription.picker.price.",
  "HomepageStatsRow.taglineMcp",
  "AgplGithubBadge.label",
];

const GLOSSARY: Record<string, Record<string, string>> = {
  Deal: { fr: "affaire", it: "trattativ", es: "oportunidad" },
  Deals: { fr: "affaire", it: "trattativ", es: "oportunidad" },
  Organization: { fr: "organisation", it: "organizzazion", es: "organizaci" },
  Organizations: { fr: "organisation", it: "organizzazion", es: "organizaci" },
  Contact: { fr: "contact", it: "contatt", es: "contact" },
  Contacts: { fr: "contact", it: "contatt", es: "contact" },
  Task: { fr: "tâche", it: "attività", es: "tarea" },
  Tasks: { fr: "tâche", it: "attività", es: "tarea" },
  Inbox: { fr: "boîte de réception", it: "posta in arrivo", es: "bandeja de entrada" },
};

const LENGTH_RATIO_LIMIT = 2.6;
const MIN_LENGTH_FOR_RATIO = 12;

function loadLeaves(locale: string): Leaves {
  const raw = readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8");
  const leaves: Leaves = new Map();
  collect(JSON.parse(raw), "", leaves);
  return leaves;
}

function collect(value: unknown, prefix: string, into: Leaves): void {
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collect(child, prefix ? `${prefix}.${key}` : key, into);
    return;
  }
  into.set(prefix, String(value));
}

function isSharedValue(key: string): boolean {
  return SHARED_VALUE_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

function containsWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\d])${escaped}(?![\\p{L}\\d])`, "iu").test(haystack);
}

function containsStem(haystack: string, stem: string): boolean {
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\d])${escaped}`, "iu").test(haystack);
}

const cache = new Map<string, Leaves>();
function loadLeavesCached(locale: string): Leaves {
  const hit = cache.get(locale);
  if (hit) return hit;
  const leaves = loadLeaves(locale);
  cache.set(locale, leaves);
  return leaves;
}

const reference = loadLeaves(DEFAULT_LOCALE);
const others = APP_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

const blocking: string[] = [];
const advisory: string[] = [];

console.log(`reference locale: ${DEFAULT_LOCALE} (${reference.size} keys)\n`);

for (const locale of others) {
  const leaves = loadLeaves(locale);
  const report: string[] = [];

  const missing = [...reference.keys()].filter((key) => !leaves.has(key));
  const extra = [...leaves.keys()].filter((key) => !reference.has(key));
  if (leaves.size !== reference.size || missing.length || extra.length) {
    blocking.push(
      `${locale}: ${leaves.size} keys against ${reference.size}; ${missing.length} missing, ${extra.length} unknown` +
        (missing.length ? `\n    missing: ${missing.slice(0, 10).join(", ")}` : "") +
        (extra.length ? `\n    unknown: ${extra.slice(0, 10).join(", ")}` : ""),
    );
  }

  const icu: string[] = [];
  const tags: string[] = [];
  for (const [key, source] of reference) {
    const value = leaves.get(key);
    if (value === undefined) continue;
    if (icuArgumentNames(source) !== icuArgumentNames(value)) icu.push(key);
    if (richTextTagNames(source) !== richTextTagNames(value)) tags.push(key);
  }
  if (icu.length) blocking.push(`${locale}: ICU arguments differ on ${icu.length} key(s): ${icu.join(", ")}`);
  if (tags.length) blocking.push(`${locale}: rich-text tags differ on ${tags.length} key(s): ${tags.join(", ")}`);

  const bySource = new Map<string, Map<string, string[]>>();
  for (const [key, source] of reference) {
    const value = leaves.get(key);
    if (value === undefined || isSharedValue(key) || source.length < 4) continue;
    const targets = bySource.get(source) ?? new Map<string, string[]>();
    targets.set(value, [...(targets.get(value) ?? []), key]);
    bySource.set(source, targets);
  }
  const divergent = [...bySource.entries()].filter(([, targets]) => targets.size > 1);
  if (divergent.length) {
    report.push(`  inconsistent: ${divergent.length} English source(s) with more than one translation`);
    for (const [source, targets] of divergent.slice(0, 8)) {
      const rendered = [...targets.entries()].map(([value, keys]) => `${JSON.stringify(value)} (${keys[0]})`);
      report.push(`    ${JSON.stringify(source)} -> ${rendered.join(" | ")}`);
    }
  }

  const byNamespace = new Map<string, Map<string, string[]>>();
  for (const [key, source] of reference) {
    const value = leaves.get(key);
    if (value === undefined || value === source || isSharedValue(key)) continue;
    const namespace = key.slice(0, key.lastIndexOf("."));
    const collisions = byNamespace.get(namespace) ?? new Map<string, string[]>();
    collisions.set(value, [...(collisions.get(value) ?? []), key]);
    byNamespace.set(namespace, collisions);
  }
  const collided: string[] = [];
  for (const [namespace, collisions] of byNamespace) {
    for (const [value, keys] of collisions) {
      const sources = new Set(keys.map((key) => reference.get(key)));
      if (sources.size > 1) {
        collided.push(`${namespace}: ${JSON.stringify(value)} <- ${[...sources].map((s) => JSON.stringify(s)).join(" + ")}`);
      }
    }
  }
  if (collided.length) {
    report.push(`  collided: ${collided.length} namespace(s) where distinct English strings share one translation`);
    for (const entry of collided.slice(0, 10)) report.push(`    ${entry}`);
  }

  const untranslated = [...reference.entries()].filter(([key, source]) => {
    if (isSharedValue(key) || source.length < 12) return false;
    if (leaves.get(key) !== source) return false;
    return others.some((other) => other !== locale && loadLeavesCached(other).get(key) !== source);
  });
  if (untranslated.length) {
    report.push(`  possibly untranslated: ${untranslated.length} key(s)`);
    for (const [key, source] of untranslated.slice(0, 10)) report.push(`    ${key} = ${JSON.stringify(source)}`);
  }

  const glossaryMisses: string[] = [];
  for (const [term, translations] of Object.entries(GLOSSARY)) {
    const expected = translations[locale];
    if (!expected) continue;
    for (const [key, source] of reference) {
      const value = leaves.get(key);
      if (value === undefined || isSharedValue(key)) continue;
      if (!containsWord(source, term)) continue;
      if (!containsStem(value, expected)) glossaryMisses.push(`${key}: expected "${expected}" for "${term}"`);
    }
  }
  if (glossaryMisses.length) {
    report.push(`  glossary: ${glossaryMisses.length} deviation(s)`);
    for (const miss of glossaryMisses.slice(0, 10)) report.push(`    ${miss}`);
  }

  const long = [...reference.entries()]
    .filter(([key, source]) => {
      const value = leaves.get(key);
      if (value === undefined || source.length < MIN_LENGTH_FOR_RATIO) return false;
      return value.length / source.length > LENGTH_RATIO_LIMIT;
    })
    .map(([key, source]) => `${key}: ${source.length} -> ${leaves.get(key)!.length} chars`);
  if (long.length) {
    report.push(`  long: ${long.length} translation(s) over ${LENGTH_RATIO_LIMIT}x the English length`);
    for (const entry of long.slice(0, 10)) report.push(`    ${entry}`);
  }

  const totalSource = [...reference.values()].join("").length;
  const totalTarget = [...reference.keys()].reduce((sum, key) => sum + (leaves.get(key)?.length ?? 0), 0);
  const expansion = ((totalTarget / totalSource - 1) * 100).toFixed(1);

  console.log(`${locale}: ${leaves.size} keys, ${expansion}% longer than ${DEFAULT_LOCALE} overall`);
  if (report.length === 0) console.log("  no findings");
  else {
    console.log(report.join("\n"));
    advisory.push(`${locale}: ${report.length} finding group(s)`);
  }
  console.log("");
}

if (blocking.length) {
  console.error(`BLOCKING:\n  ${blocking.join("\n  ")}`);
  process.exit(1);
}

if (advisory.length && STRICT) {
  console.error(`advisory findings present and --strict was passed`);
  process.exit(1);
}

console.log(blocking.length === 0 && advisory.length === 0 ? "catalogs are consistent" : "no blocking findings");
