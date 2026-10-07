"use client";

import type { RecentlyDeleted } from "@/features/records/get-recently-deleted.interactor";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Activity, AtSign, Link2, List, RotateCcw, TextCursorInput, Trash2 } from "lucide-react";

import { AppModal } from "@/components/modal";
import { InfoRow } from "@/components/shared/info-row";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { useRouter } from "@/i18n/navigation";

import { useConfigurationDeletion } from "../../components/use-configuration-deletion";

type Item = RecentlyDeleted["items"][number];

const KIND_ICONS = {
  type: List,
  field: TextCursorInput,
  relationship: Link2,
  activityPath: Activity,
  channels: AtSign,
};

export function RecentlyDeletedView({ initial }: { initial: RecentlyDeleted | null }) {
  const t = useTranslations();
  const router = useRouter();
  const intlStore = useHydratedIntlStore();
  const [selected, setSelected] = useState<Item | null>(null);
  const changed = useCallback(() => {
    setSelected(null);
    router.refresh();
    return Promise.resolve();
  }, [router]);
  const deletion = useConfigurationDeletion(changed);
  if (!initial)
    return <p className="text-sm text-muted-foreground">{t("RecordModel.configurationDeletion.noAccess")}</p>;
  const itemLabel = (item: Item) => (item.target.kind === "channels" ? t("EntityChannels.heading") : item.label);
  const kindLabel = (item: Item) => t(`RecordModel.configurationDeletion.kinds.${item.target.kind}`);
  const listLabel = (item: Item) => item.typeLabel ?? "";
  const deletedBy = (item: Item) =>
    [item.deletedBy, item.deletedAt ? intlStore.formatDescriptiveShortDateTime(new Date(item.deletedAt)) : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4" data-recently-deleted="">
      <div>
        <h1 className="text-lg font-semibold">{t("RecordModel.configurationDeletion.recentlyDeleted")}</h1>

        <p className="text-sm text-muted-foreground">{t("RecordModel.configurationDeletion.recentlyDeletedHelp")}</p>
      </div>

      {initial.items.length ? (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {initial.items.map((item) => {
            const Icon = KIND_ICONS[item.target.kind];
            return (
              <li key={`${item.target.kind}:${item.target.id}`}>
                <button
                  aria-label={itemLabel(item)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm outline-none hover:bg-accent/50 focus-visible:bg-accent/60"
                  data-recently-deleted-item={item.target.id}
                  type="button"
                  onClick={() => setSelected(item)}
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{itemLabel(item)}</span>

                    <span className="block truncate text-muted-foreground">
                      {[kindLabel(item), listLabel(item) || null].filter(Boolean).join(" · ")}
                    </span>
                  </span>

                  <span className="hidden shrink-0 text-muted-foreground sm:block">{deletedBy(item)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          {t("RecordModel.configurationDeletion.recentlyDeletedEmpty")}
        </p>
      )}

      <AppModal
        actions={
          selected
            ? [
                {
                  id: "restore",
                  icon: RotateCcw,
                  label: t("RecordModel.configurationDeletion.restore"),
                  busy: deletion.isBusy,
                  onClick: () => deletion.requestRestore(selected.target, initial.schemaRevision, itemLabel(selected)),
                },
                {
                  id: "delete-permanently",
                  icon: Trash2,
                  label: t("RecordModel.configurationDeletion.deletePermanently"),
                  variant: "destructive",
                  busy: deletion.isBusy,
                  onClick: () =>
                    deletion.requestDeletePermanently(selected.target, initial.schemaRevision, itemLabel(selected)),
                },
              ]
            : []
        }
        open={Boolean(selected)}
        title={selected ? itemLabel(selected) : ""}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <div className="flex flex-col gap-3 bg-card p-6" data-recently-deleted-detail="">
            <h2 className="pe-24 text-base font-semibold">{itemLabel(selected)}</h2>

            <InfoRow label={t("RecordModel.configurationDeletion.kind")}>{kindLabel(selected)}</InfoRow>

            {listLabel(selected) && (
              <InfoRow label={t("RecordModel.configurationDeletion.list")}>{listLabel(selected)}</InfoRow>
            )}

            <InfoRow label={t("RecordModel.configurationDeletion.deletedBy")}>{deletedBy(selected) || "—"}</InfoRow>
          </div>
        )}
      </AppModal>
    </div>
  );
}
