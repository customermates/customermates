"use client";

import type { WikiPageListResult, WikiPageDto, WikiPageSummary } from "@/features/wiki/wiki.schema";
import type { ResizablePanelDefinition } from "@/components/shared/resizable-panels";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { observer } from "mobx-react-lite";
import { BookOpen, ChevronDown, FileText, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { Editor } from "@/components/editor/editor";
import { EditorLinkPickerContext } from "@/components/editor/editor-link-picker";
import { PageState } from "@/components/page-state/page-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { EMPTY_WIKI_HOMEPAGE_SETUP_STATE, WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";
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

type Props = {
  initialPage: WikiPageDto | null;
  initialSetupState?: WikiHomepageSetupState;
  layoutInitial?: Record<string, number>;
  listPage: WikiPageListResult;
  pinnedPage?: WikiPageSummary | null;
  readOnly?: boolean;
  unavailable?: boolean;
};

const WikiPageViewComponent = ({
  initialPage,
  initialSetupState = EMPTY_WIKI_HOMEPAGE_SETUP_STATE,
  layoutInitial,
  listPage,
  pinnedPage = null,
  readOnly = false,
  unavailable = false,
}: Props) => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [hasMounted, setHasMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [setupStarted, setSetupStarted] = useState(false);
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
    p13nId: readOnly ? undefined : WIKI_LAYOUT_P13N_ID,
    persistenceScope: rootStore.userStore?.user?.id ?? "anonymous",
  });
  const initialPanelSizes = readStoredPanelSizes(columnWidths, WIKI_PANEL_LAYOUT_ID, WIKI_PANEL_IDS, false);
  const canManage = store.canManage && !readOnly;
  const setupActive = initialSetupState.status === "working" || setupStarted;

  useEffect(() => store.receivePage(initialPage), [initialPage, store]);
  useEffect(() => setHasMounted(true), []);
  useEffect(() => setSetupStarted(initialSetupState.status === "working"), [initialSetupState.status]);
  useEffect(() => {
    if (store.creating) titleContainer.current?.querySelector("input")?.focus();
  }, [store.creating]);

  const missing = !store.creating && (unavailable || store.unavailable);
  const hasDocument = !missing && (store.creating || Boolean(store.form.id));
  const canSetupWithMate =
    hasMounted && canManage && rootStore.agentChatEnabled && rootStore.agentChatStore.enabled !== false;
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
          onCreate={create}
          onReload={reload}
        />
      ),
    [canManage, create, formId, hasDocument, isNavigating, reload, setupActive, store],
  );
  useSetTopBarActions(topBar);
  const pinnedRailPage = pinnedPage && !pages.result.items.some(({ id }) => id === pinnedPage.id) ? pinnedPage : null;
  const pageButton = (page: WikiPageSummary) => (
    <Button
      key={page.id}
      aria-current={!store.creating && page.id === store.form.id ? "page" : undefined}
      className={cn(
        "mb-0.5 h-auto min-h-9 w-full justify-start gap-2 p-2 text-left font-normal",
        !store.creating && page.id === store.form.id && "bg-accent text-accent-foreground",
      )}
      disabled={store.isLoading || isNavigating}
      variant="ghost"
      onClick={() => selectPage(page.id)}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" />

      <span className="truncate">{page.title}</span>
    </Button>
  );

  const pageList = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-3 mb-3 mt-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />

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
        {pinnedRailPage && <div className="pb-1">{pageButton(pinnedRailPage)}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {pages.failed ? (
            <div className="space-y-2 p-3 text-sm text-muted-foreground">
              <p>{t("Wiki.loadFailed")}</p>

              <Button size="xs" variant="secondary" onClick={pages.retry}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          ) : pages.result.items.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {pages.query ? t("Wiki.noResults") : t("Wiki.pagesLabel")}
            </p>
          ) : (
            pages.result.items.map(pageButton)
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
        <main className="@container/wiki flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" id="wiki-document-panel">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <div className="flex min-w-0 items-center border-b border-border px-4 py-2 lg:hidden">
              <SheetTrigger asChild>
                <Button className="min-w-0 max-w-full justify-between gap-3 font-normal" variant="ghost">
                  <BookOpen className="shrink-0" />

                  <span className="truncate">{store.form.title || t("Wiki.pagesLabel")}</span>

                  <ChevronDown className="shrink-0" />
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

          {isNavigating ? (
            <PageState background={<WikiPageSkeleton documentOnly />} label={t("PageState.loading")} state="loading" />
          ) : missing ? (
            <PageState description={t("Wiki.unavailableBody")} state="error" title={t("Wiki.unavailableTitle")} />
          ) : !hasDocument ? (
            <PageState
              action={
                canManage ? (
                  <div className="w-full max-w-xl space-y-4">
                    {(canSetupWithMate || initialSetupState.status !== "idle") && (
                      <WikiHomepageSetup
                        canStart={canSetupWithMate}
                        initialState={initialSetupState}
                        onAccepted={async (conversationId) => {
                          setSetupStarted(true);
                          rootStore.agentChatStore.open();
                          await rootStore.agentChatStore.loadConfig();
                          await rootStore.agentChatStore.selectConversation(conversationId);
                        }}
                        onCreateBlank={setupActive ? undefined : create}
                      />
                    )}

                    {!canSetupWithMate && !setupActive ? (
                      <Button disabled={store.isLoading} size="sm" variant="secondary" onClick={create}>
                        <Plus />

                        {t("Wiki.newPage")}
                      </Button>
                    ) : null}
                  </div>
                ) : undefined
              }
              background={<WikiPageSkeleton documentOnly animated={false} />}
              description={
                !canManage
                  ? t("Wiki.emptyBodyReadOnly")
                  : canSetupWithMate || initialSetupState.status !== "idle"
                    ? t("Wiki.emptyBody")
                    : t("Wiki.emptyBodyManual")
              }
              icon={BookOpen}
              state="empty"
              title={t("Wiki.emptyTitle")}
            />
          ) : (
            <AppForm id={formId} store={store}>
              <div
                className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-12 px-6 py-8 md:px-10 md:py-10 @6xl/wiki:grid-cols-[minmax(0,48rem)_12rem] @6xl/wiki:justify-center"
                data-wiki-document-layout=""
              >
                <div ref={documentContainer} className="mx-auto w-full max-w-3xl min-w-0 space-y-6 @6xl/wiki:mx-0">
                  {store.conflict && (
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                      role="alert"
                    >
                      <p>{t("Wiki.conflict")}</p>

                      <Button disabled={store.isLoading} size="sm" variant="secondary" onClick={reload}>
                        {t("Wiki.reload")}
                      </Button>
                    </div>
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
          )}
        </main>
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
