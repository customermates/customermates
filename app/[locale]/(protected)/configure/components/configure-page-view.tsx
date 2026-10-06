"use client";

import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordModelOverview } from "@/features/records/get-record-model-overview.interactor";
import type { ConfigureAddKind } from "./configure-actions";
import type { ConfigureGraphAccounts } from "./configure-graph";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useClientReady } from "@/hooks/use-client-ready";
import { BREAKPOINT_QUERY } from "@/hooks/use-media-query";
import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { useRouter } from "@/i18n/navigation";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { Alert } from "@/components/shared/alert";
import { runUserAction } from "@/core/errors/report-application-error";
import { Button } from "@/components/ui/button";
import { VIEW_TAB_ACTIVE_CLASS, VIEW_TAB_CLASS } from "@/components/data-view/views/view-chip";
import { useRecordRouteReady } from "@/components/records/use-record-route-ready";
import { cn } from "@/core/utils/cn";

import { discoverRecordTypesAction, getRecordModelOverviewAction } from "../../records/actions";
import { ActivityPathModal, ActivityPathModalStore } from "./activity-path-modal";
import { ConfigureTopBarActions } from "./configure-actions";
import { ConfigureListPane } from "./configure-list-pane";
import { configureRailRows } from "./configure-model";
import { ConfigureRail } from "./configure-rail";
import { DataModelStore } from "./data-model.store";
import { FieldModal, FieldModalStore } from "./field-modal";
import { RelationshipModal, RelationshipModalStore } from "./relationship-modal";
import { TypeModal, TypeModalStore } from "./type-modal";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";

const ConfigureGraph = dynamic(() => import("./configure-graph").then((module) => module.ConfigureGraph), {
  ssr: false,
  loading: () => <div aria-busy className="min-h-0 flex-1 animate-pulse bg-muted/30" data-configure-graph-loading="" />,
});

const LAST_LIST_KEY = "customermates:configure:last-list";

function readLastList(scope: string) {
  try {
    return window.localStorage.getItem(`${LAST_LIST_KEY}:${scope}`);
  } catch {
    return null;
  }
}

function writeLastList(scope: string, typeId: string) {
  try {
    window.localStorage.setItem(`${LAST_LIST_KEY}:${scope}`, typeId);
  } catch {
    return;
  }
}

function queryHref(current: URLSearchParams, changes: Record<string, string | null>) {
  const params = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "?";
}

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
  overview: initialOverview,
  accounts,
  canManage,
  canPublishSummary = false,
}: {
  initialModel: RecordModel;
  overview: RecordModelOverview;
  accounts: ConfigureGraphAccounts;
  canManage: boolean;
  canPublishSummary?: boolean;
}) {
  useRecordRouteReady();
  const interactive = useClientReady();
  const root = useRootStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeId = searchParams.get("typeId") ?? undefined;
  const mode = searchParams.get("view") === "lists" || typeId ? "lists" : "graph";
  const createRequested = searchParams.get("create") === "true";
  const t = useTranslations();
  const generalFormId = useId();
  const [store] = useState(() => new DataModelStore(initialModel));
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  const authoritative = useRef(initialModel);
  useEffect(() => {
    if (authoritative.current === initialModel) return;
    authoritative.current = initialModel;
    store.hydrate(initialModel);
  }, [initialModel, store]);
  const model = store.model;
  const refresh = store.refresh;
  const [overview, setOverview] = useState(initialOverview);
  const overviewRevision = useRef(initialModel.revision);
  useEffect(() => setOverview(initialOverview), [initialOverview]);
  useEffect(() => {
    if (overviewRevision.current === model.revision) return;
    overviewRevision.current = model.revision;
    let current = true;
    getRecordModelOverviewAction().then(
      (next) => current && setOverview(next),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [model.revision]);
  const userScope = root.userStore.user?.id ?? "anonymous";
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
  const [activityModal] = useState(
    () => new ActivityPathModalStore(root, initialModel, refresh, canPublishSummary, store.hydrate),
  );
  useEffect(() => {
    for (const modal of [typeModal, general, fieldModal, relationModal, activityModal])
      modal.setCanRenewSummaries(canPublishSummary);
  }, [canPublishSummary, typeModal, general, fieldModal, relationModal, activityModal]);
  useEffect(() => {
    const stores = [typeModal, fieldModal, relationModal, activityModal];
    for (const modal of stores) root.registerModalStore(modal);
    return () => {
      for (const modal of stores) root.unregisterModalStore(modal);
    };
  }, [root, typeModal, fieldModal, relationModal, activityModal]);

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
  const rows = useMemo(
    () => configureRailRows(model, { query, showArchived, selectedId: selected?.id }),
    [model, query, showArchived, selected?.id],
  );
  const hasArchived = model.types.some((type) => type.archived);

  useEffect(() => {
    if (!interactive || typeId || mode !== "lists") return;
    if (!window.matchMedia(BREAKPOINT_QUERY.lg).matches) return;
    const candidates = configureRailRows(model, {});
    const remembered = readLastList(userScope);
    const target = candidates.find((row) => row.type.id === remembered)?.type.id ?? candidates[0]?.type.id;
    if (target) window.history.replaceState(null, "", configureHref({ typeId: target }));
  }, [interactive, typeId, mode, model, userScope]);

  useEffect(() => {
    if (selected) writeLastList(userScope, selected.id);
  }, [selected, userScope]);

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

  const tryNavigate = useCallback((navigate: () => void) => root.navigationGuard.tryNavigate(navigate), [root]);
  const selectList = useCallback(
    (id: string) =>
      tryNavigate(() => {
        if (general.original?.id !== id) general.resetForm();
        window.history.pushState(null, "", configureHref({ typeId: id, view: null }));
      }),
    [general, tryNavigate],
  );
  const setMode = useCallback(
    (next: "lists" | "graph") =>
      tryNavigate(() => {
        general.resetForm();
        window.history.pushState(
          null,
          "",
          configureHref(next === "lists" ? { view: "lists" } : { view: null, typeId: null }),
        );
      }),
    [general, tryNavigate],
  );
  const backToRail = useCallback(
    () => tryNavigate(() => window.history.pushState(null, "", configureHref({ typeId: null, view: "lists" }))),
    [tryNavigate],
  );
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
      if (kind === "activity") activityModal.edit(model, selected.id);
    },
    [activityModal, fieldModal, model, relationModal, selected, typeModal],
  );
  const topBar = useMemo(
    () => (
      <ConfigureTopBarActions
        canManage={canManage}
        disabled={!interactive}
        general={general}
        generalFormId={generalFormId}
        selected={mode === "lists" ? selected : undefined}
        onAdd={add}
        onArchive={() => {
          if (!selected) return;
          typeModal.edit(model, selected, "archive");
          typeModal.onChange("archived", !selected.archived);
        }}
        onSharedDefaults={() => {
          if (selected) typeModal.edit(model, selected, "appearance");
        }}
      />
    ),
    [add, canManage, general, generalFormId, interactive, mode, model, selected, typeModal],
  );
  useSetTopBarActions(topBar);

  const chips = (
    <nav
      aria-label={t("RecordModel.configureViews")}
      className="flex shrink-0 items-center gap-1.5 border-b border-border bg-background px-4 pb-3 ps-[calc(1rem+var(--safe-left,0px))] pe-[calc(1rem+var(--safe-right,0px))]"
      data-joins-top-bar=""
    >
      {(["graph", "lists"] as const).map((value) => (
        <a
          key={value}
          data-navigation-guard-handled
          aria-current={mode === value ? "page" : undefined}
          className={cn(VIEW_TAB_CLASS, mode === value && VIEW_TAB_ACTIVE_CLASS)}
          href={queryHref(searchParams, value === "lists" ? { view: "lists" } : { view: null, typeId: null })}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            if (mode !== value) setMode(value);
          }}
        >
          <span className="truncate">{value === "graph" ? t("RecordModel.graph.tab") : t("RecordModel.lists")}</span>
        </a>
      ))}
    </nav>
  );

  return (
    <div
      className="flex h-[calc(100svh-4rem)] min-h-0 flex-col md:h-[calc(100svh-5rem)]"
      data-configure-page=""
      data-configure-revision={model.revision}
    >
      {chips}

      {store.refreshFailed && (
        <div className="px-4 pt-4 md:px-8">
          <Alert color="danger" description={t("ErrorCard.title")}>
            <Button disabled={store.isRefreshing} size="sm" variant="secondary" onClick={() => runUserAction(refresh)}>
              {t("ErrorCard.retry")}
            </Button>
          </Alert>
        </div>
      )}

      {mode === "graph" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <ConfigureGraph
            accounts={accounts}
            action={
              <RecordAiAction
                registerContext
                className="shrink-0"
                context={{ reference: { kind: "dataModel" }, label: t("RecordModel.configure") }}
              />
            }
            canManage={canManage}
            disabled={!interactive}
            model={model}
            overview={overview}
            showArchived={showArchived}
            onAddField={(listId) => fieldModal.edit(model, listId, null)}
            onAddList={() => add("list")}
            onConnect={(sourceTypeId, targetTypeId) => relationModal.edit(model, sourceTypeId, undefined, targetTypeId)}
            onEditField={(listId, field) => {
              fieldModal.edit(model, listId, field);
              if (field.archived) fieldModal.onChange("archived", false);
            }}
            onEditRelationship={(relation) => {
              relationModal.edit(model, relation.sourceTypeId, relation);
              if (relation.archived) relationModal.onChange("archived", false);
            }}
            onSelectList={selectList}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside
            aria-label={t("RecordModel.lists")}
            className={cn("min-h-0 flex-col border-border lg:flex lg:border-r", typeId ? "hidden" : "flex flex-1")}
          >
            <ConfigureRail
              canManage={canManage}
              disabled={!interactive}
              hasArchived={hasArchived}
              hrefFor={(id) => queryHref(searchParams, { typeId: id, view: null })}
              query={query}
              rows={rows}
              selectedId={selected?.id}
              showArchived={showArchived}
              onCreate={() => add("list")}
              onQuery={setQuery}
              onSelect={selectList}
              onToggleArchived={() => setShowArchived((current) => !current)}
            />
          </aside>

          <section
            aria-label={selected?.pluralLabel ?? t("RecordModel.configure")}
            className={cn("min-h-0 min-w-0 flex-1 flex-col overflow-y-auto", typeId ? "flex" : "hidden lg:flex")}
          >
            {selected ? (
              <ConfigureListPane
                canManage={canManage}
                general={general}
                generalFormId={generalFormId}
                interactive={interactive}
                model={model}
                selected={selected}
                showArchived={showArchived}
                onBack={backToRail}
                onEditActivity={(path) => {
                  activityModal.edit(model, selected.id, path);
                  if (path.archived) activityModal.onChange("archived", false);
                }}
                onEditField={(field) => {
                  fieldModal.edit(model, selected.id, field);
                  if (field.archived) fieldModal.onChange("archived", false);
                }}
                onEditRelationship={(relation) => {
                  relationModal.edit(model, selected.id, relation);
                  if (relation.archived) relationModal.onChange("archived", false);
                }}
                onEditRelationshipPath={(path) => {
                  relationModal.editPath(model, selected.id, path);
                  if (path.archived) relationModal.onChange("archived", false);
                }}
                onToggleArchived={() => setShowArchived((current) => !current)}
              />
            ) : (
              typeId && (
                <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 md:px-8 md:py-8">
                  <Button
                    className="-ml-2 w-fit lg:hidden"
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={backToRail}
                  >
                    {t("RecordModel.allLists")}
                  </Button>

                  <p className="text-sm text-muted-foreground">{t("RecordModel.listUnavailable")}</p>
                </div>
              )
            )}
          </section>
        </div>
      )}

      <TypeModal store={typeModal} />

      <FieldModal store={fieldModal} />

      <RelationshipModal store={relationModal} />

      <ActivityPathModal store={activityModal} />
    </div>
  );
});

export const ConfigurePageView = serverRenderedClient(ConfigurePageViewContent);
