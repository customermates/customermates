import { describe, expect, it } from "vitest";

import type { RecordFieldView, RecordRelationship } from "@/features/records/record-model.schema";
import type { CommandEnvironment } from "@/components/keyboard/command-registry";
import type { PaletteTranslator } from "../palette-entries";
import { recordEntries, staticEntries, workspaceEntries, workspaceSwitchEntries } from "../palette-entries";
import { rankCandidates } from "../command-palette-search";

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
      otherWorkspaces: false,
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
    expect(entries.some((entry) => entry.key === "cmd:action.switchWorkspace")).toBe(false);
    expect(entries.find((entry) => entry.key === "cmd:action.createWorkspace")?.run).toEqual({
      kind: "action",
      action: "createWorkspace",
    });
  });

  it("opens the list of other workspaces as a level of its own", () => {
    const entries = staticEntries(t, {
      appMode: "cloud",
      canManageSchema: false,
      onListPage: false,
      otherWorkspaces: true,
      can: () => true,
    });
    expect(entries.find((entry) => entry.key === "cmd:action.switchWorkspace")?.run).toEqual({
      kind: "level",
      level: { kind: "workspaces", label: "CommandPalette.labels.switchWorkspace" },
    });
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
        hasLists: true,
        types: [
          {
            id: DEALS,
            label: "Deal",
            pluralLabel: "Deals",
            icon: "handshake",
            canCreate: true,
          },
          {
            id: CONTACTS,
            label: "Contact",
            pluralLabel: "Contacts",
            icon: "user",
            canCreate: false,
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

describe("workspace switch palette entries", () => {
  const workspaces = [
    { companyId: "company-a", name: "Acme Workspace" },
    { companyId: "company-b", name: "Beta Studio" },
  ];

  it("offers one switch action per other workspace", () => {
    expect(workspaceSwitchEntries(t, workspaces)).toEqual([
      expect.objectContaining({
        key: "workspace:company-a",
        kind: "action",
        label: "Workspaces.switchTo:Acme Workspace",
        keywords: ["Acme Workspace"],
        run: { kind: "switchWorkspace", companyId: "company-a" },
      }),
      expect.objectContaining({
        key: "workspace:company-b",
        run: { kind: "switchWorkspace", companyId: "company-b" },
      }),
    ]);
  });

  it("finds the matching workspaces by name", () => {
    const keys = rankCandidates("studio", workspaceSwitchEntries(t, workspaces), null).map((entry) => entry.key);
    expect(keys).toEqual(["workspace:company-b"]);
  });

  it("offers nothing when the person has no other workspace", () => {
    expect(workspaceSwitchEntries(t, [])).toEqual([]);
  });
});
