"use client";

import type { RecordModelView } from "@/features/records/record-model.schema";
import type { ConfigureGraphLayout } from "@/features/p13n/p13n-settings.schema";
import type { ConfigureAddKind } from "./configure-actions";
import type { ConfigureGraphAccounts } from "./configure-graph";
import type { ConfigureGraphCatalog } from "./configure-graph-model";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { observer } from "mobx-react-lite";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { useClientReady } from "@/hooks/use-client-ready";
import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { useRouter } from "@/i18n/navigation";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { Alert } from "@/components/shared/alert";
import { runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { useRecordRouteReady } from "@/components/records/use-record-route-ready";

import { discoverRecordTypesAction } from "../../records/actions";
import { ConfigureTopBarActions } from "./configure-actions";
import { ConfigureListPane } from "./configure-list-pane";
import { isResolvedField } from "./configure-model";
import { DataModelStore } from "./data-model.store";
import { useFocusTarget, type FocusKind } from "@/components/focus/focus-target";
import { FieldModal, FieldModalStore } from "./field-modal";
import { RelationshipModal, RelationshipModalStore } from "./relationship-modal";
import { TypeModal, TypeModalStore } from "./type-modal";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

const ConfigureGraph = dynamic(() => import("./configure-graph").then((module) => module.ConfigureGraph), {
  ssr: false,
  loading: () => (
    <div aria-busy className="flex min-h-0 flex-1 items-center justify-center" data-configure-graph-loading="">
      <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

const CONFIGURE_FOCUS_KINDS: FocusKind[] = ["list", "field", "relationship"];

function configureHref(changes: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

const ConfigurePageViewContent = observer(function ConfigurePageView({
  initialModel,
  catalog,
  accounts,
  savedLayout,
  canManage,
  canPublishSummary = false,
}: {
  initialModel: RecordModelView;
  catalog: ConfigureGraphCatalog;
  accounts: ConfigureGraphAccounts;
  savedLayout: ConfigureGraphLayout | null;
  canManage: boolean;
  canPublishSummary?: boolean;
}) {
  useRecordRouteReady();
  const interactive = useClientReady();
  const root = useRootStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeId = searchParams.get("typeId") ?? undefined;
  const createRequested = searchParams.get("create") === "true";
  const t = useTranslations();
  const generalFormId = useId();
  const [store] = useState(() => new DataModelStore(initialModel));
  const [graphLayout, setGraphLayout] = useState(savedLayout?.positions ?? null);
  const authoritative = useRef(initialModel);
  useEffect(() => {
    if (authoritative.current === initialModel) return;
    authoritative.current = initialModel;
    store.hydrate(initialModel);
  }, [initialModel, store]);
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
            router.push(readable ? `/records/${id}` : `/configure?typeId=${id}`);
          }
        },
        canPublishSummary,
        store.hydrate,
      ),
  );
  const [general] = useState(() => {
    const settings: TypeModalStore = new TypeModalStore(
      root,
      initialModel,
      async () => {
        settings.open();
        await refresh();
      },
      canPublishSummary,
      store.hydrate,
    );
    settings.applyWithoutReview = true;
    return settings;
  });
  const [fieldModal] = useState(
    () => new FieldModalStore(root, initialModel, refresh, canPublishSummary, store.hydrate),
  );
  const [relationModal] = useState(
    () => new RelationshipModalStore(root, initialModel, refresh, canPublishSummary, store.hydrate),
  );
  useEffect(() => {
    for (const modal of [typeModal, general, fieldModal, relationModal]) modal.setCanRenewSummaries(canPublishSummary);
  }, [canPublishSummary, typeModal, general, fieldModal, relationModal]);
  useEffect(() => {
    const stores = [typeModal, fieldModal, relationModal];
    for (const modal of stores) root.registerModalStore(modal);
    return () => {
      for (const modal of stores) root.unregisterModalStore(modal);
    };
  }, [root, typeModal, fieldModal, relationModal]);

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
      window.history.replaceState(null, "", configureHref({ create: null }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [createRequested, canManage, model, typeModal]);

  const selected = model.types.find((type) => type.id === typeId);
  const selectedLabel = selected?.pluralLabel;
  useEffect(() => {
    if (!selectedLabel) return;
    root.layoutStore.setRuntimeIdentity({
      scope: "entity",
      key: "configure",
      title: selectedLabel,
      pictureUrl: null,
      avatarKind: null,
    });
    return () => root.layoutStore.clearRuntimeIdentity("entity", "configure");
  }, [root, selectedLabel]);

  useEffect(() => {
    if (!canManage || !selected) return;
    if (general.original?.id !== selected.id) {
      general.edit(model, selected);
      return;
    }
    if (general.model.revision >= model.revision || general.isLoading || general.pendingOperationId) return;
    if (!general.hasUnsavedChanges) {
      general.edit(model, selected);
      return;
    }
    general.open();
    general.rebaseDraft(model);
  }, [canManage, general, model, selected]);

  const listDeleted = useCallback(async () => {
    window.history.pushState(null, "", configureHref({ typeId: null }));
    await refresh();
  }, [refresh]);
  const fieldDeleted = useCallback(async () => {
    fieldModal.close();
    await refresh();
  }, [fieldModal, refresh]);
  const relationshipDeleted = useCallback(async () => {
    relationModal.close();
    await refresh();
  }, [relationModal, refresh]);
  const [focusedListId, setFocusedListId] = useState<string | null>(null);
  useFocusTarget(
    CONFIGURE_FOCUS_KINDS,
    (target) => {
      if (target.kind === "list") {
        setFocusedListId(target.id);
        return true;
      }
      if (!selected) return true;
      if (target.kind === "field") {
        const field = model.fields.find((candidate) => candidate.id === target.id && candidate.typeId === selected.id);
        if (field && isResolvedField(field)) fieldModal.edit(model, selected.id, field);
      }
      if (target.kind === "relationship") {
        const relation = model.relationships.find((candidate) => candidate.id === target.id);
        if (relation) relationModal.edit(model, selected.id, relation);
      }
      return true;
    },
    interactive,
  );
  const tryNavigate = useCallback((navigate: () => void) => root.navigationGuard.tryNavigate(navigate), [root]);
  const selectList = useCallback(
    (id: string) =>
      tryNavigate(() => {
        if (general.original?.id !== id) general.resetForm();
        window.history.pushState(null, "", configureHref({ typeId: id }));
      }),
    [general, tryNavigate],
  );
  const backToGraph = useCallback(
    () => tryNavigate(() => window.history.pushState(null, "", configureHref({ typeId: null }))),
    [tryNavigate],
  );
  const editChannels = (listId: string) => fieldModal.editChannels(model, listId);
  const add = useCallback(
    (kind: ConfigureAddKind) => {
      if (kind === "list") {
        typeModal.edit(model, null);
        return;
      }
      if (!selected) return;
      if (kind === "field") fieldModal.edit(model, selected.id, null);
      if (kind === "calculation")
        fieldModal.edit(model, selected.id, null, { behavior: "formula", valueType: "number" });
      if (kind === "relationship") relationModal.edit(model, selected.id);
      if (kind === "channels") fieldModal.edit(model, selected.id, null, { valueType: "channels" });
    },
    [fieldModal, model, relationModal, selected, typeModal],
  );
  const topBar = useMemo(
    () => (
      <ConfigureTopBarActions
        ai={
          <RecordAiAction
            registerContext
            className="shrink-0"
            context={
              selected
                ? { reference: { kind: "recordType", typeId: selected.id }, label: selected.pluralLabel }
                : { reference: { kind: "dataModel" }, label: t("RecordModel.configure") }
            }
          />
        }
        canManage={canManage}
        disabled={!interactive}
        general={general}
        generalFormId={generalFormId}
        model={model}
        selected={selected}
        onAdd={add}
        onDeleted={listDeleted}
        onSharedDefaults={() => {
          if (selected) typeModal.edit(model, selected, "appearance");
        }}
      />
    ),
    [add, canManage, general, generalFormId, interactive, model, selected, listDeleted, t, typeModal],
  );
  useSetTopBarActions(topBar);

  return (
    <div
      className="flex h-[calc(100svh-4rem)] min-h-0 flex-col md:h-[calc(100svh-5rem)]"
      data-configure-page=""
      data-configure-revision={model.revision}
    >
      {store.refreshFailed && (
        <div className="px-4 pt-4 md:px-8">
          <Alert color="danger" description={t("ErrorCard.title")}>
            <Button disabled={store.isRefreshing} size="sm" variant="secondary" onClick={() => runUserAction(refresh)}>
              {t("ErrorCard.retry")}
            </Button>
          </Alert>
        </div>
      )}

      {selected ? (
        <section aria-label={selected.pluralLabel} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <ConfigureListPane
            canManage={canManage}
            general={general}
            generalFormId={generalFormId}
            interactive={interactive}
            model={model}
            selected={selected}
            onEditChannels={() => editChannels(selected.id)}
            onEditField={(field) => fieldModal.edit(model, selected.id, field)}
            onEditRelationship={(relation) => relationModal.edit(model, selected.id, relation)}
            onEditRelationshipPath={(path) => relationModal.editPath(model, selected.id, path)}
          />
        </section>
      ) : typeId ? (
        <div className="w-full max-w-3xl space-y-4 p-4 md:p-6">
          <Button className="-ml-2 w-fit" size="sm" type="button" variant="ghost" onClick={backToGraph}>
            {t("RecordModel.configure")}
          </Button>

          <p className="text-sm text-muted-foreground">{t("RecordModel.listUnavailable")}</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <ConfigureGraph
            accounts={accounts}
            canManage={canManage}
            catalog={catalog}
            disabled={!interactive}
            focusedListId={focusedListId}
            layout={graphLayout}
            model={model}
            onAddField={(listId) => fieldModal.edit(model, listId, null)}
            onConnect={(sourceTypeId, targetTypeId) => relationModal.edit(model, sourceTypeId, undefined, targetTypeId)}
            onEditChannels={editChannels}
            onEditField={(listId, field) => fieldModal.edit(model, listId, field)}
            onEditRelationship={(relation) => relationModal.edit(model, relation.sourceTypeId, relation)}
            onLayoutChange={setGraphLayout}
            onSelectList={selectList}
          />
        </div>
      )}

      <TypeModal store={typeModal} />

      <FieldModal store={fieldModal} onDeleted={fieldDeleted} />

      <RelationshipModal store={relationModal} onDeleted={relationshipDeleted} />
    </div>
  );
});

export const ConfigurePageView = serverRenderedClient(ConfigurePageViewContent);
