import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

type RetiredClaim = {
  id: string;
  pattern: RegExp;
  why: string;
  authority: string;
};

const RETIRED_CLAIMS: RetiredClaim[] = [
  {
    id: "native-slack-integration",
    pattern: /(native|built-?in|nativ|integrierte[rn]?)[ -](slack)|slack[ -](integration|app)[^.\n]{0,30}(built|native|included|eingebaut|enthalten)/i,
    why: "Slack is not a MessagingProvider and there is no Slack screen in the product",
    authority: "prisma/schema.prisma enum MessagingProvider",
  },
  {
    id: "bundled-n8n-runtime",
    pattern: /(built-?in|builtin|embedded|bundled|integrierte[rn]?|eingebaute[rns]?)[ -]n8n|n8n[^.\n]{0,25}(is included|included with|enthalten in|im abo)/i,
    why: "docker-compose.yml runs postgres and app only; n8n is customer-run",
    authority: "docker-compose.yml",
  },
  {
    id: "csv-importer",
    pattern:
      /(supports?|offers?|provides?|includes?|has|with|unterstützt|bietet|enthält|mit)[^.\n]{0,30}(csv|excel)[ -]?(import(er|s)?|importe?)\b/i,
    why: "there is no import route, import screen, or field-mapping UI",
    authority: "app/[locale]/(protected)/",
  },
  {
    id: "record-attachments",
    pattern: /(file attachments?|dateianh(a|ä)nge)[^.\n]{0,40}(record|contact|deal|datensatz|kontakt)/i,
    why: "no Attachment model exists; attachments live on inbox messages only",
    authority: "prisma/schema.prisma",
  },
  {
    id: "built-in-reminders",
    pattern: /(automatic|automatische|built-?in|eingebaute)[ -](reminders?|erinnerungen)/i,
    why: "Task has no due date and nothing in the product notifies on a schedule",
    authority: "prisma/schema.prisma model Task",
  },
  {
    id: "push-notifications",
    pattern: /(mobile|native|app|ios|android)[^.\n]{0,40}push[ -]?(notifications?|benachrichtigungen)|push[ -]?(notifications?|benachrichtigungen)[^.\n]{0,40}(mobile|phone|ios|android|handy)/i,
    why: "there is no native mobile app and no push transport",
    authority: "package.json, app/",
  },
  {
    id: "shipped-white-label-or-sso",
    pattern:
      /(white[ -]?label|whitelabel|single sign[ -]on|\bSSO\b)[^.\n]{0,40}(is (available|included)|ships|shipped|verfügbar|enthalten)(?![^.\n]{0,40}(not|kein|nicht))/i,
    why: "CUS-153 records SSO and white-label as contract items with no code behind them",
    authority: "ee/, features/",
  },
  {
    id: "german-hosting-location",
    pattern: /(hosted|hosting|gehostet|stored|gespeichert)[^.\n]{0,30}(in germany|in deutschland|frankfurt)|(german|deutsche[nr]?)[ -](data cent(er|re)s?|rechenzentren)/i,
    why: "the application is hosted by Vercel in the USA; only the managed database is in an EU region",
    authority: "content/legal/en/subprocessors.mdx",
  },
  {
    id: "no-us-subprocessors",
    pattern: /(no|zero|without any)[ -]?(us|u\.s\.)[ -]?(sub[- ]?processors?|vendors?|providers?)|keine[ -]?us[- ]?(sub|dienstleist|anbieter)/i,
    why: "Vercel, Resend, Sentry, Forward Email, and Lemon Squeezy are all US providers",
    authority: "content/legal/en/subprocessors.mdx",
  },
  {
    id: "absolute-eu-data-residency",
    pattern: /(data|daten)[^.\n]{0,25}(never leaves?|verlassen (nie|niemals))[^.\n]{0,20}(the eu|europe|die eu|europa)/i,
    why: "the subprocessor list documents transfers to US providers under SCCs",
    authority: "content/legal/en/subprocessors.mdx",
  },
];

const PRODUCT_SURFACES = ["features", "features-all", "homepage", "pricing", "automation", "affiliate"].map((section) =>
  join("content", section),
);
const SUBJECT = /customermates/i;
const DENIAL = /(\b(no|not|never|without|nor|nie|noch nicht|yet|instead of|statt)\b|\bkein\w*\b|\bnicht\b|gibt es nicht|does not|do not|has no|hat kein)/i;

const SCANNED = [
  { root: "content", matches: (path: string) => path.endsWith(".mdx") && !path.startsWith(join(REPO_ROOT, "content", "legal")) },
  { root: join("i18n", "locales"), matches: (path: string) => path.endsWith(".json") },
];

function scannedFiles(): string[] {
  return SCANNED.flatMap(({ root, matches }) => walkFiles(join(REPO_ROOT, root), matches));
}

function isAboutTheProduct(file: string, line: string): boolean {
  if (SUBJECT.test(line)) return true;
  if (file.startsWith(join("i18n", "locales"))) return true;
  return PRODUCT_SURFACES.some((surface) => file.startsWith(surface));
}

describe("retired claims stay retired", () => {
  it("keeps one rule per claim the product does not support", () => {
    expect(new Set(RETIRED_CLAIMS.map((claim) => claim.id)).size).toBe(RETIRED_CLAIMS.length);
    expect(RETIRED_CLAIMS.every((claim) => claim.why && claim.authority)).toBe(true);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("finds no retired claim in marketing copy", () => {
    const violations: string[] = [];

    for (const path of scannedFiles()) {
      const file = relative(REPO_ROOT, path);
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, index, lines) => {
          if (!isAboutTheProduct(file, line)) return;
          const context = `${line}\n${lines[index + 1] ?? ""}`;
          for (const claim of RETIRED_CLAIMS) {
            const match = line.match(claim.pattern);
            if (!match) continue;
            if (DENIAL.test(context)) continue;
            violations.push(`${file}:${index + 1} [${claim.id}] "${match[0].trim()}" — ${claim.why} (${claim.authority})`);
          }
        });
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
