"use client";

import type { WikiPageListResult, WikiPageDto, WikiPageSummary } from "@/features/wiki/wiki.schema";
import type { ReactNode } from "react";
import type { ResizablePanelDefinition } from "@/components/layout/resizable-panels";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { observer } from "mobx-react-lite";
import { BookOpen, ChevronDown, Plus, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AgentStarterActions } from "@/app/components/agent-chat/suggested-questions";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormTextarea } from "@/components/forms/form-textarea";
import { Editor } from "@/components/editor/editor";
import { EditorLinkPickerContext } from "@/components/editor/editor-link-picker";
import { PageState } from "@/components/page-state/page-state";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRouter } from "@/i18n/navigation";
import { EMPTY_WIKI_HOMEPAGE_SETUP_STATE, useRefreshWhileWikiSetupWorks } from "@/components/wiki/wiki-homepage-setup";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { ResizablePanelGroup } from "@/components/layout/resizable-panels";
import { useP13nColumnWidths } from "@/components/shared/use-p13n-column-widths";
import { mergeStoredPanelSizes, readStoredPanelSizes } from "@/components/layout/resizable-panels.utils";

import { WikiPageStore } from "./wiki-page.store";
import { WikiPageActions } from "./wiki-page-actions";
import { WikiPageOutline } from "./wiki-page-outline";
import { WikiPageSkeleton } from "./wiki-page-skeleton";
import { WikiLinkPicker } from "./wiki-link-picker";
import { WikiPageRail } from "./wiki-page-rail";
import { resolveWikiPageState } from "./wiki-page-state";
import { WIKI_LAYOUT_P13N_ID, WIKI_PANEL_LAYOUT_ID } from "./wiki-personalization";
import { useWikiPages } from "./use-wiki-pages";
import { startWikiHomepageSetupAction } from "../actions";
import {
  WIKI_GUIDE_CONTEXT_MAX_BYTES,
  WIKI_PAGE_KINDS,
  WIKI_WHEN_TO_USE_MAX_LENGTH,
} from "@/features/wiki/wiki.schema";

const WIKI_PANEL_IDS = ["pages", "document"] as const;

type Props = {
  initialPage: WikiPageDto | null;
  initialSetupState?: WikiHomepageSetupState;
  layoutInitial?: Record<string, number>;
  listPage: WikiPageListResult;
  pinnedPage?: WikiPageSummary | null;
  unavailable?: boolean;
};

export const WikiPageView = observer(function WikiPageView({
  initialPage,
  initialSetupState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  layoutInitial,
  listPage,
  pinnedPage = null,
  unavailable = false,
}: Props) {
  const t = useTranslations();
  const rootStore = useRootStore();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [store] = useState(
    () =>
      new WikiPageStore(rootStore, initialPage, (pageId) => {
        startNavigation(() => {
          router.replace(pageId ? wikiPagePath(pageId) : "/wiki");
          router.refresh();
        });
      }),
  );
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
  const agentChatStore = rootStore.agentChatStore;
  const setupActive = initialSetupState.status === "working";
  const setupConversationId = setupActive ? initialSetupState.conversationId : null;
  const setupDomain = setupActive ? initialSetupState.domain : null;

  useEffect(() => store.receivePage(initialPage), [initialPage, store]);
  useEffect(() => {
    if (store.creating) titleContainer.current?.querySelector("input")?.focus();
  }, [store.creating]);

  const missing = !store.creating && (unavailable || store.unavailable);
  const hasDocument = !missing && (store.creating || Boolean(store.form.id));
  const pageState = resolveWikiPageState({ isNavigating, missing, hasDocument, setupActive });
  useRefreshWhileWikiSetupWorks(setupActive && !initialPage);
  const canOpenSetupTask =
    Boolean(setupConversationId) && rootStore.agentChatEnabled && agentChatStore.enabled !== false;
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
  const cancelCreate = useCallback(() => tryNavigate(() => store.load(initialPage)), [initialPage, store, tryNavigate]);
  const refreshFromWebsite = useCallback(
    () =>
      runUserAction(async () => {
        const result = await startWikiHomepageSetupAction({
          homepage: "refresh",
          clientRequestId: crypto.randomUUID(),
          mode: "refresh",
        });
        if (!result.ok) throw new Error("The website refresh could not start.");
        router.refresh();
      }),
    [router],
  );
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
          onRefreshFromWebsite={initialSetupState.refreshable ? refreshFromWebsite : undefined}
          onReload={reload}
        />
      ),
    [
      canManage,
      cancelCreate,
      create,
      formId,
      hasDocument,
      initialSetupState.refreshable,
      isNavigating,
      refreshFromWebsite,
      reload,
      setupActive,
      store,
    ],
  );
  useSetTopBarActions(topBar);
  const kindLabels = {
    guide: t("Wiki.kind.guide"),
    procedure: t("Wiki.kind.procedure"),
    knowledge: t("Wiki.kind.knowledge"),
  };
  const kindHelp = {
    guide: t("Wiki.kind.guideHelp", { bytes: WIKI_GUIDE_CONTEXT_MAX_BYTES }),
    procedure: t("Wiki.kind.procedureHelp"),
    knowledge: t("Wiki.kind.knowledgeHelp"),
  };
  const otherGuide =
    !pages.query && pages.result.items.some(({ id, kind }) => kind === "guide" && id !== store.form.id);
  const pinnedRailPage = pinnedPage && !pages.result.items.some(({ id }) => id === pinnedPage.id) ? pinnedPage : null;
  const railBusy = store.isLoading || isNavigating;
  const pageList = (
    <WikiPageRail
      busy={railBusy}
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
          action={
            canOpenSetupTask ? (
              <Button
                data-agent-focus-return
                disabled={
                  Boolean(agentChatStore.historyMutationPending) ||
                  (agentChatStore.isWorking && agentChatStore.conversationId !== setupConversationId)
                }
                size="sm"
                variant="secondary"
                onClick={() => {
                  agentChatStore.open();
                  runUserAction(async () => {
                    await agentChatStore.loadConfig();
                    if (setupConversationId) await agentChatStore.selectConversation(setupConversationId);
                  });
                }}
              >
                {t("WikiSetup.openTask")}
              </Button>
            ) : undefined
          }
          background={<WikiPageSkeleton documentOnly animated={false} />}
          description={
            !setupDomain
              ? undefined
              : setupConversationId
                ? t("WikiSetup.status.workingBodyWiki", { domain: setupDomain })
                : t("WikiSetup.status.workingBodyNoTaskWiki", { domain: setupDomain })
          }
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
                canManage ? (
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
          description={canManage ? t("Wiki.emptyBody") : t("Wiki.emptyBodyReadOnly")}
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

              {store.form.draft && store.form.id && (
                <Alert color="primary">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p>{t("Wiki.draft.body")}</p>

                    {canManage && (
                      <Button
                        disabled={store.isLoading}
                        size="sm"
                        variant="secondary"
                        onClick={() => runUserAction(store.publish)}
                      >
                        {t("Wiki.draft.publish")}
                      </Button>
                    )}
                  </div>
                </Alert>
              )}

              <div ref={titleContainer}>
                {canManage ? (
                  <FormInput
                    required
                    aria-label={t("Wiki.pageTitle")}
                    className="h-auto rounded-none border-0 bg-transparent px-0 py-1 text-3xl font-semibold tracking-tight shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-2 md:text-3xl"
                    id="title"
                    label={null}
                    maxLength={120}
                    placeholder={t("Wiki.untitled")}
                  />
                ) : (
                  <h1 className="break-words text-3xl font-semibold tracking-tight">{store.form.title}</h1>
                )}
              </div>

              {canManage ? (
                <div className="grid gap-3" data-wiki-page-kind="">
                  <FormSelect
                    description={kindHelp[store.form.kind]}
                    id="kind"
                    items={WIKI_PAGE_KINDS.map((kind) => ({
                      value: kind,
                      label: kindLabels[kind],
                      disabled: kind === "guide" && otherGuide,
                    }))}
                    label={t("Wiki.kind.label")}
                  />

                  {store.form.kind === "procedure" && (
                    <FormTextarea
                      required
                      id="whenToUse"
                      label={t("Wiki.whenToUse.label")}
                      maxLength={WIKI_WHEN_TO_USE_MAX_LENGTH}
                      placeholder={t("Wiki.whenToUse.placeholder")}
                      rows={2}
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
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <div className="flex min-w-0 items-center border-b border-border px-4 py-2 lg:hidden">
              <SheetTrigger asChild>
                <Button className="min-w-0 max-w-full justify-between gap-3 font-normal" variant="ghost">
                  <BookOpen aria-hidden="true" className="shrink-0" />

                  <span className="truncate">{store.form.title || t("Wiki.pagesLabel")}</span>

                  <ChevronDown aria-hidden="true" className="shrink-0" />
                </Button>
              </SheetTrigger>
            </div>

            <SheetContent aria-describedby={undefined} className="gap-0" side="left">
              <SheetHeader>
                <SheetTitle>{t("Wiki.pagesLabel")}</SheetTitle>
              </SheetHeader>

              <SheetBody className="flex min-h-0 flex-1 flex-col p-0">{pageList}</SheetBody>
            </SheetContent>
          </Sheet>

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
