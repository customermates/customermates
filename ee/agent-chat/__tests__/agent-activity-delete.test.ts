import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import it_ from "@/i18n/locales/it.json";

import { agentActivityCopy, describeAgentTool } from "../agent-activity";
import { internalToolIdentity } from "../tool-identity";

const describeInternalTool = (name: string, input: unknown) => describeAgentTool(internalToolIdentity(name), input);

const LOCALES = { en, de, fr, it: it_, es } as const;

function translatorFor(locale: keyof typeof LOCALES) {
  const t = createTranslator({ locale, messages: LOCALES[locale] });
  return (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
}

const ref = { typeId: "00000000-0000-4000-8000-000000000001", id: "00000000-0000-4000-8000-000000000002" };
const recordDelete = (extra: Record<string, unknown> = {}) => ({
  mutation: { action: "delete", ref, expectedVersion: 1, ...extra },
});
const recordDeleteMany = (extra: Record<string, unknown> = {}) => ({
  mutation: {
    action: "deleteMany",
    targets: [
      { ref, expectedVersion: 1 },
      { ref: { ...ref, id: "00000000-0000-4000-8000-000000000003" }, expectedVersion: 1 },
    ],
    ...extra,
  },
});

const trashDeletes: Array<[string, unknown]> = [
  ["mutate_crm_record delete", recordDelete()],
  ["mutate_crm_record deleteMany", recordDeleteMany()],
  ["mutate_crm_record delete with permanent: false", recordDelete({ permanent: false })],
  ["manage_wiki_pages delete", { action: "delete", id: "page" }],
  ["manage_data_views delete", { action: "delete", surfaceKey: "dashboard", viewKey: "default" }],
  ["manage_widgets delete", { action: "delete", id: "widget" }],
  ["manage_routines delete", { action: "delete", id: "routine" }],
];

function toolName(label: string) {
  return label.split(" ")[0];
}

describe("describeAgentTool deletes", () => {
  it("marks only an explicit permanent record delete as permanent", () => {
    for (const [label, input] of trashDeletes)
      expect(describeInternalTool(toolName(label), input).permanent, label).toBeUndefined();

    expect(describeInternalTool("mutate_crm_record", recordDelete({ permanent: true }))).toMatchObject({
      kind: "records.delete",
      risk: "sensitive",
      permanent: true,
      consequence: { action: "records.delete", count: 1 },
    });
    expect(describeInternalTool("mutate_crm_record", recordDeleteMany({ permanent: true }))).toMatchObject({
      kind: "records.delete",
      permanent: true,
      consequence: { action: "records.delete", count: 2 },
    });
  });

  it("does not carry record references into the descriptor", () => {
    expect(JSON.stringify(describeInternalTool("mutate_crm_record", recordDelete({ permanent: true })))).not.toContain(
      ref.id,
    );
  });
});

describe("agentActivityCopy deletes", () => {
  it("describes Trash deletes as restorable and never as permanent", () => {
    const t = translatorFor("en");
    for (const [label, input] of trashDeletes) {
      const copy = agentActivityCopy(describeInternalTool(toolName(label), input), t);
      expect(copy.approval, label).toContain("to Trash");
      expect(`${copy.approval} ${copy.detail} ${copy.done}`, label).not.toMatch(/permanent|cannot be undone/i);
      expect(copy.detail, label).toMatch(/Trash.*30 days/);
      expect(copy.detail, label).toContain("restore");
    }
    const record = agentActivityCopy(describeInternalTool("mutate_crm_record", recordDelete()), t);
    expect(record.running).toContain("to Trash");
    expect(record.done).toContain("Moved");
    expect(record.detail).toBe("You can restore it from Trash for 30 days.");
    const many = agentActivityCopy(describeInternalTool("mutate_crm_record", recordDeleteMany()), t);
    expect(many.detail).toBe("You can restore them from Trash for 30 days.");
  });

  it("uses the permanent copy only with permanent: true", () => {
    const t = translatorFor("en");
    const copy = agentActivityCopy(describeInternalTool("mutate_crm_record", recordDelete({ permanent: true })), t);
    expect(copy.approval).toMatch(/^Ready to permanently delete /);
    expect(copy.detail).toBe("This cannot be undone.");
    expect(copy.running).toMatch(/^Permanently deleting /);
    expect(copy.done).toMatch(/^Permanently deleted /);
    expect(`${copy.approval} ${copy.detail}`).not.toContain("Trash");
  });

  it("has distinct Trash and permanent copy in every locale", () => {
    for (const locale of Object.keys(LOCALES) as Array<keyof typeof LOCALES>) {
      const t = translatorFor(locale);
      for (const [label, input] of trashDeletes) {
        const copy = agentActivityCopy(describeInternalTool(toolName(label), input), t);
        expect(copy.approval, `${locale} ${label}`).not.toBe(copy.running);
        expect(copy.detail, `${locale} ${label}`).toMatch(/30/);
      }
      const trash = agentActivityCopy(describeInternalTool("mutate_crm_record", recordDelete()), t);
      const permanent = agentActivityCopy(
        describeInternalTool("mutate_crm_record", recordDelete({ permanent: true })),
        t,
      );
      expect(permanent.approval, locale).not.toBe(trash.approval);
      expect(permanent.detail, locale).not.toBe(trash.detail);
      expect(permanent.done, locale).not.toBe(trash.done);
      expect(permanent.detail, locale).not.toMatch(/30/);
    }
  });
});
