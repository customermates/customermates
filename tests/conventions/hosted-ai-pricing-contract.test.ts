import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function markdownFiles(directory: string): string[] {
  return readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    return entry.isDirectory() ? markdownFiles(relative) : entry.name.endsWith(".mdx") ? [relative] : [];
  });
}

describe("hosted AI pricing contract", () => {
  const pricingEn = read("content/pricing/en/pricing.mdx");
  const pricingDe = read("content/pricing/de/pricing.mdx");
  const locales = `${read("i18n/locales/en.json")}\n${read("i18n/locales/de.json")}`;

  it("publishes exact per-active-user allowances in English and German", () => {
    for (const pricing of [pricingEn, pricingDe]) {
      expect(pricing).toMatch(/200[^\n]*(active user|aktivem Nutzer)/i);
      expect(pricing).toMatch(/500[^\n]*(active user|aktivem Nutzer)/i);
      expect(pricing).toMatch(/1[,.]200[^\n]*(active user|aktivem Nutzer)/i);
    }

    expect(locales).toContain("{credits, number}");
  });

  it("explains trial, annual reset, no rollover, and external MCP separation", () => {
    expect(pricingEn).toMatch(/active trial user receives 500 credits/i);
    expect(pricingDe).toMatch(/aktive Nutzer in der Testphase erhält 500 Credits/i);
    expect(pricingEn).toMatch(/monthly billing-anniversary day, even when billed annually/i);
    expect(pricingDe).toMatch(/monatlichen Abrechnungsstichtag.*jährlicher Abrechnung/i);
    expect(pricingEn).toMatch(/do not roll over/i);
    expect(pricingDe).toMatch(/nicht übertragen/i);
    expect(pricingEn).toMatch(/External MCP clients use your own AI provider/i);
    expect(pricingDe).toMatch(/Externe MCP-Clients nutzen Ihren eigenen KI-Anbieter/i);
  });

  it("keeps self-hosted MCP separate from the cloud-only hosted Assistant", () => {
    const selfHosted = `${read("content/docs/en/self-hosting.mdx")}\n${read("content/docs/de/self-hosting.mdx")}`;

    expect(selfHosted).toMatch(/hosted in-app Assistant.*cloud-only/i);
    expect(selfHosted).toMatch(/gehostete In-App-Assistent.*nur in der Cloud/i);
    expect(selfHosted).toMatch(/External MCP.*your own AI provider/i);
  });

  it("contains no superseded Customermates tier claims", () => {
    const marketing = markdownFiles("content")
      .map((path) => read(path))
      .join("\n");
    const staleClaims = [
      /higher tiers[^.\n]*only add messaging/gi,
      /only messaging capacity (?:scales|changes)/gi,
      /Pro[^.\n]*Business[^.\n]*only add messaging/gi,
      /no tier restrictions[^.\n]*AI/gi,
      /without managing credit pools/gi,
      /höhere Stufen[^.\n]*nur Messaging/gi,
      /mehr zahlen Sie nur für Messaging/gi,
      /Nur der Messaging-Umfang skaliert/gi,
    ];

    for (const stale of staleClaims) expect(marketing.match(stale) ?? []).toEqual([]);
    expect(read("content/feature-pages/en/cloud-crm.mdx")).not.toMatch(/Customermates[^\n]*€59/i);
    expect(read("content/feature-pages/de/cloud-crm.mdx")).not.toMatch(/Customermates[^\n]*59 €/i);
  });
});
