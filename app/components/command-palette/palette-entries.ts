import type { LucideIcon } from "lucide-react";
import type { ShortcutId } from "@/components/keyboard/shortcut-registry";
import type { CommandActionId, CommandEnvironment } from "@/components/keyboard/command-registry";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import type { CommandCatalog } from "@/features/command-palette/command-catalog.schema";
import type { RecordFieldView, RecordRelationship } from "@/features/records/record-model.schema";
import type { PaletteLevel } from "@/app/components/global-search-modal.store";
import type { PaletteCandidate } from "./command-palette-search";

import { Layers, Link2, ListChecks, Plus, SquarePen, Trash2, UserRoundCheck } from "lucide-react";

import { commandAvailable, STATIC_COMMANDS, staticCommand } from "@/components/keyboard/command-registry";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { focusHref } from "@/components/focus/focus-href";
import { isRecordFieldWritable } from "@/features/records/record-input-value";

export type PaletteRun =
  | { kind: "href"; href: string }
  | { kind: "action"; action: CommandActionId }
  | { kind: "create"; typeId: string }
  | { kind: "level"; level: PaletteLevel }
  | { kind: "deleteRecord" };

export type PaletteEntry = PaletteCandidate & {
  icon: LucideIcon;
  subtitle?: string;
  shortcut?: ShortcutId;
  destructive?: boolean;
  run: PaletteRun;
};

export type PaletteTranslator = (key: string, values?: Record<string, string>) => string;

export type PaletteRecordContext = {
  typeId: string;
  title: string | null;
  fields: readonly RecordFieldView[];
  relationships: readonly RecordRelationship[];
  typeLabels: ReadonlyMap<string, string>;
  canDelete: boolean;
  canAssign: boolean;
};

export function commandSynonyms(t: PaletteTranslator, id: string): string[] {
  return t(`CommandPalette.synonyms.${id}`)
    .split(",")
    .map((synonym) => synonym.trim())
    .filter(Boolean);
}

export function staticEntries(t: PaletteTranslator, environment: CommandEnvironment): PaletteEntry[] {
  return STATIC_COMMANDS.filter((entry) => commandAvailable(entry, environment)).map((entry) => {
    const parent = entry.parentId ? staticCommand(entry.parentId) : undefined;
    return {
      key: `cmd:${entry.id}`,
      kind: entry.kind,
      label: t(entry.labelKey),
      keywords: commandSynonyms(t, entry.id),
      icon: entry.icon,
      subtitle: parent ? t(parent.labelKey) : undefined,
      shortcut: entry.shortcut,
      run:
        "action" in entry.target
          ? { kind: "action", action: entry.target.action }
          : {
              kind: "href",
              href:
                "control" in entry.target
                  ? focusHref({ kind: "control", id: entry.target.control })
                  : entry.target.href,
            },
    };
  });
}

export function workspaceEntries(
  t: PaletteTranslator,
  navigation: RecordNavigation | null,
  catalog: CommandCatalog | null,
): PaletteEntry[] {
  const types = navigation?.types ?? [];
  const lists: PaletteEntry[] = types.map((type) => ({
    key: `list:${type.id}`,
    kind: "list",
    label: type.pluralLabel,
    keywords: [type.label],
    icon: recordTypeIcon(type.icon),
    run: { kind: "href", href: `/records/${type.id}` },
  }));
  const views: PaletteEntry[] = (catalog?.views ?? []).flatMap((view) => {
    const type = types.find((candidate) => candidate.id === view.typeId);
    if (!type) return [];
    return [
      {
        key: `view:${view.id}`,
        kind: "view",
        label: view.name,
        keywords: [],
        listKey: `list:${type.id}`,
        icon: Layers,
        subtitle: type.pluralLabel,
        run: { kind: "href", href: focusHref({ kind: "view", id: view.id, typeId: type.id }) },
      },
    ];
  });
  const fields: PaletteEntry[] = (catalog?.fields ?? []).flatMap((field) => {
    const type = types.find((candidate) => candidate.id === field.typeId);
    if (!type) return [];
    return [
      {
        key: `field:${field.id}`,
        kind: "field",
        label: field.label,
        keywords: [],
        icon: ListChecks,
        subtitle: t("CommandPalette.fieldOf", { list: type.pluralLabel }),
        run: { kind: "href", href: focusHref({ kind: "field", id: field.id, typeId: type.id }) },
      },
    ];
  });
  const creates: PaletteEntry[] = types
    .filter((type) => type.canCreate)
    .map((type) => ({
      key: `create:${type.id}`,
      kind: "action",
      label: t("NavigationBar.addEntity", { entity: type.label }),
      keywords: [type.pluralLabel],
      icon: Plus,
      run: { kind: "create", typeId: type.id },
    }));
  return [...lists, ...views, ...fields, ...creates];
}

export function recordEntries(t: PaletteTranslator, context: PaletteRecordContext | null): PaletteEntry[] {
  if (!context) return [];
  const changes: PaletteEntry[] = context.fields
    .filter(
      (field) =>
        isRecordFieldWritable(field) &&
        ((field.valueType === "select" && field.options.length > 0) ||
          field.valueType === "boolean" ||
          field.valueType === "member"),
    )
    .map((field) => {
      const label = t("CommandPalette.record.change", { field: field.label });
      return {
        key: `record:field:${field.id}`,
        kind: "action",
        contextual: true,
        label,
        keywords: [field.label],
        icon: SquarePen,
        run: { kind: "level", level: { kind: "field", fieldId: field.id, label } },
      };
    });
  const assignLabel = t("CommandPalette.record.assign");
  const assign: PaletteEntry[] = context.canAssign
    ? [
        {
          key: "record:assign",
          kind: "action",
          contextual: true,
          label: assignLabel,
          keywords: [t("RecordModel.assignedTo")],
          icon: UserRoundCheck,
          run: { kind: "level", level: { kind: "assign", label: assignLabel } },
        },
      ]
    : [];
  const links: PaletteEntry[] = context.relationships
    .filter((relationship) => !relationship.archived)
    .flatMap((relationship) =>
      (["outgoing", "incoming"] as const).flatMap((direction) => {
        const own = direction === "outgoing" ? relationship.sourceTypeId : relationship.targetTypeId;
        const other = direction === "outgoing" ? relationship.targetTypeId : relationship.sourceTypeId;
        const listLabel = context.typeLabels.get(other);
        if (own !== context.typeId || !listLabel) return [];
        const label = t("CommandPalette.record.addTo", { list: listLabel });
        return [
          {
            key: `record:link:${relationship.id}:${direction}`,
            kind: "action" as const,
            contextual: true,
            label,
            keywords: [direction === "outgoing" ? relationship.sourceLabel : relationship.targetLabel],
            icon: Link2,
            run: {
              kind: "level" as const,
              level: { kind: "link" as const, relationId: relationship.id, direction, label },
            },
          },
        ];
      }),
    );
  const deletion: PaletteEntry[] = context.canDelete
    ? [
        {
          key: "record:delete",
          kind: "action",
          contextual: true,
          label: context.title
            ? t("CommandPalette.record.deleteNamed", { name: context.title })
            : t("Common.actions.delete"),
          keywords: [t("Common.actions.delete")],
          icon: Trash2,
          destructive: true,
          run: { kind: "deleteRecord" },
        },
      ]
    : [];
  return [...changes, ...assign, ...links, ...deletion];
}
