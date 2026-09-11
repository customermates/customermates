export const AGENT_REPLAY_COUNT = 8;
export const AGENT_REPLAY_HISTORY_MAX_BYTES = 8_400;
export const AGENT_REPLAY_RECENT_MESSAGE_BYTES = 2_400;
export const AGENT_REPLAY_GROWTH_MESSAGE_BYTES = 2_400;
export const AGENT_REPLAY_MIN_MESSAGE_BYTES = 300;
export const AGENT_REPLAY_TRIM_MARKER = "\n[...]\n";

export type AgentReplayInput = { role: string; text: string; budgeted: boolean };

export function agentReplayWorstCaseMessageChars() {
  return Math.ceil(AGENT_REPLAY_HISTORY_MAX_BYTES / (AGENT_REPLAY_COUNT - 1));
}

function serializedCharacterBytes(codePoint: number) {
  if (codePoint === 0x22 || codePoint === 0x5c) return 2;
  if (codePoint === 0x08 || codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0c || codePoint === 0x0d)
    return 2;
  if (codePoint < 0x20) return 6;
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return 6;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function serializedReplayTextBytes(text: string) {
  let total = 0;
  for (const character of text) total += serializedCharacterBytes(character.codePointAt(0) ?? 0);
  return total;
}

function takeFromStart(text: string, maxBytes: number) {
  let bytes = 0;
  let end = 0;
  for (const character of text) {
    const cost = serializedCharacterBytes(character.codePointAt(0) ?? 0);
    if (bytes + cost > maxBytes) break;
    bytes += cost;
    end += character.length;
  }
  return { text: text.slice(0, end), bytes };
}

function takeFromEnd(text: string, maxBytes: number) {
  const characters = [...text];
  let bytes = 0;
  let start = text.length;
  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const cost = serializedCharacterBytes(characters[index].codePointAt(0) ?? 0);
    if (bytes + cost > maxBytes) break;
    bytes += cost;
    start -= characters[index].length;
  }
  return { text: text.slice(start), bytes };
}

export function clampAgentReplayText(text: string, maxBytes: number) {
  if (serializedReplayTextBytes(text) <= maxBytes) return text;
  const markerBytes = serializedReplayTextBytes(AGENT_REPLAY_TRIM_MARKER);
  if (maxBytes <= markerBytes) return takeFromStart(text, maxBytes).text;
  const payloadBytes = maxBytes - markerBytes;
  const head = takeFromStart(text, Math.ceil((payloadBytes * 2) / 3));
  const tail = takeFromEnd(text, payloadBytes - head.bytes);
  if (!tail.text) return head.text;
  return `${head.text}${AGENT_REPLAY_TRIM_MARKER}${tail.text}`;
}

export function budgetAgentReplayHistory(messages: readonly AgentReplayInput[]): string[] {
  const costs = messages.map((message) => serializedReplayTextBytes(message.text));
  const budgets = messages.map(() => 0);
  let remaining = AGENT_REPLAY_HISTORY_MAX_BYTES;

  const grant = (index: number, ceiling: number) => {
    const wanted = Math.min(costs[index], ceiling) - budgets[index];
    if (wanted <= 0 || remaining <= 0) return;
    const given = Math.min(wanted, remaining);
    budgets[index] += given;
    remaining -= given;
  };

  const newestFirst = messages.flatMap((message, index) => (message.budgeted ? [index] : [])).reverse();
  const users = newestFirst.filter((index) => messages[index].role === "user");
  const others = newestFirst.filter((index) => messages[index].role !== "user");

  if (newestFirst.length > 0) grant(newestFirst[0], AGENT_REPLAY_RECENT_MESSAGE_BYTES);
  for (const index of newestFirst) grant(index, AGENT_REPLAY_MIN_MESSAGE_BYTES);
  for (const index of users) grant(index, AGENT_REPLAY_GROWTH_MESSAGE_BYTES);
  for (const index of others) grant(index, AGENT_REPLAY_GROWTH_MESSAGE_BYTES);
  for (const index of newestFirst) grant(index, costs[index]);

  return messages.map((message, index) =>
    message.budgeted ? clampAgentReplayText(message.text, budgets[index]) : message.text,
  );
}
