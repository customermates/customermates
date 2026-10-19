import { AGENT_MICROCENTS_PER_USD } from "@/core/commercial/agent-credits";

export type CaseRow = {
  id: string;
  pass: boolean;
  reason: string;
  costMicrocents: number;
  rounds: number;
  firstOutputMs: number | null;
  firstTextMs: number | null;
  totalMs: number;
};

export const MIN_CASE_RESERVE_USD = 0.03;

export function microcentsToUsd(microcents: number) {
  return microcents / AGENT_MICROCENTS_PER_USD;
}

export function usdToMicrocents(usd: number) {
  return Math.round(usd * AGENT_MICROCENTS_PER_USD);
}

export function nextCaseReserveMicrocents(rows: readonly CaseRow[]) {
  const largest = Math.max(0, ...rows.map((row) => row.costMicrocents));
  return Math.max(usdToMicrocents(MIN_CASE_RESERVE_USD), Math.ceil(largest * 1.5));
}

export function admitsNextCase(spentMicrocents: number, capMicrocents: number, rows: readonly CaseRow[]) {
  return spentMicrocents + nextCaseReserveMicrocents(rows) <= capMicrocents;
}

const ms = (value: number | null) => (value === null ? "-" : String(value));

export function renderTable(rows: readonly CaseRow[]) {
  const header = ["case", "result", "reason", "cost USD", "rounds", "first output ms", "first text ms", "total ms"];
  const body = rows.map((row) => [
    row.id,
    row.pass ? "pass" : "FAIL",
    row.reason.replace(/\s+/g, " ").slice(0, 70),
    microcentsToUsd(row.costMicrocents).toFixed(4),
    String(row.rounds),
    ms(row.firstOutputMs),
    ms(row.firstTextMs),
    String(row.totalMs),
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...body.map((cells) => cells[column].length)));
  const line = (cells: readonly string[]) => `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(" | ")} |`;
  return [line(header), `|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`, ...body.map(line)].join("\n");
}

export function renderSummary(rows: readonly CaseRow[], totalMicrocents: number, skipped: readonly string[]) {
  const passed = rows.filter((row) => row.pass).length;
  const lines = [`${passed}/${rows.length} passed, total cost US$${microcentsToUsd(totalMicrocents).toFixed(4)}`];
  if (skipped.length) lines.push(`not run (spend cap): ${skipped.join(", ")}`);
  return lines.join("\n");
}
