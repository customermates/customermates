import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REGISTERED_LOCALES } from "@/i18n/locale-registry";
import {
  CLOUD_TRIAL,
  CLOUD_TRIAL_HOSTED_AI_USAGE_MULTIPLIER,
  HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER,
  PLAN_CATALOG,
  PLAN_IDS,
  PURCHASABLE_PLAN_IDS,
  RECOMMENDED_PLAN_ID,
} from "@/core/commercial/plan-catalog";
import { routineMaxCreditsPerRun } from "@/ee/routines/routine-run-limits";

const ROOT = process.cwd();

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

const PLAN_CATALOG_NAMES = { starter: "Starter", pro: "Pro", business: "Business", max: "Max" } as const;

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
  const routinesEn = read("content/docs/en/app-routines.mdx");
  const routinesDe = read("content/docs/de/app-routines.mdx");
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

  it("derives every self-serve allowance from one base and a per-plan multiplier", () => {
    expect(HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER).toBe(200);
    const multipliers = Object.fromEntries(
      PLAN_IDS.map((plan) => [plan, PLAN_CATALOG[plan].entitlements.hostedAiUsageMultiplier]),
    );
    expect(multipliers).toEqual({ starter: 1, pro: 3, business: 10, max: 20, enterprise: "contract" });
    for (const plan of PURCHASABLE_PLAN_IDS) {
      expect(PLAN_CATALOG[plan].entitlements.hostedAiCreditsPerActiveUser).toBe(
        HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER * PLAN_CATALOG[plan].entitlements.hostedAiUsageMultiplier,
      );
    }
    expect(CLOUD_TRIAL_HOSTED_AI_USAGE_MULTIPLIER).toBe(PLAN_CATALOG[CLOUD_TRIAL.plan].entitlements.hostedAiUsageMultiplier);
  });

  it("keeps Business the best usage per euro and recommends it", () => {
    const usagePerEuro = PURCHASABLE_PLAN_IDS.map((plan) => ({
      plan,
      value:
        PLAN_CATALOG[plan].entitlements.hostedAiUsageMultiplier / PLAN_CATALOG[plan].offers.monthly.unitPriceMinor,
    })).sort((left, right) => right.value - left.value);

    expect(usagePerEuro.map(({ plan }) => plan)).toEqual(["business", "max", "pro", "starter"]);
    expect(RECOMMENDED_PLAN_ID).toBe("business");
    for (const pricing of [pricingEn, pricingDe]) {
      const business = pricing.slice(pricing.indexOf("  - plan: business"), pricing.indexOf("  - plan: max"));
      expect(business).toMatch(/badge: (Recommended|Empfohlen)\n/);
      expect(business).toContain("featured: true");
      expect(pricing).not.toMatch(/Most popular|Beliebteste Wahl|Am beliebtesten/);
    }
    for (const source of Object.values(localeFiles)) {
      const picker = (JSON.parse(source) as { Subscription: { picker: Record<string, unknown> } }).Subscription.picker;
      expect(picker).toHaveProperty("recommended");
      expect(picker).not.toHaveProperty("mostPopular");
    }
  });

  it("publishes each plan's catalog multiplier, never raw credit amounts, in pricing, docs and the picker", () => {
    for (const pricing of [pricingEn, pricingDe]) {
      for (const plan of PURCHASABLE_PLAN_IDS) {
        const start = pricing.indexOf(`  - plan: ${plan}\n`);
        const card = pricing.slice(start, pricing.indexOf("  - plan: ", start + 1));
        const multiplier = PLAN_CATALOG[plan].entitlements.hostedAiUsageMultiplier;
        expect(card, `${plan} card`).toMatch(new RegExp(`Mate[- ](?:usage|Nutzung): ${multiplier}x`));
      }
      expect(pricing).toMatch(/Starter 1x, Pro 3x, Business 10x, Max 20x/);
      expect(pricing).not.toMatch(/\d[\d.,]*\s*(?:credits|Credits)\b/);
    }

    for (const assistant of [assistantEn, assistantDe]) {
      for (const plan of PURCHASABLE_PLAN_IDS) {
        const multiplier = PLAN_CATALOG[plan].entitlements.hostedAiUsageMultiplier;
        expect(assistant).toMatch(
          new RegExp(`\\| ${PLAN_CATALOG_NAMES[plan]} \\| \\[\\[commercial\\.price\\.${plan}\\.monthly\\]\\] \\| ${multiplier}x`),
        );
      }
      expect(assistant).not.toMatch(/\d[\d.,]*\s*(?:credits|Credits)\b/);
    }

    for (const source of Object.values(localeFiles)) {
      expect(source).toContain("{multiplier}x");
      expect(source).not.toContain("{credits, number}");
    }
  });

  it("states the routine per-run cap as a share of the Starter allowance", () => {
    const starterShare = (routineMaxCreditsPerRun("starter") / HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER) * 100;
    const maxShare = (routineMaxCreditsPerRun("max") / HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER) * 100;
    expect([starterShare, maxShare]).toEqual([5, 10]);

    for (const docs of [assistantEn, routinesEn]) {
      expect(docs).toContain(`${starterShare}% of a Starter allowance`);
      expect(docs).toMatch(new RegExp(`${maxShare}% on Max`));
    }
    for (const docs of [assistantDe, routinesDe]) {
      expect(docs).toContain(`${starterShare} % eines Starter-Kontingents`);
      expect(docs).toMatch(new RegExp(`${maxShare} % bei Max`));
    }
  });

  it("explains trial, monthly reset, no rollover, and external MCP separation", () => {
    const trialMultiplier = CLOUD_TRIAL_HOSTED_AI_USAGE_MULTIPLIER;
    expect(pricingEn).toContain(`Every active trial user has the Pro allowance of ${trialMultiplier}x.`);
    expect(pricingDe).toContain(`Jeder aktive Nutzer in der Testphase hat das Pro-Kontingent von ${trialMultiplier}x.`);
    expect(assistantEn).toContain(`with Pro features and the Pro allowance of ${trialMultiplier}x per active user`);
    expect(assistantDe).toContain(`mit Pro-Funktionen und dem Pro-Kontingent von ${trialMultiplier}x pro aktivem Nutzer`);
    expect(pricingEn).toContain("Paid allowances reset monthly; unused usage does not roll over.");
    expect(pricingDe).toContain(
      "Bezahlte Kontingente werden monatlich zurückgesetzt; nicht genutzte Nutzung wird nicht übertragen.",
    );
    expect(assistantEn).toContain("paid allowances reset monthly, and unused usage does not roll over.");
    expect(assistantDe).toContain(
      "bezahlte Kontingente werden monatlich zurückgesetzt und nicht genutzte Nutzung wird nicht übertragen.",
    );
    expect(subscriptionCreditNotes).toEqual({
      en: "Mate usage is shown as a multiple of the Starter allowance (Starter 1x, Pro 3x, Business 10x, Max 20x) and refreshes monthly; unused usage does not roll over. Each request counts its exact provider cost. External MCP clients bill model use through your own AI provider. Server-side semantic searches can count toward Mate usage.",
      de: "Die Mate-Nutzung wird als Vielfaches des Starter-Kontingents angegeben (Starter 1x, Pro 3x, Business 10x, Max 20x) und monatlich erneuert; nicht genutzte Nutzung wird nicht übertragen. Jede Anfrage zählt mit ihren genauen Anbieterkosten. Externe MCP-Clients rechnen die Modellnutzung über deinen eigenen KI-Anbieter ab. Serverseitige semantische Suchen können zur Mate-Nutzung zählen.",
      es: "El uso de Mate se indica como múltiplo de la asignación de Starter (Starter 1x, Pro 3x, Business 10x, Max 20x) y se renueva cada mes; el uso no consumido no se acumula. Cada consulta cuenta su coste exacto del proveedor. Los clientes MCP externos facturan el uso del modelo a través de tu propio proveedor de IA. Las búsquedas semánticas del servidor pueden contar para el uso de Mate.",
      fr: "L'usage Mate est exprimé en multiple de l'allocation Starter (Starter 1x, Pro 3x, Business 10x, Max 20x) et se renouvelle chaque mois ; l'usage non consommé n'est pas reporté. Chaque demande compte son coût exact chez le fournisseur. Les clients MCP externes facturent les modèles via votre propre fournisseur d'IA. Les recherches sémantiques côté serveur peuvent compter dans l'usage Mate.",
      it: "L'utilizzo di Mate è espresso come multiplo della dotazione Starter (Starter 1x, Pro 3x, Business 10x, Max 20x) e si rinnova ogni mese; l'utilizzo non consumato non viene trasferito al mese successivo. Ogni richiesta conta il suo costo esatto presso il provider. I client MCP esterni fatturano i modelli tramite il tuo provider di IA. Le ricerche semantiche lato server possono contare nell'utilizzo di Mate.",
    });
    const catalogMultipliers = PURCHASABLE_PLAN_IDS.map(
      (plan) => `${PLAN_CATALOG_NAMES[plan]} ${PLAN_CATALOG[plan].entitlements.hostedAiUsageMultiplier}x`,
    ).join(", ");
    for (const note of Object.values(subscriptionCreditNotes)) expect(note).toContain(catalogMultipliers);
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
    expect(productDemo).toContain("Ist Mate in dieser Demo aktiviert, bleibt das Mate-Fenster anfangs geschlossen");
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
