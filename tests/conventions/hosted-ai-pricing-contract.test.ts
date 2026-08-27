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
  const assistantEn = read("content/docs/en/app-assistant.mdx");
  const assistantDe = read("content/docs/de/app-assistant.mdx");
  const locales = `${read("i18n/locales/en.json")}\n${read("i18n/locales/de.json")}`;

  it("publishes exact per-active-user allowances in English and German", () => {
    for (const pricing of [pricingEn, pricingDe]) {
      expect(pricing).toMatch(/200[^\n]*(active user|aktivem Nutzer)/i);
      expect(pricing).toMatch(/500[^\n]*(active user|aktivem Nutzer)/i);
      expect(pricing).toMatch(/1[,.]200[^\n]*(active user|aktivem Nutzer)/i);
    }

    expect(locales).toContain("{credits, number}");
  });

  it("explains trial, monthly reset, no rollover, and external MCP separation", () => {
    expect(pricingEn).toMatch(/active trial user receives 500 credits/i);
    expect(pricingDe).toMatch(/aktive Nutzer in der Testphase erhält 500 Credits/i);
    expect(pricingEn).toContain("Paid allowances reset monthly; unused credits do not roll over.");
    expect(pricingDe).toContain(
      "Bezahlte Kontingente werden monatlich zurückgesetzt; nicht genutzte Credits werden nicht übertragen.",
    );
    expect(assistantEn).toContain("paid allowances reset monthly, and unused credits do not roll over.");
    expect(assistantDe).toContain(
      "bezahlte Kontingente werden monatlich zurückgesetzt und nicht genutzte Credits werden nicht übertragen.",
    );
    expect(`${pricingEn}\n${assistantEn}`).not.toMatch(/annual(?:ly)? billing|billed annually/i);
    expect(`${pricingDe}\n${assistantDe}`).not.toMatch(/jährliche(?:n|r)? Abrechnung/i);
    expect(`${pricingEn}\n${assistantEn}`).not.toMatch(/billing[- ]anniversary/i);
    expect(`${pricingDe}\n${assistantDe}`).not.toMatch(/Abrechnungs(?:stichtag|jubiläum)/i);
    expect(pricingEn).toMatch(/External MCP clients use your own AI provider/i);
    expect(pricingDe).toMatch(/Externe MCP-Clients nutzen Ihren eigenen KI-Anbieter/i);
  });

  it("keeps self-hosted MCP separate from the cloud-only hosted Assistant", () => {
    const selfHosted = `${read("content/docs/en/self-hosting.mdx")}\n${read("content/docs/de/self-hosting.mdx")}`;

    expect(selfHosted).toMatch(/hosted in-app Assistant.*cloud-only/i);
    expect(selfHosted).toMatch(/gehostete In-App-Assistent.*nur in der Cloud/i);
    expect(selfHosted).toMatch(/External MCP.*your own AI provider/i);
    expect(selfHosted).not.toMatch(/(?:€\s?12|12\s?€)\s*\//);
    expect(selfHosted).toMatch(/enterprise SSO and white-labeling are not implemented/i);
    expect(selfHosted).toMatch(/Enterprise-SSO und White-Labeling sind in keiner Variante implementiert/i);
  });

  it("contains no superseded Customermates tier claims", () => {
    const marketing = markdownFiles("content")
      .map((path) => read(path))
      .join("\n");
    const staleClaims = [
      /only adds? messaging/gi,
      /only messaging capacity (?:scales|changes)/gi,
      /only pay more for messaging/gi,
      /only thing that scales with price is messaging/gi,
      /messaging capacity scale with tier/gi,
      /no tier restrictions[^.\n]*AI/gi,
      /without managing credit pools/gi,
      /höhere Stufen[^.\n]*nur Messaging/gi,
      /mehr zahlen Sie nur für Messaging/gi,
      /Nur der Messaging-Umfang skaliert/gi,
      /(?:ergänzen|erweitern) nur (?:die )?Nachrichtenkapazität/gi,
      /nur die Nachrichtenkapazität/gi,
      /ohne Tarifbeschränkungen bei den KI/gi,
    ];

    for (const stale of staleClaims) expect(marketing.match(stale) ?? []).toEqual([]);
    expect(read("content/feature-pages/en/cloud-crm.mdx")).not.toMatch(/Customermates[^\n]*€59/i);
    expect(read("content/feature-pages/de/cloud-crm.mdx")).not.toMatch(/Customermates[^\n]*59 €/i);
  });
});
