"use client";

import type { WikiPageListResult, WikiPageDto } from "@/features/wiki/wiki.schema";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";

import { WikiPageStore } from "./wiki-page.store";
import { WikiPageActions } from "./wiki-page-actions";
import { WikiPageSkeleton } from "./wiki-page-skeleton";
import { WikiLinkPicker } from "./wiki-link-picker";
import { useWikiPages } from "./use-wiki-pages";

type Props = {
  initialPage: WikiPageDto | null;
  listPage: WikiPageListResult;
  unavailable?: boolean;
};

export const WikiPageView = observer(({ initialPage, listPage, unavailable = false }: Props) => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [store] = useState(
    () =>
      new WikiPageStore(rootStore, initialPage, (pageId) => {
        router.replace(pageId ? `/wiki?page=${pageId}` : "/wiki");
        router.refresh();
      }),
  );
  const formId = useId();
  const titleContainer = useRef<HTMLDivElement>(null);
  const pages = useWikiPages(listPage);

  useEffect(() => store.receivePage(initialPage), [initialPage, store]);
  useEffect(() => setHasMounted(true), []);
  useEffect(() => {
    if (store.creating) titleContainer.current?.querySelector("input")?.focus();
  }, [store.creating]);

  const missing = !store.creating && (unavailable || store.unavailable);
  const hasDocument = !missing && (store.creating || Boolean(store.form.id));
  const canSetupWithMate =
    hasMounted && store.canManage && rootStore.agentChatEnabled && rootStore.agentChatStore.enabled !== false;
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
      router.push(`/wiki?page=${pageId}`);
    });
  };
  const reload = useCallback(() => tryNavigate(() => runUserAction(store.reload)), [store, tryNavigate]);
  const topBar = useMemo(
    () => (
      <WikiPageActions formId={formId} hasDocument={hasDocument} store={store} onCreate={create} onReload={reload} />
    ),
    [create, formId, hasDocument, reload, store],
  );
  useSetTopBarActions(topBar);

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
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
      >
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
          pages.result.items.map((page) => (
            <Button
              key={page.id}
              aria-current={!store.creating && page.id === store.form.id ? "page" : undefined}
              className={cn(
                "mb-0.5 h-auto min-h-9 w-full justify-start gap-2 p-2 text-left font-normal",
                !store.creating && page.id === store.form.id && "bg-accent text-accent-foreground",
              )}
              disabled={store.isLoading}
              variant="ghost"
              onClick={() => selectPage(page.id)}
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" />

              <span className="truncate">{page.title}</span>
            </Button>
          ))
        )}

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

  return (
    <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col border-r border-border md:flex">{pageList}</aside>

      <div className="flex min-w-0 items-center border-b border-border px-4 py-2 md:hidden">
        <Button
          className="min-w-0 max-w-full justify-between gap-3 font-normal"
          variant="ghost"
          onClick={() => setMobileOpen(true)}
        >
          <BookOpen className="shrink-0" />

          <span className="truncate">{store.form.title || t("Wiki.pagesLabel")}</span>

          <ChevronDown className="shrink-0" />
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent aria-describedby={undefined} className="gap-0" side="left">
          <SheetHeader>
            <SheetTitle>{t("Wiki.pagesLabel")}</SheetTitle>
          </SheetHeader>

          <SheetBody className="flex min-h-0 flex-1 flex-col p-0">{pageList}</SheetBody>
        </SheetContent>
      </Sheet>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        {missing ? (
          <PageState description={t("Wiki.unavailableBody")} state="error" title={t("Wiki.unavailableTitle")} />
        ) : !hasDocument ? (
          <PageState
            action={
              store.canManage ? (
                <div className="w-72 max-w-full space-y-4">
                  {canSetupWithMate && (
                    <WikiHomepageSetup
                      onAccepted={async (conversationId) => {
                        rootStore.agentChatStore.open();
                        await rootStore.agentChatStore.loadConfig();
                        await rootStore.agentChatStore.selectConversation(conversationId);
                      }}
                    />
                  )}

                  <Button disabled={store.isLoading} size="sm" variant="secondary" onClick={create}>
                    <Plus />

                    {t("Wiki.newPage")}
                  </Button>
                </div>
              ) : undefined
            }
            background={<WikiPageSkeleton documentOnly animated={false} />}
            description={
              !store.canManage
                ? t("Wiki.emptyBodyReadOnly")
                : canSetupWithMate
                  ? t("Wiki.emptyBody")
                  : t("Wiki.emptyBodyManual")
            }
            icon={BookOpen}
            state="empty"
            title={t("Wiki.emptyTitle")}
          />
        ) : (
          <AppForm
            className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8 md:px-10 md:py-10"
            id={formId}
            store={store}
          >
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
              {store.canManage ? (
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
                readOnly={!store.canManage || store.isLoading}
                onChange={store.onEditorChange}
              />
            </EditorLinkPickerContext.Provider>
          </AppForm>
        )}
      </main>
    </div>
  );
});
