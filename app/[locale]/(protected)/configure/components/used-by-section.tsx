"use client";

import type {
  ConfigurationPreview,
  ConfigurationTarget,
  DeletionReference,
} from "@/features/records/configuration.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { ChipIcon } from "@/components/modal/confirmation-sentence";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { IntlLink } from "@/i18n/navigation";

import { deletionBlockerSentences, referenceChip } from "./use-configuration-deletion";

import { previewRecordConfigurationAction } from "../../records/actions";

type Deletion = NonNullable<ConfigurationPreview["deletion"]>;
type Dependent = { reference: DeletionReference; reasons: string[] };

const LAYOUT_KINDS = new Set<DeletionReference["kind"]>(["personalLayout", "detailLayout"]);

function dependents(entries: Array<{ reference: DeletionReference; reason?: string }>, target: ConfigurationTarget) {
  const byKey = new Map<string, Dependent>();
  for (const { reference, reason } of entries) {
    if (reference.kind === target.kind && reference.id === target.id) continue;
    const key = `${reference.kind}:${reference.id}`;
    const dependent = byKey.get(key) ?? { reference, reasons: [] };
    if (reason && !dependent.reasons.includes(reason)) dependent.reasons.push(reason);
    byKey.set(key, dependent);
  }
  return [...byKey.values()];
}

function useDeletionDependents(model: RecordModelView, target: ConfigurationTarget | null) {
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const kind = target?.kind;
  const id = target?.id;
  useEffect(() => {
    setDeletion(null);
    if (!kind || !id) return;
    let current = true;
    previewRecordConfigurationAction({
      expectedRevision: model.revision,
      idempotencyKey: crypto.randomUUID(),
      operations: [{ operation: "delete", target: { kind, id } }],
    })
      .then((result) => {
        if (current && result.ok) setDeletion(result.data.deletion ?? null);
      })
      .catch(reportApplicationError);
    return () => {
      current = false;
    };
  }, [kind, id, model.revision]);
  return deletion;
}

function DependentChips({ items, model }: { items: Dependent[]; model: RecordModelView }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ reference, reasons }) => {
        const chip = referenceChip(reference, model);
        return (
          <IntlLink
            key={`${reference.kind}:${reference.id}`}
            className="inline-flex max-w-full"
            data-used-by-chip=""
            href={chip.href}
          >
            <AppChip
              interactive
              startContent={<ChipIcon icon={chip.icon} />}
              tooltip={reasons.length ? reasons.join(" ") : undefined}
            >
              {chip.label}
            </AppChip>
          </IntlLink>
        );
      })}
    </div>
  );
}

export function UsedBySection({ model, target }: { model: RecordModelView; target: ConfigurationTarget | null }) {
  const t = useTranslations();
  const deletion = useDeletionDependents(model, target);
  if (!target || !deletion) return null;
  const reasons = deletionBlockerSentences(t, deletion, model).map((sentence) =>
    sentence.map((part) => (typeof part === "string" ? part : part.label)).join(""),
  );
  const blocking = dependents(
    deletion.blockers.map((blocker, index) => ({ reference: blocker.source, reason: reasons[index] })),
    target,
  );
  const consumers = dependents(
    deletion.cleaned.map((entry) => ({ reference: entry.consumer })),
    target,
  );
  const cleaned = consumers.filter(({ reference }) => !LAYOUT_KINDS.has(reference.kind));
  const layouts = consumers.length - cleaned.length;
  if (!blocking.length && !consumers.length) return null;
  return (
    <CollapsibleSection
      id="used-by"
      summary={[
        ...(blocking.length ? [t("RecordModel.usedBy.blockingCount", { count: blocking.length })] : []),
        ...(consumers.length ? [t("RecordModel.usedBy.cleanedCount", { count: consumers.length })] : []),
      ].join(" · ")}
      title={t("RecordModel.usedBy.title")}
    >
      {blocking.length > 0 && (
        <div className="space-y-2" data-used-by-group="blocking">
          <p className="text-xs font-medium text-muted-foreground">{t("RecordModel.usedBy.blocking")}</p>

          <DependentChips items={blocking} model={model} />
        </div>
      )}

      {consumers.length > 0 && (
        <div className="space-y-2" data-used-by-group="cleaned">
          <p className="text-xs font-medium text-muted-foreground">{t("RecordModel.usedBy.cleaned")}</p>

          {cleaned.length > 0 && <DependentChips items={cleaned} model={model} />}

          {layouts > 0 && (
            <p className="text-xs text-muted-foreground">{t("RecordModel.usedBy.layouts", { count: layouts })}</p>
          )}
        </div>
      )}
    </CollapsibleSection>
  );
}
