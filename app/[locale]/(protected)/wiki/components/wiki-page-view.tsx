"use client";

import type { WikiPageListResult, WikiPageDto } from "@/features/wiki/wiki.schema";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { Editor } from "@/components/editor/editor";
import { parseMarkdownToJSON, serializeJSONToMarkdown } from "@/components/editor/editor.utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { WikiHomepageSetup } from "@/components/wiki/wiki-homepage-setup";

import { WikiPageStore } from "./wiki-page.store";

type Props = {
  initialPage: WikiPageDto | null;
  listPage: WikiPageListResult;
};

function editorDocument(markdown: string): object {
  try {
    return parseMarkdownToJSON(markdown);
  } catch {
    return parseMarkdownToJSON("");
  }
}

export const WikiPageView = observer(({ initialPage, listPage }: Props) => {
  const t = useTranslations();
  const rootStore = useRootStore();
  const router = useRouter();
  const { showDeleteConfirmation } = useDeleteConfirmation();
  const [hasMounted, setHasMounted] = useState(false);
  const listPageQuery = listPage.page > 1 ? `&listPage=${listPage.page}` : "";
  const store = useMemo(
    () =>
      new WikiPageStore(rootStore, initialPage, (pageId) => {
        router.replace(pageId ? `/wiki?page=${pageId}${listPageQuery}` : "/wiki");
        router.refresh();
      }),
    [listPageQuery, rootStore, router],
  );

  useEffect(() => store.load(initialPage), [initialPage, store]);
  useEffect(() => setHasMounted(true), []);

  const document = useMemo(() => editorDocument(store.form.markdown), [store.form.markdown]);
  const pageCount = Math.max(1, Math.ceil(listPage.total / listPage.pageSize));
  const selectedId = store.editing && store.form.id === null ? null : initialPage?.id;
  const canSetupWithMate =
    hasMounted && store.canManage && rootStore.agentChatEnabled && rootStore.agentChatStore.enabled === true;
  const emptyBody = !store.canManage
    ? t("Wiki.emptyBodyReadOnly")
    : canSetupWithMate
      ? t("Wiki.emptyBody")
      : t("Wiki.emptyBodyManual");
  const tryNavigate = (navigate: () => void) => rootStore.navigationGuard.tryNavigate(navigate);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-border bg-muted/20 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <h1 className="font-semibold">{t("Wiki.title")}</h1>

          {store.canManage && (
            <Button
              aria-label={t("Wiki.newPage")}
              disabled={store.isLoading}
              size="icon-sm"
              variant="secondary"
              onClick={() => tryNavigate(store.startCreate)}
            >
              <Plus />
            </Button>
          )}
        </div>

        <nav aria-label={t("Wiki.pagesLabel")} className="min-h-0 flex-1 overflow-y-auto p-2">
          {listPage.items.map((page) => (
            <Button
              key={page.id}
              className={cn("mb-1 w-full justify-start overflow-hidden", selectedId === page.id && "bg-accent")}
              disabled={store.isLoading}
              variant="ghost"
              onClick={() => tryNavigate(() => router.replace(`/wiki?page=${page.id}${listPageQuery}`))}
            >
              <FileText className="shrink-0" />

              <span className="truncate">{page.title}</span>
            </Button>
          ))}
        </nav>

        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-border p-2 text-xs text-muted-foreground">
            <Button
              disabled={store.isLoading || listPage.page <= 1}
              size="xs"
              variant="ghost"
              onClick={() => tryNavigate(() => router.replace(`/wiki?listPage=${listPage.page - 1}`))}
            >
              {t("Wiki.previous")}
            </Button>

            <span>{t("Wiki.page", { current: listPage.page, total: pageCount })}</span>

            <Button
              disabled={store.isLoading || listPage.page >= pageCount}
              size="xs"
              variant="ghost"
              onClick={() => tryNavigate(() => router.replace(`/wiki?listPage=${listPage.page + 1}`))}
            >
              {t("Wiki.next")}
            </Button>
          </div>
        )}
      </aside>

      <main className="min-h-0 overflow-y-auto p-4 md:p-6">
        {!initialPage && !store.editing ? (
          <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center text-center">
            <Icon className="mb-4 size-10 text-muted-foreground" icon={FileText} />

            <h2 className="text-xl font-semibold">{t("Wiki.emptyTitle")}</h2>

            <p className="mt-2 text-sm text-muted-foreground">{emptyBody}</p>

            {store.canManage && (
              <div className="mt-5 w-full max-w-md rounded-lg border border-border bg-background p-4">
                {canSetupWithMate ? (
                  <>
                    <WikiHomepageSetup
                      onAccepted={async (conversationId) => {
                        rootStore.agentChatStore.open();
                        await rootStore.agentChatStore.loadConfig();
                        await rootStore.agentChatStore.selectConversation(conversationId);
                      }}
                    />

                    <div className="my-4 border-t border-border" />
                  </>
                ) : null}

                <Button
                  className="w-full"
                  disabled={store.isLoading}
                  variant="secondary"
                  onClick={() => tryNavigate(store.startCreate)}
                >
                  <Plus />

                  {t("Wiki.newPage")}
                </Button>
              </div>
            )}
          </div>
        ) : store.editing ? (
          <AppForm className="mx-auto block max-w-4xl" store={store}>
            <div className="mb-5 flex items-end gap-2">
              <FormInput required containerClassName="min-w-0 flex-1" id="title" label={t("Wiki.pageTitle")} />

              <Button
                disabled={store.isLoading}
                type="button"
                variant="secondary"
                onClick={() => (store.form.id ? store.stopEdit() : store.load(initialPage))}
              >
                {t("Wiki.cancel")}
              </Button>

              <Button disabled={store.isLoading || !store.hasUnsavedChanges} type="submit">
                {t("Wiki.save")}
              </Button>
            </div>

            <div className="min-h-80 rounded-lg border border-border bg-background p-4">
              <Editor
                data={document}
                readOnly={!store.canManage}
                onChange={(value) => store.onChange("markdown", serializeJSONToMarkdown(value))}
              />
            </div>
          </AppForm>
        ) : (
          <article className="mx-auto max-w-4xl">
            <div className="mb-5 flex items-start justify-between gap-3 border-b border-border pb-4">
              <h2 className="min-w-0 text-2xl font-semibold">{store.form.title}</h2>

              {store.canManage && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="secondary" onClick={store.startEdit}>
                    <Pencil />

                    {t("Wiki.edit")}
                  </Button>

                  <Button
                    aria-label={t("Wiki.delete")}
                    disabled={store.isLoading}
                    size="icon-sm"
                    variant="destructiveOutline"
                    onClick={() => showDeleteConfirmation(() => store.delete(), store.form.title)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </div>

            <Editor readOnly data={document} />
          </article>
        )}
      </main>
    </div>
  );
});
