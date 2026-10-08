"use client";

import type { WikiPageKind, WikiPageListResult, WikiPageDto, WikiPageSummary } from "@/features/wiki/wiki.schema";
import type { ReactNode } from "react";
import type { ResizablePanelDefinition } from "@/components/layout/resizable-panels";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { observer } from "mobx-react-lite";
import { reaction } from "mobx";
import { BookOpen, ChevronDown, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AgentStarterActions } from "@/app/components/agent-chat/suggested-questions";
import { AppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import { FormTextarea } from "@/components/forms/form-textarea";
import { Editor } from "@/components/editor/editor";
import { EditorLinkPickerContext } from "@/components/editor/editor-link-picker";
import { PageState } from "@/components/page-state/page-state";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { FormFieldHelp } from "@/components/forms/form-field-help";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useNavigationGuard } from "@/components/modal/use-navigation-guard";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRouter } from "@/i18n/navigation";
import {
  EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  useRefreshWhileWikiSetupWorks,
  useWikiSetupFailureBody,
} from "@/components/wiki/wiki-homepage-setup";
import { WikiSetupProgress } from "@/components/wiki/wiki-setup-progress";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { ResizablePanelGroup } from "@/components/layout/resizable-panels";
import { useP13nColumnWidths } from "@/components/shared/use-p13n-column-widths";
import { mergeStoredPanelSizes, readStoredPanelSizes } from "@/components/layout/resizable-panels.utils";

import { WikiPageActions } from "./wiki-page-actions";
import { WikiPageOutline } from "./wiki-page-outline";
import { WikiPageSkeleton } from "./wiki-page-skeleton";
import { WikiLinkPicker } from "./wiki-link-picker";
import { WikiPageRail } from "./wiki-page-rail";
import { resolveWikiPageState } from "./wiki-page-state";
import { WIKI_LAYOUT_P13N_ID, WIKI_PANEL_LAYOUT_ID } from "./wiki-personalization";
import { useWikiPages } from "./use-wiki-pages";
import { WikiPageKindSchema, WIKI_PAGE_KINDS, WIKI_WHEN_TO_USE_MAX_LENGTH } from "@/features/wiki/wiki.schema";
import { serverRenderedClient } from "@/core/utils/server-rendered-client";
import { Action } from "@/generated/prisma";

const WIKI_PANEL_IDS = ["pages", "document"] as const;

type Props = {
  initialPage: WikiPageDto | null;
  initialSetupState?: WikiHomepageSetupState;
  layoutInitial?: Record<string, number>;
  listPage: WikiPageListResult;
  pinnedPage?: WikiPageSummary | null;
  requestedPageId?: string;
  unavailable?: boolean;
};

const WikiPageViewContent = observer(function WikiPageView({
  initialPage,
  initialSetupState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  layoutInitial,
  listPage,
  pinnedPage = null,
  requestedPageId,
  unavailable = false,
}: Props) {
  const t = useTranslations();
  const rootStore = useRootStore();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [store] = useState(() => {
    const cached = rootStore.wikiPageStore;
    cached.initializeServerPage(initialPage, requestedPageId);
    return cached;
  });
  useNavigationGuard(store);
  const formId = useId();
  const titleContainer = useRef<HTMLDivElement>(null);
  const documentContainer = useRef<HTMLDivElement>(null);
  const pages = useWikiPages(listPage);
  const { columnWidths, commitColumnWidths } = useP13nColumnWidths({
    initial: layoutInitial,
    p13nId: rootStore.appMode === "demo" ? undefined : WIKI_LAYOUT_P13N_ID,
    persistenceScope: rootStore.userStore?.user?.id ?? "anonymous",
  });
  const initialPanelSizes = readStoredPanelSizes(columnWidths, WIKI_PANEL_LAYOUT_ID, WIKI_PANEL_IDS, false);
  const canManage = store.canManage;
  const setupActive = initialSetupState.status === "working";
  const setupDomain = setupActive ? initialSetupState.domain : null;

  useLayoutEffect(() => {
    store.receiveServerPage(initialPage, requestedPageId);
    const savedState = store.savedState;
    return reaction(
      () => store.creating || store.hasUnsavedChanges || store.isLoading,
      (blocked) => {
        if (!blocked && store.savedState === savedState) store.receiveServerPage(initialPage, requestedPageId);
      },
    );
  }, [initialPage, requestedPageId, store]);
  useEffect(() => {
    if (store.creating) titleContainer.current?.querySelector("textarea")?.focus();
  }, [store.creating]);

  const missing =
    !store.creating &&
    (store.unavailable || (unavailable && !store.awaitingSelection && !store.hasUnsavedChanges && !store.isLoading));
  const hasDocument = !missing && (store.creating || Boolean(store.form.id));
  const pageState = resolveWikiPageState({
    isNavigating,
    missing,
    hasDocument,
    setupActive,
  });
  useRefreshWhileWikiSetupWorks(initialSetupState);
  const setupFailedBody = useWikiSetupFailureBody(initialSetupState);
  const tryNavigate = useCallback(
    (navigate: () => void) => rootStore.navigationGuard.tryNavigate(navigate),
    [rootStore],
  );
  const create = useCallback(() => {
    tryNavigate(() => {
      store.startCreate();
      setMobileOpen(false);
    });
  }, [store, tryNavigate]);
  const selectPage = (pageId: string) => {
    if (!store.creating && pageId === store.form.id) {
      setMobileOpen(false);
      return;
    }
    tryNavigate(() => {
      store.load(initialPage);
      setMobileOpen(false);
      startNavigation(() => router.push(wikiPagePath(pageId)));
    });
  };
  const reload = useCallback(() => tryNavigate(() => runUserAction(store.reload)), [store, tryNavigate]);
  const cancelCreate = useCallback(() => store.load(initialPage), [initialPage, store]);
  const savePanelSizes = useCallback(
    (sizes: readonly number[] | null) => {
      commitColumnWidths((current) =>
        mergeStoredPanelSizes(current, WIKI_PANEL_LAYOUT_ID, WIKI_PANEL_IDS, sizes, false),
      );
    },
    [commitColumnWidths],
  );
  const topBar = useMemo(
    () =>
      isNavigating ? null : (
        <WikiPageActions
          canCreate={!setupActive}
          canManage={canManage}
          formId={formId}
          hasDocument={hasDocument}
          store={store}
          onCancelCreate={cancelCreate}
          onCreate={create}
          onReload={reload}
        />
      ),
    [canManage, cancelCreate, create, formId, hasDocument, isNavigating, reload, setupActive, store],
  );
  useSetTopBarActions(topBar);
  const kindLabels: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guide"),
    procedure: t("Wiki.kind.procedure"),
    knowledge: t("Wiki.kind.knowledge"),
  };
  const kindHelp: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guideHelp"),
    procedure: t("Wiki.kind.procedureHelp"),
    knowledge: t("Wiki.kind.knowledgeHelp"),
  };
  const kindDescriptions: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guideDescription"),
    procedure: t("Wiki.kind.procedureDescription"),
    knowledge: t("Wiki.kind.knowledgeDescription"),
  };
  const otherGuide =
    (pinnedPage?.kind === "guide" && pinnedPage.id !== store.form.id) ||
    pages.result.items.some(({ id, kind }) => kind === "guide" && id !== store.form.id);
  const pinnedRailPage = pinnedPage && !pages.result.items.some(({ id }) => id === pinnedPage.id) ? pinnedPage : null;
  const railBusy = store.isLoading || isNavigating;
  const pageList = (
    <WikiPageRail
      busy={railBusy}
      canManage={store.allows(Action.update)}
      currentPageId={store.creating ? null : store.form.id}
      pages={pages}
      pinnedPage={pinnedRailPage}
      onSelect={selectPage}
    />
  );

  let documentBody: ReactNode;
  switch (pageState) {
    case "loading":
      documentBody = (
        <PageState background={<WikiPageSkeleton documentOnly />} label={t("PageState.loading")} state="loading" />
      );
      break;
    case "error":
      documentBody = (
        <PageState description={t("Wiki.unavailableBody")} state="error" title={t("Wiki.unavailableTitle")} />
      );
      break;
    case "setup":
      documentBody = (
        <PageState
          action={<WikiSetupProgress state={initialSetupState} />}
          background={<WikiPageSkeleton documentOnly animated={false} />}
          description={setupDomain ? t("WikiSetup.status.workingBodyWiki", { domain: setupDomain }) : undefined}
          icon={Sparkles}
          state="empty"
          title={t("WikiSetup.status.workingTitle")}
        />
      );
      break;
    case "empty":
      documentBody = (
        <PageState
          action={
            <AgentStarterActions
              fallback={
                store.allows(Action.create) ? (
                  <Button disabled={store.isLoading} size="sm" variant="secondary" onClick={create}>
                    <Plus aria-hidden="true" />

                    {t("Wiki.newPage")}
                  </Button>
                ) : undefined
              }
              pageId="wiki"
              state="empty"
              surface="page"
            />
          }
          background={<WikiPageSkeleton documentOnly animated={false} />}
          description={store.allows(Action.create) ? t("Wiki.emptyBody") : t("Wiki.emptyBodyReadOnly")}
          icon={BookOpen}
          state="empty"
          title={t("Wiki.emptyTitle")}
        />
      );
      break;
    case "content":
      documentBody = (
        <AppForm id={formId} store={store}>
          <div
            className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-12 px-6 py-8 md:px-10 md:py-10 @min-[68rem]/wiki:grid-cols-[minmax(0,48rem)_12rem] @min-[68rem]/wiki:justify-center"
            data-wiki-document-layout=""
          >
            <div ref={documentContainer} className="mx-auto w-full max-w-3xl min-w-0 space-y-6 @min-[68rem]/wiki:mx-0">
              {store.conflict && (
                <Alert color="warning">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p>{t("Wiki.conflict")}</p>

                    <Button disabled={store.isLoading} size="sm" variant="secondary" onClick={reload}>
                      {t("Wiki.reload")}
                    </Button>
                  </div>
                </Alert>
              )}

              <div ref={titleContainer}>
                {canManage ? (
                  <FormTextarea
                    required
                    aria-label={t("Wiki.pageTitle")}
                    className="min-h-0 resize-none rounded-none border-0 bg-transparent px-0 py-1 text-3xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-2 md:text-3xl"
                    id="title"
                    label={null}
                    maxLength={120}
                    placeholder={t("Wiki.untitled")}
                    rows={1}
                  />
                ) : (
                  <h1 className="break-words text-3xl font-semibold tracking-tight">{store.form.title}</h1>
                )}
              </div>

              {canManage ? (
                <div className="grid gap-3" data-wiki-page-kind="">
                  <FormSelect
                    className="h-8 w-auto min-w-32 text-sm"
                    containerClassName="w-fit"
                    id="kind"
                    items={WIKI_PAGE_KINDS.map((kind) => ({
                      value: kind,
                      label: kindLabels[kind],
                      description: kind === "guide" && otherGuide ? t("Wiki.kind.guideExists") : kindDescriptions[kind],
                      disabled: kind === "guide" && otherGuide,
                    }))}
                    label={t("Wiki.kind.label")}
                    labelEndAddon={
                      <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: t("Wiki.kind.label") })}>
                        {kindHelp[store.form.kind]}
                      </FormFieldHelp>
                    }
                    onValueChange={(value) => {
                      const kind = WikiPageKindSchema.safeParse(value);
                      if (kind.success) store.onChange("kind", kind.data);
                    }}
                  />

                  {store.form.kind === "procedure" && (
                    <FormTextarea
                      required
                      className="min-h-0 resize-none"
                      id="whenToUse"
                      label={t("Wiki.whenToUse.label")}
                      maxLength={WIKI_WHEN_TO_USE_MAX_LENGTH}
                      placeholder={t("Wiki.whenToUse.placeholder")}
                      rows={1}
                    />
                  )}
                </div>
              ) : (
                store.form.kind !== "knowledge" && (
                  <p className="text-sm text-muted-foreground">
                    {kindLabels[store.form.kind]}

                    {store.form.kind === "procedure" && store.form.whenToUse ? `: ${store.form.whenToUse}` : ""}
                  </p>
                )
              )}

              <EditorLinkPickerContext.Provider value={WikiLinkPicker}>
                <Editor
                  data={store.editorDocument}
                  readOnly={!canManage || store.isLoading}
                  onChange={store.onEditorChange}
                />
              </EditorLinkPickerContext.Provider>
            </div>

            <WikiPageOutline containerRef={documentContainer} document={store.editorDocument} />
          </div>
        </AppForm>
      );
      break;
    default: {
      const exhaustive: never = pageState;
      documentBody = exhaustive;
    }
  }

  const panelDefinitions: ResizablePanelDefinition[] = [
    {
      id: "pages",
      label: t("Wiki.pagesLabel"),
      controlId: "wiki-pages-panel",
      minimumSize: 192,
      maximumSize: 384,
      defaultSize: 240,
      element: (
        <aside className="hidden min-h-0 flex-col lg:flex" id="wiki-pages-panel">
          {pageList}
        </aside>
      ),
    },
    {
      id: "document",
      label: t("Wiki.document"),
      controlId: "wiki-document-panel",
      minimumSize: 480,
      defaultSize: 720,
      element: (
        <section
          aria-label={t("Wiki.document")}
          className="@container/wiki flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
          id="wiki-document-panel"
        >
          <div className="flex min-w-0 items-center border-b border-border px-4 py-2 lg:hidden">
            <ResponsiveOverlay
              align="start"
              open={mobileOpen}
              popoverClassName="flex h-96 w-80 flex-col p-0"
              title={t("Wiki.pagesLabel")}
              trigger={
                <Button className="min-w-0 max-w-full justify-between gap-3 font-normal" variant="ghost">
                  <BookOpen aria-hidden="true" className="shrink-0" />

                  <span className="truncate">{store.form.title || t("Wiki.pagesLabel")}</span>

                  <ChevronDown aria-hidden="true" className="shrink-0" />
                </Button>
              }
              onOpenChange={setMobileOpen}
            >
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{pageList}</div>
            </ResponsiveOverlay>
          </div>

          {((store.allows(Action.create) && initialSetupState.status === "failed") || (setupActive && hasDocument)) && (
            <div className="mx-auto w-full max-w-6xl px-6 py-3 md:px-10">
              {initialSetupState.status === "failed" ? (
                <Alert color="danger" description={setupFailedBody} />
              ) : (
                <div aria-live="polite" className="text-sm text-muted-foreground">
                  {initialSetupState.progress && initialSetupState.progress.total > 0
                    ? t("WikiSetup.status.readingBody", {
                        domain: initialSetupState.domain ?? "",
                        fetched: initialSetupState.progress.fetched,
                        total: initialSetupState.progress.total,
                      })
                    : t("WikiSetup.status.workingTitle")}
                </div>
              )}
            </div>
          )}

          {documentBody}
        </section>
      ),
    },
  ];

  return (
    <ResizablePanelGroup
      className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[var(--panel-grid-template)]"
      defaultTemplate="15rem 1px minmax(30rem, 1fr)"
      handleClassName="hidden lg:flex"
      initialSizes={initialPanelSizes}
      layoutMode="fixed-first"
      panels={panelDefinitions}
      onSizesCommit={savePanelSizes}
    />
  );
});

export const WikiPageView = serverRenderedClient(WikiPageViewContent);
