import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";

import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itLocale from "@/i18n/locales/it.json";

import { AgentActivityDescriptorSchema, agentActivityCopy, describeAgentTool } from "../agent-activity";
import { internalToolIdentity } from "../tool-identity";

const CATALOGS = { de, en, es, fr, it: itLocale } as const;
const translatorFor = (locale: keyof typeof CATALOGS) => {
  const translate = createTranslator({ locale, messages: CATALOGS[locale] });
  return (key: string, values?: Record<string, string | number>) =>
    (translate as unknown as (key: string, values?: Record<string, string | number>) => string)(key, values);
};
const enT = translatorFor("en");
const deT = translatorFor("de");

const wiki = (input: unknown, surface?: "chat" | "routine") =>
  describeAgentTool(internalToolIdentity("manage_wiki_pages"), input, surface);

const UPDATE = { action: "update", id: "page-1", title: "Refund policy", markdown: "Updated" };
const DELETE = { action: "delete", id: "page-1", title: "Refund policy" };
const CREATE = {
  action: "create",
  pages: [
    { title: "Refund policy", markdown: "A" },
    { title: "Pricing", markdown: "B" },
  ],
};

describe("Knowledge Base proposal activity", () => {
  it("describes routine writes as proposals, not as changed pages", () => {
    expect(wiki(UPDATE, "routine")).toMatchObject({
      kind: "proposals.update",
      resource: "wiki",
      risk: "write",
      count: 1,
    });
    expect(wiki(DELETE, "routine")).toMatchObject({
      kind: "proposals.delete",
      resource: "wiki",
      risk: "write",
      count: 1,
    });
    expect(wiki(DELETE, "routine").consequence).toBeUndefined();
    expect(wiki(CREATE, "routine")).toMatchObject({
      kind: "proposals.create",
      resource: "wiki",
      risk: "write",
      count: 2,
    });
  });

  it("keeps direct chat writes and routine reads unchanged", () => {
    expect(wiki(UPDATE, "chat")).toMatchObject({ kind: "records.update", count: 1 });
    expect(wiki(UPDATE)).toMatchObject({ kind: "records.update", count: 1 });
    expect(wiki(DELETE, "chat")).toMatchObject({ kind: "records.delete", risk: "sensitive" });
    expect(wiki(CREATE, "chat")).toMatchObject({ kind: "records.create", count: 2 });
    expect(wiki({ action: "search", query: "refunds" }, "routine")).toMatchObject({ kind: "records.read" });
    expect(describeAgentTool(internalToolIdentity("manage_routines"), { action: "create" }, "routine").kind).toBe(
      "routines.create",
    );
  });

  it("round-trips the proposal kinds through the persisted descriptor schema", () => {
    for (const input of [UPDATE, DELETE, CREATE])
      expect(AgentActivityDescriptorSchema.safeParse(wiki(input, "routine")).success).toBe(true);
  });

  it("reads as a proposed page edit or deletion in English", () => {
    expect(agentActivityCopy(wiki(UPDATE, "routine"), enT)).toMatchObject({
      running: "Proposing a page edit · Refund policy",
      done: "Proposed a page edit · Refund policy",
      error: "Couldn’t propose a page edit · Refund policy",
    });
    expect(agentActivityCopy(wiki(DELETE, "routine"), enT).done).toBe("Proposed a page deletion · Refund policy");
    expect(agentActivityCopy(wiki(CREATE, "routine"), enT).done).toBe("Proposed 2 new pages · Refund policy, Pricing");
    expect(agentActivityCopy(wiki(UPDATE, "chat"), enT).done).toBe("Updated 1 Knowledge Base page · Refund policy");
  });

  it("reads as a proposal in German", () => {
    expect(agentActivityCopy(wiki(UPDATE, "routine"), deT).done).toBe(
      "Seitenbearbeitung vorgeschlagen · Refund policy",
    );
    expect(agentActivityCopy(wiki(DELETE, "routine"), deT).done).toBe("Seitenlöschung vorgeschlagen · Refund policy");
  });

  it.each(Object.keys(CATALOGS) as (keyof typeof CATALOGS)[])("has proposal copy in %s", (locale) => {
    const t = translatorFor(locale);
    for (const input of [UPDATE, DELETE, CREATE]) {
      const copy = agentActivityCopy(wiki(input, "routine"), t);
      for (const text of [copy.running, copy.done, copy.error]) expect(text).not.toMatch(/AgentChat\.|\{|\}/);
      expect(copy.done).not.toBe(agentActivityCopy(wiki(input, "chat"), t).done);
    }
  });
});
