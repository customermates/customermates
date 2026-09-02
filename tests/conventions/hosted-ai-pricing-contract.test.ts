import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REGISTERED_LOCALES } from "@/i18n/locale-registry";

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
  const localeFiles = Object.fromEntries(
    REGISTERED_LOCALES.map((locale) => [locale, read(`i18n/locales/${locale}.json`)]),
  );
  const locales = Object.values(localeFiles).join("\n");
  const subscriptionCreditNotes = Object.fromEntries(
    Object.entries(localeFiles).map(([locale, source]) => [
      locale,
      (JSON.parse(source) as { Subscription: { picker: { creditNote: string } } }).Subscription.picker.creditNote,
    ]),
  );

  it("publishes exact per-active-user allowances in English and German", () => {
    for (const pricing of [pricingEn, pricingDe]) {
      expect(pricing).toMatch(/200[^\n]*(active user|aktivem Nutzer)/i);
      expect(pricing).toMatch(/500[^\n]*(active user|aktivem Nutzer)/i);
      expect(pricing).toMatch(/1[,.]200[^\n]*(active user|aktivem Nutzer)/i);
    }

    expect(locales).toContain("{credits, number}");
  });

  it("explains trial, monthly reset, no rollover, and external MCP separation", () => {
    expect(pricingEn).toMatch(/every active trial user has a 500-credit plan allowance/i);
    expect(pricingDe).toMatch(/Jeder aktive Nutzer in der Testphase hat ein Tarifkontingent von 500 Credits/i);
    expect(pricingEn).toContain("Paid allowances reset monthly; unused credits do not roll over.");
    expect(pricingDe).toContain(
      "Bezahlte Kontingente werden monatlich zurückgesetzt; nicht genutzte Credits werden nicht übertragen.",
    );
    expect(assistantEn).toContain("paid allowances reset monthly, and unused credits do not roll over.");
    expect(assistantDe).toContain(
      "bezahlte Kontingente werden monatlich zurückgesetzt und nicht genutzte Credits werden nicht übertragen.",
    );
    expect(subscriptionCreditNotes).toEqual({
      en: "Hosted AI credits refresh monthly; unused credits do not roll over. External MCP clients use your own AI provider and do not consume these credits.",
      de: "Credits für den gehosteten KI-Assistenten werden monatlich erneuert; nicht genutzte Credits werden nicht übertragen. Externe MCP-Clients nutzen deinen eigenen KI-Anbieter und verbrauchen diese Credits nicht.",
      es: "Los créditos de IA alojada se renuevan cada mes; los créditos no utilizados no se acumulan. Los clientes MCP externos utilizan tu propio proveedor de IA y no consumen estos créditos.",
      fr: "Les crédits IA hébergés sont renouvelés chaque mois ; les crédits non utilisés ne sont pas reportés. Les clients MCP externes utilisent votre propre fournisseur d'IA et ne consomment pas ces crédits.",
      it: "I crediti IA in hosting si rinnovano ogni mese; i crediti non utilizzati non vengono trasferiti al mese successivo. I client MCP esterni utilizzano il tuo provider di IA e non consumano questi crediti.",
    });
    expect(`${pricingEn}\n${assistantEn}`).not.toMatch(/annual(?:ly)? billing|billed annually/i);
    expect(`${pricingDe}\n${assistantDe}`).not.toMatch(/jährliche(?:n|r)? Abrechnung/i);
    expect(Object.values(subscriptionCreditNotes).join("\n")).not.toMatch(
      /annual(?:ly)? billing|billed annually|jährliche(?:n|r)? Abrechnung|facturación anual|facturation annuelle|fatturazione annuale/i,
    );
    expect(`${pricingEn}\n${assistantEn}`).not.toMatch(/billing[- ]anniversary/i);
    expect(`${pricingDe}\n${assistantDe}`).not.toMatch(/Abrechnungs(?:stichtag|jubiläum)/i);
    expect(pricingEn).toMatch(/External MCP clients use your own AI provider/i);
    expect(pricingDe).toMatch(/Externe MCP-Clients nutzen Ihren eigenen KI-Anbieter/i);
  });

  it("distinguishes plan entitlement from live hosted availability", () => {
    const availabilitySurfaces = [
      { label: "pricing", en: pricingEn, de: pricingDe },
      { label: "assistant docs", en: assistantEn, de: assistantDe },
      {
        label: "features overview",
        en: read("content/features/en/features.mdx"),
        de: read("content/features/de/features.mdx"),
      },
      {
        label: "cloud CRM",
        en: read("content/feature-pages/en/cloud-crm.mdx"),
        de: read("content/feature-pages/de/cloud-crm.mdx"),
      },
      {
        label: "LinkedIn integration",
        en: read("content/feature-pages/en/linkedin-integration.mdx"),
        de: read("content/feature-pages/de/linkedin-integration.mdx"),
      },
      {
        label: "unified inbox",
        en: read("content/feature-pages/en/unified-inbox.mdx"),
        de: read("content/feature-pages/de/unified-inbox.mdx"),
      },
      {
        label: "agentic CRM",
        en: read("content/blog-posts/en/agentic-crm.mdx"),
        de: read("content/blog-posts/de/agentic-crm.mdx"),
      },
    ];

    for (const { label, en, de } of availabilitySurfaces) {
      expect(en, `${label}: missing English Mate entitlement`).toMatch(/Mate entitlement/i);
      expect(de, `${label}: missing German Mate entitlement`).toMatch(/Mate-Berechtigung|Berechtigung für Mate/i);
      expect(en, `${label}: missing English live-availability boundary`).toMatch(
        /live (?:Mate )?availability depends on the hosted environment|whether [^.\n]{0,160}live depends on the hosted environment|when Mate is enabled in (?:the|that) hosted environment/i,
      );
      expect(de, `${label}: missing German live-availability boundary`).toMatch(
        /Live-Verfügbarkeit[^.\n]{0,120}hängt von der .*gehosteten Umgebung ab|Ob [^.\n]{0,180}live verfügbar ist, hängt|Wenn Mate in der gehosteten Umgebung aktiviert ist/i,
      );
      expect(en).not.toMatch(
        /every (?:managed-)?cloud plan includes the hosted Mate assistant|included with every cloud plan/i,
      );
      expect(de).not.toMatch(
        /jeder (?:Managed-)?Cloud-Tarif enthält den gehosteten Mate-Assistenten|in jedem Cloud-Tarif enthalten/i,
      );
    }

    const productDemo = read("components/marketing/product-demo.tsx");
    expect(productDemo).toContain("When Mate is enabled for this demo environment, it starts closed");
    expect(productDemo).toContain("Wenn Mate für diese Demo-Umgebung aktiviert ist, startet es geschlossen");
    expect(productDemo).not.toMatch(/(?:^|[.!?]\s+)Mate starts closed/);
    expect(productDemo).not.toMatch(/(?:^|[.!?]\s+)Mate startet geschlossen/);
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
