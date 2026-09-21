"use client";

import type { WikiPageStore } from "./wiki-page.store";

import { observer } from "mobx-react-lite";
import { Link, MoreHorizontal, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { runUserAction } from "@/core/errors/report-application-error";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";

type Props = {
  canManage: boolean;
  store: WikiPageStore;
  formId: string;
  hasDocument: boolean;
  onCreate: () => void;
  onReload: () => void;
};

export const WikiPageActions = observer(({ canManage, store, formId, hasDocument, onCreate, onReload }: Props) => {
  const t = useTranslations();
  const copyToClipboard = useCopyToClipboard();
  const { showDeleteConfirmation } = useDeleteConfirmation();

  return (
    <div className="flex items-center gap-1">
      {canManage && (
        <Button
          aria-label={t("Wiki.newPage")}
          disabled={store.isLoading}
          size="sm"
          variant="secondary"
          onClick={onCreate}
        >
          <Plus className="size-4" />

          <span className="hidden sm:inline">{t("Wiki.newPage")}</span>
        </Button>
      )}

      {hasDocument && store.hasUnsavedChanges && (
        <Button
          aria-label={t("Common.actions.reset")}
          disabled={store.isLoading}
          size="sm"
          variant="secondary"
          onClick={store.resetDocument}
        >
          <RotateCcw className="size-4 sm:hidden" />

          <span className="hidden sm:inline">{t("Common.actions.reset")}</span>
        </Button>
      )}

      {hasDocument && canManage && (
        <Button
          aria-label={t("Wiki.save")}
          disabled={store.isLoading || !store.hasUnsavedChanges}
          form={formId}
          size="sm"
          type="submit"
        >
          <Save className="size-4 sm:hidden" />

          <span className="hidden sm:inline">{t("Wiki.save")}</span>
        </Button>
      )}

      {hasDocument && store.form.id && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={t("Wiki.pageActions")} disabled={store.isLoading} size="icon-sm" variant="ghost">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                runUserAction(() => copyToClipboard(wikiPageUrl(window.location.origin, store.form.id as string)))
              }
            >
              <Link />

              {t("Wiki.copyLink")}
            </DropdownMenuItem>

            <DropdownMenuItem onSelect={onReload}>
              <RotateCcw />

              {t("Wiki.reload")}
            </DropdownMenuItem>

            {canManage && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => showDeleteConfirmation(() => store.delete(), store.form.title)}
              >
                <Trash2 />

                {t("Wiki.delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
});
