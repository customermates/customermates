"use client";

import type {
  ConfigurationChange,
  ConfigurationPreview,
  ConfigurationTarget,
  DeletionReference,
} from "@/features/records/configuration.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { ConfirmationChip, ConfirmationSentence } from "@/components/modal/confirmation-sentence";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { confirmationSentence } from "@/components/modal/confirmation-sentence";
import { focusHref } from "@/components/focus/focus-href";
import { relationshipPathColumnKey } from "@/features/records/record-column.schema";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { typeDefinition } from "./configure-model";

import { applyRecordConfigurationAction, previewRecordConfigurationAction } from "../../records/actions";

type Deletion = NonNullable<ConfigurationPreview["deletion"]>;
type Translate = ReturnType<typeof useTranslations>;
type Lifecycle = "delete" | "restore" | "deletePermanently";

const DUPLICATE_ISSUES = {
  duplicate_list_name: "RecordModel.duplicateListName",
  duplicate_field_name: "RecordModel.duplicateFieldName",
  duplicate_option_label: "RecordModel.duplicateOptionLabel",
  duplicate_relationship_label: "RecordModel.duplicateRelationshipLabel",
} as const;

function referenceChip(reference: DeletionReference, model: RecordModelView | null): ConfirmationChip {
  const typeIcon = (typeId: string | undefined) => model?.types.find((type) => type.id === typeId)?.icon ?? "list";
  if (reference.kind === "channels") {
    return {
      label: reference.label,
      icon: "field",
      href: `/configure?typeId=${reference.typeId}&tab=fields`,
    };
  }
  if (reference.kind === "type") {
    return {
      label: reference.label,
      icon: { list: typeIcon(reference.id) },
      href: focusHref({ kind: "list", id: reference.id }),
    };
  }
  if (reference.kind === "field" || reference.kind === "relationship") {
    return {
      label: reference.label,
      icon: reference.kind,
      href: focusHref({ kind: reference.kind, id: reference.id, typeId: reference.typeId }),
    };
  }
  if (reference.kind === "view") {
    return {
      label: reference.label,
      icon: "view",
      href: focusHref({ kind: "view", id: reference.id, typeId: reference.typeId }),
    };
  }
  const kind = reference.kind === "routine" || reference.kind === "webhook" ? reference.kind : "widget";
  return { label: reference.label, icon: kind, href: focusHref({ kind, id: reference.id }) };
}

export function deletionBlockerSentences(t: Translate, deletion: Deletion, model: RecordModelView | null) {
  return deletion.blockers.map((blocker) =>
    confirmationSentence((values) => t(`RecordModel.configurationDeletion.blockers.${blocker.reason}`, values), {
      source: referenceChip(blocker.source, model),
      target: referenceChip(blocker.target, model),
    }),
  );
}

function nameFieldSentence(t: Translate, entry: Deletion["cleaned"][number], model: RecordModelView | null) {
  const consumers = referenceChip(entry.consumer, model);
  return entry.replacement
    ? confirmationSentence((values) => t("RecordModel.configurationDeletion.cleaned.nameField", values), {
        consumers,
        replacement: referenceChip(entry.replacement, model),
      })
    : confirmationSentence((values) => t("RecordModel.configurationDeletion.cleaned.nameFieldNone", values), {
        consumers,
      });
}

function cleanedSentences(t: Translate, deletion: Deletion, model: RecordModelView | null): ConfirmationSentence[] {
  const groups = new Map<string, { key: string; target: DeletionReference; consumers: DeletionReference[] }>();
  const named = deletion.cleaned.filter((entry) => entry.replacement !== undefined);
  for (const entry of deletion.cleaned) {
    if (entry.replacement !== undefined) continue;
    const key =
      entry.consumer.kind === "personalLayout" || entry.consumer.kind === "detailLayout"
        ? "personalLayouts"
        : entry.consumer.kind === "view"
          ? "view"
          : entry.consumer.kind === "widget"
            ? "widget"
            : "listDefaults";
    const id = `${key}:${entry.target.kind}:${entry.target.id}`;
    const group = groups.get(id) ?? { key, target: entry.target, consumers: [] };
    if (!group.consumers.some((consumer) => consumer.kind === entry.consumer.kind && consumer.id === entry.consumer.id))
      group.consumers.push(entry.consumer);
    groups.set(id, group);
  }
  const sentences = [...groups.values()].map(({ key, target, consumers }) =>
    confirmationSentence(
      (values) => t(`RecordModel.configurationDeletion.cleaned.${key}`, { ...values, count: consumers.length }),
      key === "personalLayouts"
        ? { target: referenceChip(target, model) }
        : {
            target: referenceChip(target, model),
            consumers: consumers.map((consumer) => referenceChip(consumer, model)),
          },
    ),
  );
  return [...named.map((entry) => nameFieldSentence(t, entry, model)), ...sentences];
}

export function issueSentences(
  t: Translate,
  preview: ConfigurationPreview,
  model: RecordModelView | null,
): ConfirmationSentence[] {
  return preview.issues.map((issue) => {
    const duplicate = DUPLICATE_ISSUES[issue.code as keyof typeof DUPLICATE_ISSUES];
    if (duplicate) return [t(duplicate)];
    const field = model?.fields.find((candidate) => candidate.id === issue.fieldId);
    const type = model?.types.find((candidate) => candidate.id === (field?.typeId ?? issue.typeId));
    const relation = model?.relationships.find((candidate) => candidate.id === issue.relationId);
    const chip: ConfirmationChip | null = field
      ? referenceChip({ kind: "field", id: field.id, typeId: field.typeId, label: field.label }, model)
      : relation
        ? referenceChip(
            { kind: "relationship", id: relation.id, typeId: relation.sourceTypeId, label: relation.sourceLabel },
            model,
          )
        : type
          ? referenceChip({ kind: "type", id: type.id, label: type.pluralLabel }, model)
          : null;
    const key =
      issue.code === "existing_values_incompatible"
        ? "existingValues"
        : issue.code === "saved_view_incompatible"
          ? "savedView"
          : issue.code === "detail_layout_incompatible"
            ? "detailLayout"
            : issue.code === "summary_approval_required"
              ? "summaryApproval"
              : issue.code === "deletion_requires_read_all"
                ? "readAll"
                : "dependency";
    return chip
      ? confirmationSentence((values) => t(`RecordModel.configurationDeletion.issues.${key}`, values), {
          subject: chip,
        })
      : [t("RecordModel.dependencyHelp")];
  });
}

function removedSentences(t: Translate, deletion: Deletion): ConfirmationSentence[] {
  const removed = deletion.removed;
  if (!removed) return [];
  const lines = [
    removed.records === null && t("RecordModel.configurationDeletion.removed.hidden"),
    (removed.records ?? 0) > 0 &&
      t("RecordModel.configurationDeletion.removed.records", { count: removed.records ?? 0 }),
    (removed.values ?? 0) > 0 && t("RecordModel.configurationDeletion.removed.values", { count: removed.values ?? 0 }),
    (removed.links ?? 0) > 0 && t("RecordModel.configurationDeletion.removed.links", { count: removed.links ?? 0 }),
    removed.views > 0 && t("RecordModel.configurationDeletion.removed.views", { count: removed.views }),
    removed.grants > 0 && t("RecordModel.configurationDeletion.removed.grants", { count: removed.grants }),
    (removed.identifiers ?? 0) > 0 &&
      t("RecordModel.configurationDeletion.removed.identifiers", {
        count: removed.identifiers ?? 0,
        records: removed.identifierRecords ?? 0,
      }),
  ].filter((line): line is string => Boolean(line));
  return (lines.length ? lines : [t("RecordModel.configurationDeletion.removed.nothingStored")]).map((line) => [line]);
}

export function useConfigurationDeletion(onChanged: (operation: Lifecycle) => Promise<void>) {
  const t = useTranslations();
  const { showConfirmation } = useDeleteConfirmation();
  const [isBusy, setIsBusy] = useState(false);

  const run = async (
    operation: Lifecycle,
    target: ConfigurationTarget,
    expectedRevision: number,
    name: string,
    model: RecordModelView | null,
  ) => {
    if (isBusy) return;
    const change: ConfigurationChange = {
      expectedRevision,
      idempotencyKey: crypto.randomUUID(),
      operations: [{ operation, target }],
    };
    const apply = async () => {
      const applied = await applyRecordConfigurationAction(change);
      if (!applied.ok) {
        toastZodErrorTree(applied.error);
        return false;
      }
      await onChanged(operation);
      return true;
    };
    setIsBusy(true);
    try {
      const result = await previewRecordConfigurationAction(change);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      const deletion = result.data.deletion ?? { blockers: [], cleaned: [], removed: null };
      const blockers = [
        ...deletionBlockerSentences(t, deletion, model),
        ...(result.data.valid
          ? []
          : issueSentences(
              t,
              {
                ...result.data,
                issues: result.data.issues.filter(
                  (issue) =>
                    !deletion.blockers.some((blocker) =>
                      [issue.fieldId, issue.typeId, issue.relationId].includes(blocker.source.id),
                    ),
                ),
              },
              model,
            )),
      ];
      if (operation === "restore" && !blockers.length) {
        await apply();
        return;
      }
      showConfirmation({
        title:
          operation === "delete"
            ? t("RecordModel.configurationDeletion.deleteTitle", { name })
            : operation === "restore"
              ? t("RecordModel.configurationDeletion.restoreTitle", { name })
              : t("RecordModel.configurationDeletion.deletePermanentlyTitle", { name }),
        message:
          blockers.length && operation !== "restore"
            ? t("RecordModel.configurationDeletion.blockedMessage", { name })
            : operation === "delete"
              ? t("RecordModel.configurationDeletion.deleteMessage", { name })
              : operation === "restore"
                ? t("RecordModel.configurationDeletion.restoreMessage", { name })
                : t("RecordModel.configurationDeletion.deletePermanentlyMessage", { name }),
        details: blockers.length
          ? []
          : operation === "delete"
            ? cleanedSentences(t, deletion, model)
            : removedSentences(t, deletion),
        blockers,
        ...(operation === "deletePermanently"
          ? { confirmationText: name, confirmLabel: t("RecordModel.configurationDeletion.deletePermanently") }
          : {}),
        successKey: operation === "delete" ? "RecordModel.configurationDeletion.moved" : "Common.notifications.deleted",
        onConfirm: apply,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const requestDeleteColumn = async (model: RecordModelView, typeId: string, pathId: string, name: string) => {
    const type = model.types.find((candidate) => candidate.id === typeId);
    if (!type || isBusy) return;
    const definition = typeDefinition(type);
    const column = relationshipPathColumnKey(pathId);
    const change: ConfigurationChange = {
      expectedRevision: model.revision,
      idempotencyKey: crypto.randomUUID(),
      operations: [
        {
          operation: "putType",
          type: {
            ...definition,
            relationshipPaths: (definition.relationshipPaths ?? []).filter((path) => path.id !== pathId),
            defaults: {
              ...definition.defaults,
              columns: definition.defaults.columns.filter((id) => id !== column),
              hiddenColumns: definition.defaults.hiddenColumns.filter((id) => id !== column),
              pinnedFields: definition.defaults.pinnedFields.filter((id) => id !== column),
              sortField: definition.defaults.sortField === column ? null : definition.defaults.sortField,
              ...(definition.defaults.groupBy === column ? { groupBy: null, groupBucket: undefined } : {}),
            },
          },
        },
      ],
    };
    setIsBusy(true);
    try {
      const result = await previewRecordConfigurationAction(change);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      showConfirmation({
        title: t("RecordModel.configurationDeletion.deleteColumnTitle", { name }),
        message: t("RecordModel.configurationDeletion.deleteColumnMessage", { name, list: type.pluralLabel }),
        blockers: issueSentences(t, result.data, model),
        onConfirm: async () => {
          const applied = await applyRecordConfigurationAction(change);
          if (!applied.ok) {
            toastZodErrorTree(applied.error);
            return false;
          }
          await onChanged("deletePermanently");
          return true;
        },
      });
    } finally {
      setIsBusy(false);
    }
  };

  return {
    isBusy,
    requestDeleteColumn,
    requestDelete: (model: RecordModelView, target: ConfigurationTarget, name: string) =>
      run("delete", target, model.revision, name, model),
    requestRestore: (target: ConfigurationTarget, revision: number, name: string) =>
      run("restore", target, revision, name, null),
    requestDeletePermanently: (target: ConfigurationTarget, revision: number, name: string) =>
      run("deletePermanently", target, revision, name, null),
  };
}
