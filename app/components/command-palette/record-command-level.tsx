"use client";

import type { PaletteLevel } from "@/app/components/global-search-modal.store";
import type { RecordEditorStore } from "@/app/[locale]/(protected)/records/[typeId]/components/record-editor.store";
import type { RecordMember } from "@/features/records/record-model.schema";
import type { RecordChoice } from "@/features/records/get-record-choices.interactor";

import { Check, Loader2 } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { AppChip } from "@/components/chip/app-chip";
import { MemberAvatar, memberName } from "@/components/chip/member-chip";
import { CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { toChipColor } from "@/constants/chip-colors";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { runUserAction } from "@/core/errors/report-application-error";
import { getUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";
import { useRecordChoices } from "@/app/[locale]/(protected)/records/[typeId]/components/record-relationship-editor";
import { foldText } from "./command-palette-search";

type Props = {
  level: PaletteLevel;
  editor: RecordEditorStore;
  query: string;
  onApplied: () => void;
};

function matches(query: string, label: string) {
  const folded = foldText(query);
  return !folded || foldText(label).includes(folded);
}

function useMembers(query: string, enabled: boolean) {
  const debounced = useDebouncedValue(query);
  const [state, setState] = useState<{ key: string; members: RecordMember[] } | null>(null);
  const key = enabled ? debounced : null;
  useEffect(() => {
    if (key === null) return;
    let active = true;
    void getUsersAction({ searchTerm: key || undefined })
      .then((result) => {
        if (active) setState({ key, members: result.items ?? [] });
      })
      .catch(() => {
        if (active) setState({ key, members: [] });
      });
    return () => {
      active = false;
    };
  }, [key]);
  return { members: state?.key === key ? state.members : [], loading: key !== null && state?.key !== key };
}

export const RecordCommandLevel = observer(function RecordCommandLevel({ level, editor, query, onApplied }: Props) {
  const t = useTranslations();
  const field = level.kind === "field" ? editor.fields.find((candidate) => candidate.id === level.fieldId) : undefined;
  const wantsMembers = level.kind === "assign" || field?.valueType === "member";
  const members = useMembers(query, wantsMembers);
  const relationship =
    level.kind === "link"
      ? editor.presentation.model.relationships.find((candidate) => candidate.id === level.relationId)
      : undefined;
  const outgoing = level.kind === "link" && level.direction === "outgoing";
  const otherTypeId = relationship ? (outgoing ? relationship.targetTypeId : relationship.sourceTypeId) : "";
  const singular =
    relationship !== undefined &&
    (outgoing ? relationship.sourceCardinality : relationship.targetCardinality) === "one";
  const debounced = useDebouncedValue(query);
  const choices = useRecordChoices(
    { typeId: otherTypeId, page: 1, pageSize: 25, search: debounced },
    level.kind === "link" && relationship !== undefined,
    0,
  );
  const linked = useRecordChoices(
    {
      typeId: otherTypeId,
      page: 1,
      pageSize: 25,
      ...(editor.record && relationship && level.kind === "link"
        ? { linkedTo: { ref: editor.record.ref, relationId: relationship.id, direction: level.direction } }
        : {}),
    },
    level.kind === "link" && relationship !== undefined && editor.record !== null,
    0,
  );

  const apply = (change: () => void) => {
    change();
    onApplied();
    runUserAction(editor.onSubmit);
  };

  if (level.kind === "field" && field?.valueType === "select") {
    const current = editor.form.values[field.id];
    const selected = new Set(Array.isArray(current) ? current : current ? [current] : []);
    const options = field.options.filter((option) => matches(query, option.label));
    return (
      <CommandGroup>
        {options.map((option) => (
          <CommandItem
            key={option.id}
            value={`option:${option.id}`}
            onSelect={() =>
              apply(() =>
                editor.onChange(
                  `values.${field.id}`,
                  field.multiple
                    ? selected.has(option.id)
                      ? [...selected].filter((id) => id !== option.id)
                      : [...selected, option.id]
                    : option.id,
                ),
              )
            }
          >
            <AppChip variant={toChipColor(option.color)}>{option.label}</AppChip>

            <span className="flex-1" />

            {selected.has(option.id) && <Check aria-hidden className="size-4 text-muted-foreground" />}
          </CommandItem>
        ))}

        {options.length === 0 && <CommandEmpty persistent>{t("GlobalSearch.noResults")}</CommandEmpty>}
      </CommandGroup>
    );
  }

  if (level.kind === "field" && field?.valueType === "boolean") {
    const current = editor.form.values[field.id];
    const options = [
      { value: true, label: t("RecordModel.yes") },
      { value: false, label: t("RecordModel.no") },
    ].filter((option) => matches(query, option.label));
    return (
      <CommandGroup>
        {options.map((option) => (
          <CommandItem
            key={String(option.value)}
            value={`boolean:${option.value}`}
            onSelect={() => apply(() => editor.onChange(`values.${field.id}`, option.value))}
          >
            <span className="flex-1">{option.label}</span>

            {current === option.value && <Check aria-hidden className="size-4 text-muted-foreground" />}
          </CommandItem>
        ))}
      </CommandGroup>
    );
  }

  if (wantsMembers) {
    const selected = new Set<string>(
      level.kind === "assign"
        ? editor.form.assignedUserIds
        : typeof editor.form.values[field?.id ?? ""] === "string"
          ? [editor.form.values[field?.id ?? ""] as string]
          : [],
    );
    const choose = (member: RecordMember) =>
      apply(() => {
        if (level.kind === "assign") {
          editor.onChange(
            "assignedUserIds",
            selected.has(member.id)
              ? editor.form.assignedUserIds.filter((id) => id !== member.id)
              : [...editor.form.assignedUserIds, member.id],
          );
        } else if (field) editor.onChange(`values.${field.id}`, member.id);
      });
    return (
      <CommandGroup>
        {members.loading && members.members.length === 0 && <LoadingRow label={t("GlobalSearch.loading")} />}

        {members.members.map((member) => (
          <CommandItem key={member.id} value={`member:${member.id}`} onSelect={() => choose(member)}>
            <MemberAvatar member={member} />

            <span className="min-w-0 flex-1 truncate">{memberName(member)}</span>

            {selected.has(member.id) && <Check aria-hidden className="size-4 text-muted-foreground" />}
          </CommandItem>
        ))}

        {!members.loading && members.members.length === 0 && (
          <CommandEmpty persistent>{t("GlobalSearch.noResults")}</CommandEmpty>
        )}
      </CommandGroup>
    );
  }

  if (level.kind === "link" && relationship) {
    const title = (record: RecordChoice) =>
      record.title.state === "restricted"
        ? t("RecordModel.restricted")
        : record.title.state === "error"
          ? t("RecordModel.calculationError")
          : record.title.state === "value" && record.title.value.kind === "text"
            ? record.title.value.value
            : t("RecordModel.record");
    const linkedIds = new Set((linked.data?.records ?? []).map((record) => record.ref.recordId));
    const waitingForLinks = singular && (linked.loading || linked.failed);
    const choose = (record: RecordChoice) =>
      apply(() => {
        if (singular) {
          for (const previous of linked.data?.records ?? []) {
            editor.stageLink(
              { action: "unlink", relationId: relationship.id, direction: level.direction, record: previous.ref },
              previous.title,
            );
          }
        }
        editor.stageLink(
          { action: "link", relationId: relationship.id, direction: level.direction, record: record.ref },
          record.title,
        );
      });
    return (
      <CommandGroup>
        {choices.loading && <LoadingRow label={t("GlobalSearch.loading")} />}

        {(choices.data?.records ?? []).map((record) => (
          <CommandItem
            key={record.ref.recordId}
            disabled={waitingForLinks || linkedIds.has(record.ref.recordId)}
            value={`link:${record.ref.recordId}`}
            onSelect={() => choose(record)}
          >
            <span className="min-w-0 flex-1 truncate">{title(record)}</span>

            {linkedIds.has(record.ref.recordId) && <Check aria-hidden className="size-4 text-muted-foreground" />}
          </CommandItem>
        ))}

        {!choices.loading && (choices.data?.records.length ?? 0) === 0 && (
          <CommandEmpty persistent>{t("GlobalSearch.noResults")}</CommandEmpty>
        )}
      </CommandGroup>
    );
  }

  return <CommandEmpty persistent>{t("GlobalSearch.noResults")}</CommandEmpty>;
});

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
      <Loader2 aria-hidden className="size-3.5 animate-spin" />

      <span>{label}</span>
    </div>
  );
}
