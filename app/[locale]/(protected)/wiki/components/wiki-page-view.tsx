"use client";

import type { WikiPageListResult, WikiPageDto, WikiPageSummary } from "@/features/wiki/wiki.schema";
import type { ReactNode } from "react";
import type { ResizablePanelDefinition } from "@/components/shared/resizable-panels";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { observer } from "mobx-react-lite";
import { BookOpen, ChevronDown, FileText, Plus, Search, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AgentStarterActions } from "@/app/components/agent-chat/suggested-questions";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { Editor } from "@/components/editor/editor";
import { EditorLinkPickerContext } from "@/components/editor/editor-link-picker";
import { PageState } from "@/components/page-state/page-state";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { IntlLink, useRouter } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { EMPTY_WIKI_HOMEPAGE_SETUP_STATE, useRefreshWhileWikiSetupWorks } from "@/components/wiki/wiki-homepage-setup";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import type { WikiHomepageSetupState } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";
import { ResizablePanelGroup } from "@/components/shared/resizable-panels";
import { useP13nColumnWidths } from "@/components/shared/use-p13n-column-widths";
import { mergeStoredPanelSizes, readStoredPanelSizes } from "@/components/shared/resizable-panels.utils";
import { WIKI_LAYOUT_P13N_ID, WIKI_PANEL_LAYOUT_ID } from "@/features/wiki/wiki-layout";

import { WikiPageStore } from "./wiki-page.store";
import { WikiPageActions } from "./wiki-page-actions";
import { WikiPageOutline } from "./wiki-page-outline";
import { WikiPageSkeleton } from "./wiki-page-skeleton";
import { WikiLinkPicker } from "./wiki-link-picker";
import { useWikiPages } from "./use-wiki-pages";

const WIKI_PANEL_IDS = ["pages", "document"] as const;

export type WikiPageState = "loading" | "error" | "setup" | "empty" | "content";

export function resolveWikiPageState({
  isNavigating,
  missing,
  hasDocument,
  setupActive,
}: {
  isNavigating: boolean;
  missing: boolean;
  hasDocument: boolean;
  setupActive: boolean;
}): WikiPageState {
  if (isNavigating) return "loading";
  if (missing) return "error";
  if (hasDocument) return "content";
  return setupActive ? "setup" : "empty";
}

type Props = {
  initialPage: WikiPageDto | null;
  initialSetupState?: WikiHomepageSetupState;
  layoutInitial?: Record<string, number>;
  listPage: WikiPageListResult;
  pinnedPage?: WikiPageSummary | null;
  unavailable?: boolean;
};

const WikiPageViewComponent = ({
  initialPage,
  initialSetupState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  layoutInitial,
  listPage,
  pinnedPage = null,
  unavailable = false,
}: Props) => {
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
  const pinnedRailPage = pinnedPage && !pages.result.items.some(({ id }) => id === pinnedPage.id) ? pinnedPage : null;
  const railBusy = store.isLoading || isNavigating;
  const pageLink = (page: WikiPageSummary) => {
    const current = !store.creating && page.id === store.form.id;
    return (
      <Button
        key={page.id}
        asChild
        className={cn(
          "mb-0.5 h-auto min-h-9 w-full justify-start gap-2 p-2 text-left font-normal",
          current && "bg-accent text-accent-foreground",
          railBusy && "pointer-events-none opacity-50",
        )}
        variant="ghost"
      >
        <IntlLink
          aria-current={current ? "page" : undefined}
          aria-disabled={railBusy || undefined}
          href={wikiPagePath(page.id)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            if (!railBusy) selectPage(page.id);
          }}
        >
          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

          <span className="truncate">{page.title}</span>
        </IntlLink>
      </Button>
    );
  };

  const pageList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-3 mb-3 mt-4">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />

        <Input
          aria-label={t("Wiki.search")}
          className="h-8 pl-8"
          maxLength={200}
          placeholder={t("Wiki.search")}
          type="search"
          value={pages.query}
          onChange={(event) => pages.search(event.target.value)}
        />
      </div>

      <nav
        aria-busy={pages.loading}
        aria-label={t("Wiki.pagesLabel")}
        className="flex min-h-0 flex-1 flex-col px-2 pb-2"
      >
        {pinnedRailPage && <div className="pb-1">{pageLink(pinnedRailPage)}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {pages.failed ? (
            <div className="space-y-2 p-3 text-sm text-muted-foreground">
              <p>{t("Wiki.loadFailed")}</p>

              <Button size="xs" variant="secondary" onClick={pages.retry}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          ) : pages.result.items.length === 0 ? (
            pages.query ? (
              <p className="p-3 text-sm text-muted-foreground">{t("Wiki.noResults")}</p>
            ) : null
          ) : (
            pages.result.items.map(pageLink)
          )}
        </div>

        {pages.loading && (
          <span className="sr-only" role="status">
            {t("PageState.loading")}
          </span>
        )}
      </nav>

      {pages.result.total > pages.result.pageSize && (
        <div className="flex items-center justify-between gap-1 border-t border-border p-2 text-xs text-muted-foreground">
          <Button
            disabled={pages.loading || pages.page <= 1}
            size="xs"
            variant="ghost"
            onClick={() => pages.setPage(pages.page - 1)}
          >
            {t("Wiki.previous")}
          </Button>

          <span>
            {t("Wiki.page", {
              current: pages.page,
              total: Math.ceil(pages.result.total / pages.result.pageSize),
            })}
          </span>

          <Button
            disabled={pages.loading || pages.page * pages.result.pageSize >= pages.result.total}
            size="xs"
            variant="ghost"
            onClick={() => pages.setPage(pages.page + 1)}
          >
            {t("Wiki.next")}
          </Button>
        </div>
      )}
    </div>
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
};

export const WikiPageView = observer(WikiPageViewComponent);
