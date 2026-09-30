"use client";

import { useTranslations } from "next-intl";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import type { RecordField } from "@/features/records/record-model.schema";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppChip } from "@/components/chip/app-chip";
import { RecordValue } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { DetailHeader, IdentityAvatar, TypeBadge, auditCategory } from "./activities-row";
import { resolveActorName } from "./activity-row-labels";
import { serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Entry = Omit<Extract<ActivityEntryDto, { kind: "record" }>, "event" | "kind"> & { event: string };

export function RecordAuditDetail({ entry }: { entry: Entry }) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const category = auditCategory(entry.event);
  const identities = entry.changes.identities;
  const render = (value: Entry["changes"]["fields"][number]["before"]) => {
    if (!value) return <span className="text-muted-foreground">{t("AuditLogModal.noValue")}</span>;
    if (value.value.state === "value" && value.value.value.kind === "richText") {
      let markdown = "";
      try {
        markdown = serializeJSONToMarkdown(JSON.parse(value.value.value.documentJson) as object);
      } catch {
        return <span>{t("RecordModel.calculationError")}</span>;
      }
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      );
    }
    const field: RecordField = {
      id: value.fieldId,
      typeId: entry.changes.ref.typeId,
      label: value.label,
      valueType: value.valueType,
      behavior: { kind: "input" },
      required: false,
      archived: false,
      publishedSummary: false,
      position: 0,
      format: value.format,
      options: value.options,
    };
    return <RecordValue field={field} result={value.value} />;
  };
  return (
    <AppCard>
      <DetailHeader
        avatar={
          <IdentityAvatar
            badge={<TypeBadge icon={category.icon} label={t(`Common.events.${entry.event}`)} tone={category.tone} />}
            name={[entry.actor.firstName, entry.actor.lastName]}
            size="xl"
            src={entry.actor.avatarUrl}
          />
        }
        records={entry.records}
        subtitle={`${t(`Common.events.${entry.event}`)} · ${intl.formatNumericalShortDateTime(entry.at)}`}
        title={
          resolveActorName(entry.actor.firstName, entry.actor.lastName, entry.actor.email) ||
          t("RecordModel.systemActor")
        }
      />

      <AppCardBody className="space-y-4">
        {entry.changes.fields.map((change) => (
          <section key={change.fieldId} className="space-y-2">
            <h3 className="text-sm font-medium">{change.after?.label ?? change.before?.label}</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-md border p-3">
                <p className="mb-2 text-xs text-muted-foreground">{t("RecordModel.previousValue")}</p>

                {render(change.before)}
              </div>

              <div className="min-w-0 rounded-md border p-3">
                <p className="mb-2 text-xs text-muted-foreground">{t("RecordModel.currentValue")}</p>

                {render(change.after)}
              </div>
            </div>
          </section>
        ))}

        {entry.changes.assignments && (
          <p className="text-sm">
            {t("RecordModel.assignmentChange", {
              before: entry.changes.assignments.before.length,
              after: entry.changes.assignments.after.length,
            })}
          </p>
        )}

        {identities && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("RecordModel.identityChannels")}</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {(["before", "after"] as const).map((side) => (
                <div key={side} className="flex flex-wrap gap-1 rounded-md border p-3">
                  {identities[side].length ? (
                    identities[side].map((identity) => <AppChip key={identity.id}>{identity.value}</AppChip>)
                  ) : (
                    <span>{t("AuditLogModal.noValue")}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {entry.changes.links.length > 0 && (
          <p className="text-sm">{t("RecordModel.relationshipChange", { count: entry.changes.links.length })}</p>
        )}

        {entry.changes.related.map((relation) => (
          <section key={relation.label} className="space-y-2">
            <h3 className="text-sm font-medium">{relation.label}</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              {(["before", "after"] as const).map((side) => (
                <div key={side} className="space-y-2 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    {t(side === "before" ? "RecordModel.previousValue" : "RecordModel.currentValue")}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    {relation[side].length ? (
                      relation[side].map((record) => (
                        <AppChip key={`${record.ref.typeId}:${record.ref.recordId}`}>{record.title}</AppChip>
                      ))
                    ) : (
                      <span>{t("AuditLogModal.noValue")}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </AppCardBody>
    </AppCard>
  );
}
