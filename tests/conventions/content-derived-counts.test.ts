import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveDerivedToken,
  resolveDerivedTokens,
} from "@/core/content/derived-tokens";
import {
  MCP_ALWAYS_ON_TOOLS,
  MCP_GROUPED_TOOL_COUNT,
  MCP_TOOL_COUNT,
  MCP_TOOL_GROUPS,
  MCP_TOOLSET_COUNT,
} from "@/features/mcp-tools/tool-registry";
import { WEBHOOK_EVENT_COUNT } from "@/features/webhook/webhook-event-registry";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;
const REGISTRY_FILE = join("features", "mcp-tools", "tool-registry.ts");
const TOOL_NAME_PATTERN = /^ {2}name: ["']([a-z0-9_]+)["'],?$/gm;
const TOOL_COUNT_CLAIM =
  /\b(\d{1,3})(?:-tool[- ]mcp\b|\s+(?:(?:mcp[- ])?(?:tools|werkzeuge)\b|\[mcp\]\([^)]+\)\s*(?:tools|werkzeuge)\b|\[(?:mcp[- ])?(?:tools|werkzeuge)\]\([^)]+\)))/gi;
const TOOLSET_COUNT_CLAIM =
  /\b(eight|nine|ten|eleven|twelve|acht|neun|zehn|elf|zwölf|\d{1,2})\s+toolsets\b/gi;
const WEBHOOK_COUNT_CLAIM =
  /\b(\d{1,3})\s+(?:webhooks?\b|webhook[- ]?(?:events?(?: types?)?|eventtypen|ereignisse|ereignistypen)\b|\[(?:webhook[- ])?(?:events|ereignisse)\]\([^)]+\))/gi;
const APPROXIMATION =
  /(over|above|more than|approximately|around|about|nearly|up to|beyond|über|mehr als|rund|etwa|circa|ca\.|bis zu|microsoft|office|dynamics|~|\+)\s*$/i;
const HISTORICAL_CONTEXT =
  /\b(?:in|during|from|through|as of|im|während|von|bis|stand)\s+(?:20\d{2}|Q[1-4]\s+20\d{2})\b|\b(?:historically|previously|formerly|damals|historisch|früher)\b/i;
const CURRENT_CUSTOMERMATES_CONTEXT = /\bCustomermates\b|\[\[derived\./i;
const CURRENT_SUBJECT_CONTINUATION =
  /^\s*(?:but|aber|doch|jedoch)\s+(?:(?:it|es)\s+)?(?:now|today|currently|jetzt|heute|aktuell)\b/i;

function claimClause(
  line: string,
  matchIndex: number,
): { text: string; priorText: string } {
  const boundaries = [
    ...line.matchAll(
      /[;!?|]|\.(?=\s|$)|,(?=\s*(?:but|while|whereas|aber|während|wohingegen|doch|jedoch)\b)/giu,
    ),
  ].map((match) => match.index);
  const start =
    [...boundaries].reverse().find((index) => index < matchIndex) ?? -1;
  const end = boundaries.find((index) => index >= matchIndex) ?? line.length;
  return {
    text: line.slice(start + 1, end),
    priorText: line.slice(0, start),
  };
}

function scanLine(
  line: string,
  claim: RegExp,
  isViolation: (match: RegExpMatchArray) => string | null,
): string[] {
  const violations: string[] = [];
  for (const match of line.matchAll(claim)) {
    const matchIndex = match.index ?? 0;
    const clause = claimClause(line, matchIndex);
    const clauseMatchIndex = clause.text.indexOf(match[0]);
    if (
      APPROXIMATION.test(
        clause.text.slice(0, clauseMatchIndex >= 0 ? clauseMatchIndex : 0),
      )
    )
      continue;
    if (HISTORICAL_CONTEXT.test(clause.text)) continue;
    const ownsClaim =
      CURRENT_CUSTOMERMATES_CONTEXT.test(clause.text) ||
      (CURRENT_SUBJECT_CONTINUATION.test(clause.text) &&
        CURRENT_CUSTOMERMATES_CONTEXT.test(clause.priorText));
    if (!ownsClaim) continue;
    const problem = isViolation(match);
    if (problem) violations.push(problem);
  }
  return violations;
}

function registeredToolNames(): Set<string> {
  const names = new Set<string>();
  const files = walkFiles(join(REPO_ROOT, "features", "mcp-tools"), (path) =>
    path.endsWith(".mcp-tools.ts"),
  );
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(TOOL_NAME_PATTERN))
      names.add(match[1]);
  }
  return names;
}

function contentFiles(): string[] {
  return walkFiles(join(REPO_ROOT, "content"), (path) => path.endsWith(".mdx"));
}

function scanContent(
  claim: RegExp,
  isViolation: (match: RegExpMatchArray) => string | null,
): string[] {
  const violations: string[] = [];
  for (const path of contentFiles()) {
    const file = relative(REPO_ROOT, path);
    readFileSync(path, "utf8")
      .split("\n")
      .forEach((line, index) => {
        violations.push(
          ...scanLine(line, claim, isViolation).map(
            (problem) => `${file}:${index + 1} ${problem}`,
          ),
        );
      });
  }
  return violations;
}

describe("counts stated in content derive from product source", () => {
  it("preserves explicitly historical and third-party count observations", () => {
    expect(
      HISTORICAL_CONTEXT.test("In 2025, Customermates exposed 40 MCP tools."),
    ).toBe(true);
    expect(
      CURRENT_CUSTOMERMATES_CONTEXT.test("Competitor X exposes 40 MCP tools."),
    ).toBe(false);
    expect(
      scanLine(
        "Customermates exposes [[derived.mcp.tools.total]] MCP tools, while Rival exposes 40 MCP tools.",
        TOOL_COUNT_CLAIM,
        (match) => match[0],
      ),
    ).toEqual([]);
    expect(
      scanLine(
        "Customermates exposed 40 MCP tools in 2025, but now exposes 50 MCP tools.",
        TOOL_COUNT_CLAIM,
        (match) => match[0],
      ),
    ).toEqual(["50 MCP tools"]);
    expect(
      scanLine(
        "Customermates exposes 40 MCP tools.",
        TOOL_COUNT_CLAIM,
        (match) => match[0],
      ),
    ).toEqual(["40 MCP tools"]);
  });

  it("resolves every derived fact token", () => {
    const violations: string[] = [];
    for (const path of contentFiles()) {
      const text = readFileSync(path, "utf8");
      if (!text.includes("[[derived.")) continue;
      try {
        resolveDerivedTokens(text);
      } catch (error) {
        violations.push(
          `${relative(REPO_ROOT, path)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "resolves one MCP tool count from the registry",
    () => {
      const registered = registeredToolNames();
      expect(registered.size).toBeGreaterThan(0);
      expect(
        MCP_TOOL_COUNT,
        `${REGISTRY_FILE} must bind every exported tool once`,
      ).toBe(registered.size);
      expect(Number(resolveDerivedToken("mcp.tools.total"))).toBe(
        MCP_TOOL_COUNT,
      );
      expect(Number(resolveDerivedToken("mcp.tools.grouped"))).toBe(
        MCP_GROUPED_TOOL_COUNT,
      );
      expect(Number(resolveDerivedToken("mcp.tools.alwaysOn"))).toBe(
        MCP_ALWAYS_ON_TOOLS.length,
      );
      expect(Number(resolveDerivedToken("mcp.toolsets.count"))).toBe(
        MCP_TOOLSET_COUNT,
      );
      for (const [group, tools] of Object.entries(MCP_TOOL_GROUPS)) {
        expect(Number(resolveDerivedToken(`mcp.tools.groups.${group}`))).toBe(
          tools.length,
        );
      }
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "states no handwritten MCP tool count",
    () => {
      const violations = scanContent(
        TOOL_COUNT_CLAIM,
        (match) =>
          `states literal "${match[0].trim()}"; use a derived MCP count token`,
      );
      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "states no handwritten toolset count",
    () => {
      const violations = scanContent(
        TOOLSET_COUNT_CLAIM,
        (match) =>
          `states literal "${match[0].trim()}"; use the derived MCP toolset token`,
      );
      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "states no handwritten webhook event count",
    () => {
      expect(WEBHOOK_EVENT_COUNT).toBeGreaterThan(0);
      const violations = scanContent(
        WEBHOOK_COUNT_CLAIM,
        (match) =>
          `states literal "${match[0].trim()}"; use a derived webhook count token`,
      );
      expect(violations, violations.join("\n")).toEqual([]);
    },
  );
});
