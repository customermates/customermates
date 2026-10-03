"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useClientReady } from "@/hooks/use-client-ready";
import { Plus, Link2, ChevronRight, ArrowLeft, Settings2, Activity, LayoutList } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RecordModel } from "@/features/records/record-model.schema";

import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { IntlLink, useRouter } from "@/i18n/navigation";
import { observer } from "mobx-react-lite";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { Alert } from "@/components/shared/alert";
import { runUserAction } from "@/core/errors/report-application-error";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { ActivityPathModal, ActivityPathModalStore } from "./activity-path-modal";
import { DataModelStore } from "./data-model.store";
import { Button } from "@/components/ui/button";
import { discoverRecordTypesAction } from "../../../records/actions";
import { TypeModal, TypeModalStore } from "./type-modal";
import { FieldModal, FieldModalStore } from "./field-modal";
import { RelationshipModal, RelationshipModalStore } from "./relationship-modal";
import { useRecordRouteReady } from "@/components/records/use-record-route-ready";

export const DataModelPageView = observer(function DataModelPageView({
  initialModel,
  canManage,
  canPublishSummary = false,
  selectedTypeId,
}: {
  initialModel: RecordModel;
  canManage: boolean;
  canPublishSummary?: boolean;
  selectedTypeId?: string;
}) {
  useRecordRouteReady();
  const interactive = useClientReady();
  const root = useRootStore();
  const router = useRouter();
  const createRequested = useSearchParams().get("create") === "true";
  const t = useTranslations();
  const [store] = useState(() => new DataModelStore(initialModel));
  const [showArchived, setShowArchived] = useState(false);
  const authoritative = useRef(initialModel);
  if (authoritative.current !== initialModel) {
    authoritative.current = initialModel;
    store.hydrate(initialModel);
  }
  const model = store.model;
  const refresh = store.refresh;
  const [typeModal] = useState(
    () =>
      new TypeModalStore(
        root,
        initialModel,
        async (preview, isCurrentSession = () => true) => {
          await refresh();
          const id = preview.references.find((reference) => reference.reference === "$type")?.id;
          if (id && isCurrentSession()) {
            const discovered = await discoverRecordTypesAction([id]);
            if (!isCurrentSession()) return;
            const created = discovered.types.find((type) => type.id === id);
            const readable = created?.permittedActions.some((action) => action === "readOwn" || action === "readAll");
            router.push(readable ? `/records/${id}` : `/company/data-model?typeId=${id}`);
          }
        },
        canPublishSummary,
        store.hydrate,
      ),
  );
  const [fieldModal] = useState(
    () => new FieldModalStore(root, initialModel, refresh, canPublishSummary, store.hydrate),
  );
  const [relationModal] = useState(
    () => new RelationshipModalStore(root, initialModel, refresh, canPublishSummary, store.hydrate),
  );
  const [activityModal] = useState(
    () => new ActivityPathModalStore(root, initialModel, refresh, canPublishSummary, store.hydrate),
  );
  useEffect(() => {
    for (const modal of [typeModal, fieldModal, relationModal, activityModal])
      modal.setCanRenewSummaries(canPublishSummary);
  }, [canPublishSummary, typeModal, fieldModal, relationModal, activityModal]);
  const consumedCreate = useRef(false);
  useEffect(() => {
    if (!createRequested) {
      consumedCreate.current = false;
      return;
    }
    if (!canManage || consumedCreate.current) return;
    const frame = window.requestAnimationFrame(() => {
      consumedCreate.current = true;
      typeModal.edit(model, null);
      const url = new URL(window.location.href);
      url.searchParams.delete("create");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [createRequested, canManage, model, typeModal]);
  useEffect(() => {
    const stores = [typeModal, fieldModal, relationModal, activityModal];
    for (const store of stores) root.registerModalStore(store);
    return () => {
      for (const store of stores) root.unregisterModalStore(store);
    };
  }, [root, typeModal, fieldModal, relationModal, activityModal]);
  const selected = model.types.find((type) => type.id === selectedTypeId);
  const toolbar = useMemo(
    () =>
      canManage ? (
        selected ? (
          <>
            <Button
              aria-label={selected.archived ? t("RecordModel.restore") : t("RecordModel.typeSettings")}
              className="max-sm:size-8 max-sm:p-0 max-sm:has-[>svg]:px-0"
              disabled={!interactive}
              size="sm"
              variant="secondary"
              onClick={() => {
                typeModal.edit(model, selected);
                if (selected.archived) typeModal.onChange("archived", false);
              }}
            >
              <Settings2 aria-hidden className="size-4" />

              <span className="hidden sm:inline">
                {selected.archived ? t("RecordModel.restore") : t("RecordModel.typeSettings")}
              </span>
            </Button>

            <Button
              aria-label={t("RecordModel.sharedDefaults")}
              className="max-sm:size-8 max-sm:p-0 max-sm:has-[>svg]:px-0"
              disabled={!interactive}
              size="sm"
              variant="secondary"
              onClick={() => typeModal.edit(model, selected, "appearance")}
            >
              <LayoutList aria-hidden className="size-4" />

              <span className="hidden sm:inline">{t("RecordModel.sharedDefaults")}</span>
            </Button>

            <Button
              aria-label={t("RecordModel.addField")}
              className="max-sm:size-8 max-sm:p-0 max-sm:has-[>svg]:px-0"
              disabled={!interactive}
              size="sm"
              onClick={() => fieldModal.edit(model, selected.id, null)}
            >
              <Plus aria-hidden className="size-4" />

              <span className="hidden sm:inline">{t("RecordModel.addField")}</span>
            </Button>
          </>
        ) : (
          <Button
            aria-label={t("RecordModel.createList")}
            className="max-sm:size-8 max-sm:p-0 max-sm:has-[>svg]:px-0"
            disabled={!interactive}
            size="sm"
            onClick={() => typeModal.edit(model, null)}
          >
            <Plus aria-hidden className="size-4" />

            <span className="hidden sm:inline">{t("RecordModel.createList")}</span>
          </Button>
        )
      ) : null,
    [canManage, selected, interactive, model, typeModal, fieldModal, t],
  );
  useSetTopBarActions(toolbar);
  const typeRows = (embedded: boolean) =>
    model.types
      .filter((type) => (!type.archived || showArchived) && type.embedded === embedded)
      .map((type) => {
        const Icon = recordTypeIcon(type.icon);
        return (
          <IntlLink
            key={type.id}
            className="flex items-center gap-3 rounded-md p-3 hover:bg-accent"
            href={`/company/data-model?typeId=${type.id}`}
          >
            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{type.pluralLabel}</span>

              {type.archived && (
                <span className="block text-xs text-muted-foreground">{t("RecordModel.archived")}</span>
              )}

              {type.description && <span className="block text-xs text-muted-foreground">{type.description}</span>}
            </span>

            <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
          </IntlLink>
        );
      });
  const hasArchived = selected
    ? selected.archived ||
      model.fields.some((field) => field.typeId === selected.id && field.archived) ||
      model.relationships.some(
        (relation) =>
          relation.archived && (relation.sourceTypeId === selected.id || relation.targetTypeId === selected.id),
      ) ||
      selected.relationshipPaths?.some((path) => path.archived) ||
      model.activityPaths.some((path) => path.typeId === selected.id && path.archived)
    : model.types.some((type) => type.archived);
  return (
    <div className="animate-page-result-in w-full max-w-3xl space-y-6 motion-reduce:animate-none">
      {store.refreshFailed && (
        <Alert color="danger" description={t("ErrorCard.title")}>
          <Button disabled={store.isRefreshing} size="sm" variant="secondary" onClick={() => runUserAction(refresh)}>
            {t("ErrorCard.retry")}
          </Button>
        </Alert>
      )}

      <RecordAiAction
        registerContext
        context={{
          reference: selected ? { kind: "recordType", typeId: selected.id } : { kind: "dataModel" },
          label: selected?.pluralLabel ?? t("RecordModel.dataModel"),
        }}
      />

      {hasArchived && (
        <div className="flex justify-end">
          <Button
            aria-pressed={showArchived}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? t("RecordModel.hideArchived") : t("RecordModel.showArchived")}
          </Button>
        </div>
      )}

      {selected ? (
        <>
          <div className="space-y-2">
            <Button asChild className="-ml-3 w-fit" size="sm" variant="ghost">
              <IntlLink href="/company/data-model">
                <ArrowLeft aria-hidden className="size-4" />

                {t("RecordModel.allLists")}
              </IntlLink>
            </Button>

            <h2 className="text-base font-semibold">{selected.pluralLabel}</h2>

            {selected.archived && <p className="text-xs text-muted-foreground">{t("RecordModel.archived")}</p>}

            {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
          </div>

          <section aria-label={t("RecordModel.fields")} className="space-y-2">
            <h3 className="text-sm font-medium">{t("RecordModel.fields")}</h3>

            <div className="divide-y divide-border">
              {model.fields
                .filter((field) => field.typeId === selected.id && (!field.archived || showArchived))
                .map((field) => (
                  <div key={field.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{field.label}</span>

                      {field.archived && (
                        <span className="ml-2 text-xs text-muted-foreground">{t("RecordModel.archived")}</span>
                      )}

                      <p className="text-xs text-muted-foreground">{`${t(`RecordModel.types.${field.valueType}`)} · ${t(`RecordModel.behaviors.${field.behavior.kind}`)}`}</p>
                    </div>

                    {canManage && (
                      <Button
                        disabled={!interactive}
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          fieldModal.edit(model, selected.id, field);
                          if (field.archived) fieldModal.onChange("archived", false);
                        }}
                      >
                        {field.archived ? t("RecordModel.restore") : t("RecordModel.edit")}
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          </section>

          <section aria-label={t("RecordModel.relationships")} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">{t("RecordModel.relationships")}</h3>

              {canManage && (
                <Button
                  disabled={!interactive}
                  size="sm"
                  variant="ghost"
                  onClick={() => relationModal.edit(model, selected.id)}
                >
                  <Link2 aria-hidden className="size-4" />

                  {t("RecordModel.relationship")}
                </Button>
              )}
            </div>

            {(selected.relationshipPaths ?? [])
              .filter((path) => !path.archived || showArchived)
              .map((path) => (
                <div key={path.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <span className="text-sm">{path.label}</span>

                    {path.archived && (
                      <span className="ml-2 text-xs text-muted-foreground">{t("RecordModel.archived")}</span>
                    )}

                    <p className="text-xs text-muted-foreground">{t("RecordModel.relationshipPath")}</p>
                  </div>

                  {canManage && (
                    <Button
                      disabled={!interactive}
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        relationModal.editPath(model, selected.id, path);
                        if (path.archived) relationModal.onChange("archived", false);
                      }}
                    >
                      {path.archived ? t("RecordModel.restore") : t("RecordModel.edit")}
                    </Button>
                  )}
                </div>
              ))}

            {model.relationships
              .filter(
                (relation) =>
                  (!relation.archived || showArchived) &&
                  (relation.sourceTypeId === selected.id || relation.targetTypeId === selected.id),
              )
              .map((relation) => {
                const targetId = relation.sourceTypeId === selected.id ? relation.targetTypeId : relation.sourceTypeId;
                const target = model.types.find((type) => type.id === targetId);
                return (
                  <div key={relation.id} className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <span className="text-sm">
                        {relation.sourceTypeId === selected.id ? relation.sourceLabel : relation.targetLabel}
                      </span>

                      {relation.archived && (
                        <span className="ml-2 text-xs text-muted-foreground">{t("RecordModel.archived")}</span>
                      )}

                      {target && (
                        <IntlLink
                          className="block text-xs text-muted-foreground hover:underline"
                          href={`/company/data-model?typeId=${target.id}`}
                        >
                          {target.pluralLabel}
                        </IntlLink>
                      )}
                    </div>

                    {canManage && (
                      <Button
                        disabled={!interactive}
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          relationModal.edit(model, selected.id, relation);
                          if (relation.archived) relationModal.onChange("archived", false);
                        }}
                      >
                        {relation.archived ? t("RecordModel.restore") : t("RecordModel.edit")}
                      </Button>
                    )}
                  </div>
                );
              })}
          </section>

          <section aria-label={t("RecordModel.activityConnections")} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">{t("RecordModel.activityConnections")}</h3>

              {canManage && (
                <Button
                  disabled={!interactive}
                  size="sm"
                  variant="ghost"
                  onClick={() => activityModal.edit(model, selected.id)}
                >
                  <Activity aria-hidden className="size-4" />

                  {t("RecordModel.addActivityConnection")}
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{t("RecordModel.activityConnectionsHelp")}</p>

            {model.activityPaths
              .filter((path) => path.typeId === selected.id && (!path.archived || showArchived))
              .map((path) => (
                <div key={path.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm">
                    {path.label}

                    {path.archived && (
                      <span className="ml-2 text-xs text-muted-foreground">{t("RecordModel.archived")}</span>
                    )}
                  </span>

                  {canManage && (
                    <Button
                      disabled={!interactive}
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        activityModal.edit(model, selected.id, path);
                        if (path.archived) activityModal.onChange("archived", false);
                      }}
                    >
                      {path.archived ? t("RecordModel.restore") : t("RecordModel.edit")}
                    </Button>
                  )}
                </div>
              ))}
          </section>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("RecordModel.dataModelDescription")}</p>

          <div className="divide-y divide-border">{typeRows(false)}</div>

          {model.types.some((type) => type.embedded && (!type.archived || showArchived)) && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">{t("RecordModel.embeddedLists")}</h2>

              <div className="divide-y divide-border">{typeRows(true)}</div>
            </section>
          )}
        </>
      )}

      <TypeModal store={typeModal} />

      <FieldModal store={fieldModal} />

      <RelationshipModal store={relationModal} />

      <ActivityPathModal store={activityModal} />
    </div>
  );
});
