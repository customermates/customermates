import { describe, expect, it } from "vitest";

import {
  AGENT_SYSTEM_CACHE_CONTROL,
  AGENT_TOOLS_CACHE_CONTROL,
  agentSystemInstructions,
  agentToolsCacheBreakpoint,
  orderAgentToolsForCache,
} from "../agent-prompt-cache";
import {
  agentToolDefinitionsForToolsets,
  agentToolDefinitionsForTurn,
  getAgentAiToolDefinitions,
} from "../agent-tools";
import { AGENT_ON_DEMAND_TOOLSETS, activeAgentToolNames } from "../agent-toolset-routing";
import { agentWikiSystemPrompt } from "../agent-wiki-context";
import { agentSystemPromptParts } from "../system-prompt";

const SERVING_PROVIDER = "vertexAnthropic";
const CONDITIONAL = ["web_search", "import_website"];

function group(definition: { name: string; toolset: string | null }) {
  if (definition.toolset) return definition.toolset;
  return CONDITIONAL.includes(definition.name) ? "conditional" : "core";
}

function cachedPrefix(definitions: readonly { name: string; toolset: string | null }[]) {
  const breakpoint = agentToolsCacheBreakpoint(definitions);
  return definitions.slice(0, definitions.findIndex((definition) => definition.name === breakpoint) + 1);
}

describe("agent tool order for prompt caching", () => {
  it("sends the core tools first, then the tools a turn option adds, then each on-demand set in a fixed order", () => {
    const definitions = agentToolDefinitionsForTurn({
      servingProvider: SERVING_PROVIDER,
      surface: "chat",
      webSearchEnabled: true,
      wikiWebsiteSetup: true,
    });
    const groups = definitions.map(group).filter((value, index, all) => index === 0 || all[index - 1] !== value);

    expect(groups).toEqual(["core", "conditional", ...AGENT_ON_DEMAND_TOOLSETS]);
    const registryOrder = getAgentAiToolDefinitions(SERVING_PROVIDER, { surface: "chat", webSearchEnabled: true }).map(
      ({ name }) => name,
    );
    const core = definitions.filter((definition) => group(definition) === "core").map(({ name }) => name);
    expect(core).toEqual(registryOrder.filter((name) => core.includes(name)));
  });

  it.each(["chat", "routine"] as const)(
    "keeps the cached %s tool prefix byte-identical whatever the turn adds after it",
    (surface) => {
      const variants = [false, true].flatMap((webSearchEnabled) =>
        [false, true].map((wikiWebsiteSetup) =>
          agentToolDefinitionsForTurn({
            servingProvider: SERVING_PROVIDER,
            surface,
            webSearchEnabled,
            wikiWebsiteSetup,
          }),
        ),
      );
      const prefixes = variants.flatMap((definitions) => [
        cachedPrefix(definitions),
        cachedPrefix(agentToolDefinitionsForToolsets(definitions, [])),
        cachedPrefix(agentToolDefinitionsForToolsets(definitions, ["record-model", "messaging"])),
        cachedPrefix(agentToolDefinitionsForToolsets(definitions, [...AGENT_ON_DEMAND_TOOLSETS])),
      ]);

      expect(prefixes[0]?.length).toBeGreaterThan(20);
      expect(prefixes[0]?.every((definition) => group(definition) === "core")).toBe(true);
      for (const prefix of prefixes) expect(JSON.stringify(prefix)).toBe(JSON.stringify(prefixes[0]));
    },
  );

  it.each(["chat", "routine"] as const)(
    "keeps the active %s tools' cached prefix byte-identical as on-demand sets load, up to every set",
    (surface) => {
      const definitions = agentToolDefinitionsForTurn({
        servingProvider: SERVING_PROVIDER,
        surface,
        webSearchEnabled: true,
      });
      const active = (initialToolsets: string[]) => {
        const names = activeAgentToolNames({ tools: definitions, initialToolsets, messages: [] });
        return definitions.filter((definition) => names.includes(definition.name));
      };
      const prefix = JSON.stringify(cachedPrefix(active([])));

      expect(prefix).toContain("load_toolset");
      expect(JSON.stringify(cachedPrefix(active(["messaging"])))).toBe(prefix);
      expect(JSON.stringify(cachedPrefix(active([...AGENT_ON_DEMAND_TOOLSETS])))).toBe(prefix);
    },
  );

  it("marks the last core tool, which stays active when every on-demand set is loaded", () => {
    const definitions = agentToolDefinitionsForTurn({ servingProvider: SERVING_PROVIDER, surface: "chat" });
    const breakpoint = agentToolsCacheBreakpoint(definitions);

    expect(breakpoint).toBe(definitions.filter((definition) => group(definition) === "core").at(-1)?.name);
    for (const initialToolsets of [[], ["messaging"], [...AGENT_ON_DEMAND_TOOLSETS]])
      expect(activeAgentToolNames({ tools: definitions, initialToolsets, messages: [] })).toContain(breakpoint);
    expect(AGENT_TOOLS_CACHE_CONTROL).toEqual({ anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } } });
  });

  it("keeps the incoming order within each group", () => {
    const tools = [
      { name: "manage_routines", toolset: "routines" },
      { name: "b", toolset: null },
      { name: "web_search", toolset: null },
      { name: "manage_data_views", toolset: "views" },
      { name: "a", toolset: null },
      { name: "configure_record_model", toolset: "record-model" },
    ];

    expect(orderAgentToolsForCache(tools).map(({ name }) => name)).toEqual([
      "b",
      "a",
      "web_search",
      "configure_record_model",
      "manage_data_views",
      "manage_routines",
    ]);
    expect(agentToolsCacheBreakpoint(tools)).toBe("a");
    expect(agentToolsCacheBreakpoint([{ name: "web_search", toolset: null }])).toBeNull();
  });
});

describe("agent system prompt blocks for prompt caching", () => {
  const catalog = JSON.stringify({
    wiki: { total: 1, items: [{ id: "page", cite: "[Voice](x)", summary: "Plain." }] },
  });

  it("caches the stable instructions and sends the per-user rest after them, joining back to the same prompt", () => {
    const parts = agentSystemPromptParts({ userName: "Ada Lovelace", locale: "en", surface: "chat" });
    const system = agentWikiSystemPrompt(parts, catalog);
    const instructions = agentSystemInstructions(system, parts.stable);

    expect(instructions).toEqual([
      { role: "system", content: parts.stable, providerOptions: AGENT_SYSTEM_CACHE_CONTROL },
      { role: "system", content: system.slice(parts.stable.length + 2) },
    ]);
    expect(instructions.map(({ content }) => content).join("\n\n")).toBe(system);
    expect(instructions[0]?.content).not.toContain("Ada Lovelace");
    expect(instructions[0]?.content).not.toContain(new Date().toISOString().slice(0, 10));
    expect(instructions[1]?.content).toContain("Ada Lovelace");
    expect(instructions[1]?.content).toContain("workspace_wiki_reference");
  });

  it("shares the cached block between users and keeps a compaction checkpoint out of it", () => {
    const ada = agentSystemPromptParts({ userName: "Ada Lovelace", locale: "en", surface: "routine" });
    const grace = agentSystemPromptParts({ userName: "Grace Hopper", locale: "de", surface: "routine" });
    const compacted = `${agentWikiSystemPrompt(grace, catalog)}\n\n<agent_continuation_checkpoint>{}</agent_continuation_checkpoint>`;
    const [stable, rest] = agentSystemInstructions(compacted, grace.stable);

    expect(grace.stable).toBe(ada.stable);
    expect(stable?.content).toBe(ada.stable);
    expect(rest?.content.endsWith("</agent_continuation_checkpoint>")).toBe(true);
  });

  it("sends one uncached block when the prompt does not start with the stable instructions", () => {
    expect(agentSystemInstructions("Other instructions", "Stable")).toEqual([
      { role: "system", content: "Other instructions" },
    ]);
    expect(agentSystemInstructions("Stable", "Stable")).toEqual([{ role: "system", content: "Stable" }]);
    expect(agentSystemInstructions("Stable\n\nrest", "")).toEqual([{ role: "system", content: "Stable\n\nrest" }]);
  });
});
