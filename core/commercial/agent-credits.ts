export const AGENT_CREDIT_MICROCENTS = 1_000_000;
export const AGENT_MICROCENTS_PER_USD = 100 * AGENT_CREDIT_MICROCENTS;
export const AGENT_CREDIT_TENTH_MICROCENTS = AGENT_CREDIT_MICROCENTS / 10;

export function agentCreditsToMicrocents(credits: number): number {
  const microcents = Math.round(credits * 10) * AGENT_CREDIT_TENTH_MICROCENTS;
  if (!Number.isFinite(credits) || !Number.isSafeInteger(microcents))
    throw new Error("AI credit amount must be a finite number of tenths.");
  return microcents === 0 ? 0 : microcents;
}

export function agentMicrocentsToCredits(microcents: number): number {
  return microcents / AGENT_CREDIT_MICROCENTS;
}

export function agentExactCreditsToMicrocents(credits: number): number {
  const microcents = Math.round(credits * AGENT_CREDIT_MICROCENTS);
  if (!Number.isSafeInteger(microcents)) throw new Error("AI credit amount is invalid.");
  return microcents === 0 ? 0 : microcents;
}

export function isWholeTenthOfCredit(credits: number): boolean {
  return Number.isFinite(credits) && Math.abs(credits * 10 - Math.round(credits * 10)) < 1e-9;
}

export type AgentCreditDisplay = {
  credits: number;
  amount: string;
};

export function agentCreditDisplay(
  exactCredits: number,
  locale: string,
  belowMinimum: (amount: string) => string = (amount) => `<${amount}`,
): AgentCreditDisplay {
  const microcents = agentExactCreditsToMicrocents(exactCredits);
  const format = new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  const magnitude = Math.abs(microcents);
  const tenths = Math.floor((magnitude + AGENT_CREDIT_TENTH_MICROCENTS / 2) / AGENT_CREDIT_TENTH_MICROCENTS);
  if (tenths === 0 && magnitude > 0) {
    const sign = microcents < 0 ? "-" : "";
    return { credits: 0.1, amount: `${sign}${belowMinimum(format.format(0.1))}` };
  }

  const credits = (microcents < 0 && tenths > 0 ? -tenths : tenths) / 10;
  return { credits, amount: format.format(credits) };
}
