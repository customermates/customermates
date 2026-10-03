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
    [
      "en",
      en.AgentChat.credits.recentTurn,
      [
        [1_000_000, "Last turn used 1 credit"],
        [750_000, "Last turn used 0.8 credits"],
        [1_500_000, "Last turn used 1.5 credits"],
        [20_000, "Last turn used <0.1 credits"],
      ],
    ],
    [
      "de",
      de.AgentChat.credits.recentTurn,
      [
        [1_000_000, "Letzte Anfrage: 1 Credit"],
        [750_000, "Letzte Anfrage: 0,8 Credits"],
        [1_500_000, "Letzte Anfrage: 1,5 Credits"],
      ],
    ],
    [
      "es",
      es.AgentChat.credits.recentTurn,
      [
        [1_000_000, "Última consulta: 1 crédito"],
        [750_000, "Última consulta: 0,8 créditos"],
        [1_500_000, "Última consulta: 1,5 créditos"],
      ],
    ],
    [
      "fr",
      fr.AgentChat.credits.recentTurn,
      [
        [1_000_000, "Dernière demande : 1 crédit"],
        [750_000, "Dernière demande : 0,8 crédit"],
        [1_500_000, "Dernière demande : 1,5 crédit"],
        [2_000_000, "Dernière demande : 2 crédits"],
      ],
    ],
    [
      "it",
      it_.AgentChat.credits.recentTurn,
      [
        [1_000_000, "Ultima richiesta: 1 credito"],
        [750_000, "Ultima richiesta: 0,8 crediti"],
        [1_500_000, "Ultima richiesta: 1,5 crediti"],
      ],
    ],
  ] as const)("chooses the %s plural for fractional credits", (locale, message, cases) => {
    const format = new IntlMessageFormat(message, locale);
    for (const [microcents, expected] of cases) expect(format.format(display(microcents, locale))).toBe(expected);
  });
});
