import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER } from "@/core/commercial/plan-catalog";
import { routineMaxCreditsPerRun } from "@/ee/routines/routine-run-limits";

import {
  AGENT_RESERVATION_ROUNDS_AHEAD,
  agentRoundWorstCaseMicrocents,
  agentRoundWorstCaseMicrocentsForContextBytes,
  resolveAgentTurnBudget,
} from "../agent-budget-policy";
import {
  AGENT_CONTEXT_BYTES_PER_TOKEN,
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  SHIPPED_AGENT_MODEL,
  agentModelWorstCasePromptTokens,
} from "../model-catalog";

describe("reservation floor", () => {
  it("prices the worst case at two bytes per provider token, half the enforced envelope density", () => {
    expect(AGENT_MIN_BYTES_PER_PROVIDER_TOKEN).toBe(2);
    expect(AGENT_CONTEXT_BYTES_PER_TOKEN).toBe(3);
    const balanced = SHIPPED_AGENT_MODEL;
    expect(agentModelWorstCasePromptTokens(balanced)).toBe(Math.ceil((balanced.maxContextTokens * 3) / 2) + 2_500);
  });

  it("prices admission for the round it is about to start, never above the envelope round", () => {
    const balanced = SHIPPED_AGENT_MODEL;
    const envelope = agentRoundWorstCaseMicrocents(balanced);
    const smallContext = 24_000;
    const smallRound = agentRoundWorstCaseMicrocentsForContextBytes(balanced, smallContext);
    expect(smallRound).toBeLessThanOrEqual(envelope);

    expect(
      resolveAgentTurnBudget({ model: balanced, availableMicrocents: smallRound, requiredContextBytes: smallContext }),
    ).not.toBeNull();

    const admitted = resolveAgentTurnBudget({
      model: balanced,
      availableMicrocents: 500_000_000,
      requiredContextBytes: smallContext,
    });
    expect(admitted?.roundReserveMicrocents).toBe(envelope);
    expect(admitted?.reservedMicrocents).toBe(smallRound * AGENT_RESERVATION_ROUNDS_AHEAD);
    expect(
      resolveAgentTurnBudget({
        model: balanced,
        availableMicrocents: smallRound - 1,
        requiredContextBytes: smallContext,
      }),
    ).toBeNull();
  });

  it("holds two rounds ahead and tops up round by round", () => {
    expect(AGENT_RESERVATION_ROUNDS_AHEAD).toBe(2);
  });

  it("reserves under one percent of a Starter allowance per round and admits a user holding that much", () => {
    const perRound = agentRoundWorstCaseMicrocents(SHIPPED_AGENT_MODEL);
    const starterMicrocents = HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER * 1_000_000;
    expect(perRound).toBe(7_383_748);
    expect(perRound).toBeLessThan(starterMicrocents / 100);
    expect(resolveAgentTurnBudget({ model: SHIPPED_AGENT_MODEL, availableMicrocents: perRound })).not.toBeNull();
    expect(resolveAgentTurnBudget({ model: SHIPPED_AGENT_MODEL, availableMicrocents: perRound - 1 })).toBeNull();
  });

  it("states the shipped reservation in the assistant docs as shares of the Starter and Pro allowances", () => {
    const perRound = agentRoundWorstCaseMicrocents(SHIPPED_AGENT_MODEL);
    const starterMicrocents = HOSTED_AI_BASE_CREDITS_PER_ACTIVE_USER * 1_000_000;
    const share = (allowanceMicrocents: number, rounds: number) =>
      ((perRound * rounds * 100) / allowanceMicrocents).toFixed(1);
    const perRoundShare = share(starterMicrocents, 1);
    const totalShare = share(starterMicrocents, AGENT_RESERVATION_ROUNDS_AHEAD);
    const proShare = share(starterMicrocents * 3, 1);
    expect([perRoundShare, totalShare, proShare]).toEqual(["0.9", "1.8", "0.3"]);

    const en = readFileSync(join(process.cwd(), "content/docs/en/app-assistant.mdx"), "utf8");
    const de = readFileSync(join(process.cwd(), "content/docs/de/app-assistant.mdx"), "utf8");
    expect(en).toContain(`${perRoundShare}% of a Starter allowance per round and ${totalShare}% in total`);
    expect(en).toContain(`when less than ${perRoundShare}% of a Starter allowance remains`);
    expect(en).toContain(`about ${proShare}% per round on Pro`);
    const comma = (value: string) => value.replace(".", ",");
    expect(de).toContain(
      `${comma(perRoundShare)} % eines Starter-Kontingents pro Runde und ${comma(totalShare)} % insgesamt`,
    );
    expect(de).toContain(`wenn weniger als ${comma(perRoundShare)} % eines Starter-Kontingents übrig sind`);
    expect(de).toContain(`bei Pro etwa ${comma(proShare)} % pro Runde`);
  });

  it("fits several shipped rounds into a routine run's credit ceiling", () => {
    const perRound = agentRoundWorstCaseMicrocents(SHIPPED_AGENT_MODEL);
    expect(Math.floor((routineMaxCreditsPerRun("starter") * 1_000_000) / perRound)).toBe(5);
    expect(Math.floor((routineMaxCreditsPerRun("max") * 1_000_000) / perRound)).toBe(10);
  });
});
