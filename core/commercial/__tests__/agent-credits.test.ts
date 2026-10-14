import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it_ from "@/i18n/locales/it.json";

import {
  AGENT_CREDIT_MICROCENTS,
  AGENT_MICROCENTS_PER_USD,
  agentCreditDisplay,
  agentCreditsToMicrocents,
  agentExactCreditsToMicrocents,
  formatAllowanceSharePct,
  isWholeTenthOfCredit,
} from "../agent-credits";

describe("the hosted-AI credit unit", () => {
  it("is one US cent, held as exact microcents", () => {
    expect(AGENT_CREDIT_MICROCENTS).toBe(1_000_000);
    expect(AGENT_MICROCENTS_PER_USD / AGENT_CREDIT_MICROCENTS).toBe(100);
  });

  it("converts configured and operator credit amounts in whole tenths", () => {
    expect(agentCreditsToMicrocents(500)).toBe(500_000_000);
    expect(agentCreditsToMicrocents(2.5)).toBe(2_500_000);
    expect(agentCreditsToMicrocents(-0.3)).toBe(-300_000);
    expect(agentCreditsToMicrocents(0.1 + 0.2)).toBe(300_000);
    expect(() => agentCreditsToMicrocents(Number.NaN)).toThrow();
  });

  it("accepts at most one decimal from an operator", () => {
    expect(isWholeTenthOfCredit(12)).toBe(true);
    expect(isWholeTenthOfCredit(-2.5)).toBe(true);
    expect(isWholeTenthOfCredit(0.1 + 0.2)).toBe(true);
    expect(isWholeTenthOfCredit(0.25)).toBe(false);
    expect(isWholeTenthOfCredit(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("recovers exact microcents from exact credits sent to a client", () => {
    expect(agentExactCreditsToMicrocents(753_412 / AGENT_CREDIT_MICROCENTS)).toBe(753_412);
  });
});

function display(microcents: number, locale: string) {
  return agentCreditDisplay(microcents / AGENT_CREDIT_MICROCENTS, locale);
}

describe("credit display", () => {
  it("rounds half up to one decimal only for display", () => {
    expect(display(750_000, "en")).toEqual({ credits: 0.8, amount: "0.8" });
    expect(display(749_999, "en")).toEqual({ credits: 0.7, amount: "0.7" });
    expect(display(199_250_000, "en")).toEqual({ credits: 199.3, amount: "199.3" });
    expect(display(1_000_000, "en")).toEqual({ credits: 1, amount: "1" });
    expect(display(1_200_000_000, "en")).toEqual({ credits: 1200, amount: "1,200" });
    expect(display(0, "en")).toEqual({ credits: 0, amount: "0" });
  });

  it("never shows a non-zero amount as zero", () => {
    expect(display(1, "en").amount).toBe("<0.1");
    expect(display(49_999, "en").amount).toBe("<0.1");
    expect(display(50_000, "en").amount).toBe("0.1");
    expect(display(-1, "en").amount).toBe("-<0.1");
  });

  it("formats with the user's locale", () => {
    expect(display(199_200_000, "de").amount).toBe("199,2");
    expect(display(1_234_500_000, "de").amount).toBe("1.234,5");
    expect(display(10, "fr").amount).toBe("<0,1");
    expect(display(-2_500_000, "en").amount).toBe("-2.5");
  });

  it.each([
    ["en", en.AgentChat.credits.recentTurn, "Last request used 0.4%"],
    ["de", de.AgentChat.credits.recentTurn, "Letzte Anfrage: 0,4 %"],
    ["es", es.AgentChat.credits.recentTurn, "Última consulta: 0,4 %"],
    ["fr", fr.AgentChat.credits.recentTurn, "Dernière demande : 0,4 %"],
    ["it", it_.AgentChat.credits.recentTurn, "Ultima richiesta: 0,4%"],
  ] as const)("phrases the last request in %s as a share of the allowance", (locale, message, expected) => {
    const format = new IntlMessageFormat(message, locale);
    const text = String(format.format({ used: formatAllowanceSharePct(0.375, locale) }));
    expect(text.replace(/[\u00a0\u202f]/g, " ")).toBe(expected);
  });
});

describe("allowance share display", () => {
  const plain = (value: string) => value.replace(/[\u00a0\u202f]/g, " ");

  it("never shows a non-zero share as zero", () => {
    expect(formatAllowanceSharePct(0, "en")).toBe("0%");
    expect(formatAllowanceSharePct(0.01, "en")).toBe("<0.1%");
    expect(formatAllowanceSharePct(0.099, "en")).toBe("<0.1%");
    expect(plain(formatAllowanceSharePct(0.05, "de"))).toBe("<0,1 %");
  });

  it("uses one decimal for small shares and whole percents from ten", () => {
    expect(formatAllowanceSharePct(0.1, "en")).toBe("0.1%");
    expect(formatAllowanceSharePct(0.375, "en")).toBe("0.4%");
    expect(formatAllowanceSharePct(2.8, "en")).toBe("2.8%");
    expect(formatAllowanceSharePct(12.34, "en")).toBe("12%");
    expect(formatAllowanceSharePct(100, "en")).toBe("100%");
    expect(formatAllowanceSharePct(140, "en")).toBe("100%");
    expect(plain(formatAllowanceSharePct(2.8, "de"))).toBe("2,8 %");
  });
});
