import { describe, expect, it } from "vitest";

import type { RecordFieldView, RecordRelationship } from "@/features/records/record-model.schema";
import type { CommandEnvironment } from "@/components/keyboard/command-registry";
import type { PaletteTranslator } from "../palette-entries";
import { recordEntries, staticEntries, workspaceEntries } from "../palette-entries";

const t: PaletteTranslator = (key, values) =>
  key.startsWith("CommandPalette.synonyms.") ? "one, two" : values ? `${key}:${Object.values(values).join("|")}` : key;

const DEALS = "00000000-0000-4000-8000-000000000001";
const CONTACTS = "00000000-0000-4000-8000-000000000002";

function field(id: string, valueType: RecordFieldView["valueType"], extra: Partial<RecordFieldView> = {}) {
  return {
    id,
    typeId: DEALS,
    label: id,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 0,
    ...extra,
  } as unknown as RecordFieldView;
}

const relationship = {
  id: "rel",
  sourceTypeId: DEALS,
  targetTypeId: CONTACTS,
  sourceLabel: "Contacts",
  targetLabel: "Deals",
  sourceCardinality: "many",
  targetCardinality: "many",
  archived: false,
} as unknown as RecordRelationship;

describe("static palette entries", () => {
  it("builds labelled, deep-linked entries for what the person may open", () => {
    const environment: CommandEnvironment = {
      appMode: "cloud",
      canManageSchema: false,
      onListPage: false,
      can: () => true,
    };
    const entries = staticEntries(t, environment);
    const theme = entries.find((entry) => entry.key === "cmd:setting.profile.theme");
    expect(theme).toMatchObject({
      label: "Common.inputs.theme",
      keywords: ["one", "two"],
      subtitle: "SettingsNav.profile",
      run: { kind: "href", href: "/settings/profile?focus=control%3Asettings-profile-theme" },
    });
    expect(entries.some((entry) => entry.key === "cmd:page.configure")).toBe(false);
    expect(entries.find((entry) => entry.key === "cmd:action.add")?.shortcut).toBe("add");
  });
});

describe("workspace palette entries", () => {
  it("attaches views to their list and creates one add command per creatable list", () => {
    const entries = workspaceEntries(
      t,
      {
        companyId: "00000000-0000-4000-8000-000000000009",
        schemaRevision: 3,
        canManageSchema: true,
        types: [
          {
            id: DEALS,
            label: "Deal",
            pluralLabel: "Deals",
            icon: "handshake",
            canCreate: true,
            hasAuthorizationTasks: false,
          },
          {
            id: CONTACTS,
            label: "Contact",
            pluralLabel: "Contacts",
            icon: "user",
            canCreate: false,
            hasAuthorizationTasks: false,
          },
        ],
      },
      {
        schemaRevision: 3,
        views: [{ typeId: DEALS, id: "view-1", name: "Open deals" }],
        fields: [{ typeId: DEALS, id: "field-1", label: "Stage" }],
      },
    );
    expect(entries.find((entry) => entry.key === "view:view-1")).toMatchObject({
      listKey: `list:${DEALS}`,
      run: { kind: "href", href: `/records/${DEALS}?view=view-1&focus=view%3Aview-1` },
    });
    expect(entries.find((entry) => entry.key === "field:field-1")?.run).toEqual({
      kind: "href",
      href: `/configure?typeId=${DEALS}&tab=fields&focus=field%3Afield-1`,
    });
    expect(entries.filter((entry) => entry.key.startsWith("create:")).map((entry) => entry.key)).toEqual([
      `create:${DEALS}`,
    ]);
  });
});

describe("record palette entries", () => {
  it("offers pickers for choice, yes/no and member fields, links, assignment and delete", () => {
    const entries = recordEntries(t, {
      typeId: DEALS,
      title: "Acme",
      fields: [
        field("stage", "select", {
          options: [{ id: "won", label: "Won", color: null, attributes: [] }],
        } as Partial<RecordFieldView>),
        field("owner", "member"),
        field("closed", "boolean"),
        field("amount", "number"),
        field("total", "select", { behavior: { kind: "calculated" } } as unknown as Partial<RecordFieldView>),
      ],
      relationships: [relationship, { ...relationship, id: "gone", archived: true }],
      typeLabels: new Map([
        [DEALS, "Deal"],
        [CONTACTS, "Contact"],
      ]),
      canDelete: true,
      canAssign: true,
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      "record:field:stage",
      "record:field:owner",
      "record:field:closed",
      "record:assign",
      "record:link:rel:outgoing",
      "record:delete",
    ]);
    expect(entries.find((entry) => entry.key === "record:link:rel:outgoing")?.label).toBe(
      "CommandPalette.record.addTo:Contact",
    );
    expect(entries.at(-1)).toMatchObject({ destructive: true, label: "CommandPalette.record.deleteNamed:Acme" });
  });

  it("offers nothing without an editable record", () => {
    expect(recordEntries(t, null)).toEqual([]);
  });
});
