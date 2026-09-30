"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useClientReady } from "@/hooks/use-client-ready";
import { Plus, Link2, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RecordModel } from "@/features/records/record-model.schema";

import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { IntlLink, useRouter } from "@/i18n/navigation";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Button } from "@/components/ui/button";
import { discoverRecordTypesAction, getRecordModelAction } from "../../../records/actions";
import { TypeModal, TypeModalStore } from "./type-modal";
import { FieldModal, FieldModalStore } from "./field-modal";
import { RelationshipModal, RelationshipModalStore } from "./relationship-modal";
import { useRecordRouteReady } from "@/components/records/use-record-route-ready";

export function DataModelPageView({
  initialModel,
  canManage,
  selectedTypeId,
}: {
  initialModel: RecordModel;
  canManage: boolean;
  selectedTypeId?: string;
}) {
  useRecordRouteReady();
  const interactive = useClientReady();
  const root = useRootStore();
  const router = useRouter();
  const createRequested = useSearchParams().get("create") === "true";
  const t = useTranslations();
  const [model, setModel] = useState(initialModel);
  const refresh = useCallback(async () => {
    const next = await getRecordModelAction();
    setModel((current) => (next.revision >= current.revision ? next : current));
  }, []);
  const [typeModal] = useState(
    () =>
      new TypeModalStore(root, initialModel, async (preview) => {
        await refresh();
        const id = preview.references.find((reference) => reference.reference === "$type")?.id;
        if (id) {
          const discovered = await discoverRecordTypesAction([id]);
          const created = discovered.types.find((type) => type.id === id);
          const readable = created?.permittedActions.some((action) => action === "readOwn" || action === "readAll");
          router.push(readable ? `/records/${id}` : `/company/data-model?typeId=${id}`);
        }
      }),
  );
  const [fieldModal] = useState(() => new FieldModalStore(root, initialModel, refresh));
  const [relationModal] = useState(() => new RelationshipModalStore(root, initialModel, refresh));
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
    const stores = [typeModal, fieldModal, relationModal];
    for (const store of stores) root.registerModalStore(store);
    return () => {
      for (const store of stores) root.unregisterModalStore(store);
    };
  }, [root, typeModal, fieldModal, relationModal]);
  const selected = model.types.find((type) => type.id === selectedTypeId);
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("RecordModel.dataModel")}</h1>

          <p className="mt-1 text-sm text-muted-foreground">{t("RecordModel.dataModelDescription")}</p>

          <RecordAiAction
            registerContext
            context={{
              reference: selected ? { kind: "recordType", typeId: selected.id } : { kind: "dataModel" },
              label: selected?.pluralLabel ?? t("RecordModel.dataModel"),
            }}
          />
        </div>

        {canManage && (
          <Button
            disabled={!interactive}
            size="sm"
            onClick={() => {
              typeModal.edit(model, null);
            }}
          >
            <Plus className="size-4" />

            {t("RecordModel.createList")}
          </Button>
        )}
      </div>

      <AppCard>
        <AppCardBody className="space-y-1">
          {model.types
            .filter((type) => !type.archived && !type.embedded)
            .map((type) => (
              <div key={type.id} className="flex items-center justify-between gap-3 rounded-md p-3 hover:bg-accent">
                <div>
                  <IntlLink className="font-medium" href={`/records/${type.id}`}>
                    {type.pluralLabel}
                  </IntlLink>

                  {type.description && <p className="text-sm text-muted-foreground">{type.description}</p>}
                </div>

                <Button asChild size="sm" variant="ghost">
                  <IntlLink href={`/company/data-model?typeId=${type.id}`}>
                    {t("RecordModel.configure")}

                    <ChevronRight className="size-4" />
                  </IntlLink>
                </Button>
              </div>
            ))}
        </AppCardBody>
      </AppCard>

      {selected && (
        <AppCard>
          <AppCardBody className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-medium">{selected.pluralLabel}</h2>

              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!interactive}
                    size="sm"
                    variant="secondary"
                    onClick={() => typeModal.edit(model, selected)}
                  >
                    {t("RecordModel.typeSettings")}
                  </Button>

                  <Button
                    disabled={!interactive}
                    size="sm"
                    variant="secondary"
                    onClick={() => relationModal.edit(model, selected.id)}
                  >
                    <Link2 className="size-4" />

                    {t("RecordModel.relationship")}
                  </Button>

                  <Button
                    disabled={!interactive}
                    size="sm"
                    variant="secondary"
                    onClick={() => fieldModal.edit(model, selected.id, null)}
                  >
                    <Plus className="size-4" />

                    {t("RecordModel.addField")}
                  </Button>
                </div>
              )}
            </div>

            <div className="divide-y divide-border">
              {model.fields
                .filter((field) => field.typeId === selected.id && !field.archived)
                .map((field) => (
                  <div key={field.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <span className="text-sm font-medium">{field.label}</span>

                      <p className="text-xs text-muted-foreground">
                        {`${t(`RecordModel.types.${field.valueType}`)} · ${t(`RecordModel.behaviors.${field.behavior.kind}`)}`}
                      </p>
                    </div>

                    {canManage && (
                      <Button
                        disabled={!interactive}
                        size="sm"
                        variant="ghost"
                        onClick={() => fieldModal.edit(model, selected.id, field)}
                      >
                        {t("RecordModel.edit")}
                      </Button>
                    )}
                  </div>
                ))}
            </div>

            <div className="space-y-2">
              {(selected.relationshipPaths ?? [])
                .filter((path) => !path.archived)
                .map((path) => (
                  <div key={path.id} className="flex items-center justify-between gap-3">
                    <div>
                      <span className="text-sm">{path.label}</span>

                      <p className="text-xs text-muted-foreground">{t("RecordModel.relationshipPath")}</p>
                    </div>

                    {canManage && (
                      <Button
                        disabled={!interactive}
                        size="sm"
                        variant="ghost"
                        onClick={() => relationModal.editPath(model, selected.id, path)}
                      >
                        {t("RecordModel.edit")}
                      </Button>
                    )}
                  </div>
                ))}

              {model.relationships
                .filter(
                  (relation) =>
                    !relation.archived &&
                    (relation.sourceTypeId === selected.id || relation.targetTypeId === selected.id),
                )
                .map((relation) => (
                  <div key={relation.id} className="flex items-center justify-between gap-3">
                    <span className="text-sm">
                      {relation.sourceTypeId === selected.id ? relation.sourceLabel : relation.targetLabel}
                    </span>

                    {canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => relationModal.edit(model, selected.id, relation)}
                      >
                        {t("RecordModel.edit")}
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          </AppCardBody>
        </AppCard>
      )}

      <TypeModal store={typeModal} />

      <FieldModal store={fieldModal} />

      <RelationshipModal store={relationModal} />
    </div>
  );
}
