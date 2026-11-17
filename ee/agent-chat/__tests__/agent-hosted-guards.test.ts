import { describe, expect, it } from "vitest";

import { ROUTINE_DRAFT_GUARD_MESSAGE, hostedToolInput, hostedToolInputGuard } from "../agent-hosted-guards";
import { normalizeAgentAiToolInput, withTurnLocale } from "../agent-tools";

describe("hosted tool input guards", () => {
  it("refuses a routine create that leaves enabled unstated and accepts an explicit choice", async () => {
    expect(hostedToolInputGuard("manage_routines", { action: "create", name: "n" })).toBe(ROUTINE_DRAFT_GUARD_MESSAGE);
    expect(hostedToolInputGuard("manage_routines", { action: "create", enabled: false })).toBeNull();
    expect(hostedToolInputGuard("manage_routines", { action: "create", enabled: true })).toBeNull();
    expect(hostedToolInputGuard("manage_routines", { action: "update", id: "x" })).toBeNull();
    expect(hostedToolInputGuard("create_contacts", { contacts: [] })).toBeNull();

    const refused = await normalizeAgentAiToolInput(
      "manage_routines",
      {
        action: "create",
        name: "Stale deals",
        prompt: "List stale deals",
        triggerKind: "schedule",
        cronExpression: "0 9 * * 1",
      },
      6000,
    );
    expect(refused).toEqual({ ok: false, result: ROUTINE_DRAFT_GUARD_MESSAGE });

    const drafted = await normalizeAgentAiToolInput(
      "manage_routines",
      {
        action: "create",
        name: "Stale deals",
        prompt: "List stale deals",
        triggerKind: "schedule",
        cronExpression: "0 9 * * 1",
        enabled: false,
      },
      6000,
    );
    expect(drafted).toMatchObject({ ok: true, input: { enabled: false } });
  });

  it("injects the turn locale into docs reads the model left unlocalized", async () => {
    expect(withTurnLocale("search_docs", { query: "webhooks" }, "de")).toEqual({ query: "webhooks", locale: "de" });
    expect(withTurnLocale("search_docs", { query: "webhooks", locale: "en" }, "de")).toEqual({
      query: "webhooks",
      locale: "en",
    });
    expect(withTurnLocale("search_docs", { query: "webhooks" }, "xx")).toEqual({ query: "webhooks" });
    expect(withTurnLocale("list_records", { entity: "deal" }, "de")).toEqual({ entity: "deal" });

    const german = await normalizeAgentAiToolInput("get_docs_page", { slug: "app-routines" }, 6000, { locale: "de" });
    expect(german).toMatchObject({ ok: true, input: { locale: "de" } });
    const fallback = await normalizeAgentAiToolInput("get_docs_page", { slug: "app-routines" }, 6000, {});
    expect(fallback).toMatchObject({ ok: true, input: { locale: "en" } });
  });

  it("keeps a Knowledge Base read within the size one hosted tool result holds", () => {
    const read = { action: "get", id: "page", offset: 0 };

    expect(hostedToolInput("manage_wiki_pages", { ...read, maxChars: 20_000 }, 6_000)).toEqual(read);
    expect(hostedToolInput("manage_wiki_pages", { ...read, maxChars: "20000" }, 6_000)).toEqual(read);
    expect(hostedToolInput("manage_wiki_pages", { ...read, maxChars: 5_500 }, 6_000)).toEqual({
      ...read,
      maxChars: 5_500,
    });
    expect(hostedToolInput("manage_wiki_pages", { ...read, maxChars: 3_000 }, 6_000)).toEqual({
      ...read,
      maxChars: 3_000,
    });
    expect(hostedToolInput("manage_wiki_pages", read, 6_000)).toBe(read);
    expect(hostedToolInput("fetch", { id: "wiki:page", maxChars: 20_000 }, 6_000)).toEqual({
      id: "wiki:page",
      maxChars: 20_000,
    });
    expect(hostedToolInput("manage_wiki_pages", null, 6_000)).toBeNull();
  });
});
