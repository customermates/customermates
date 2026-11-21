"use client";

import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { PublicFormDto } from "@/features/public-form/public-form.schema";

import { ClipboardList, Link2, Share2, Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PublicFormDialog } from "@/components/public-form/public-form-dialog";
import { publicFormTabActions } from "@/components/public-form/public-form-actions-adapter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { copyToClipboard } from "@/core/utils/clipboard";

import { ShareViewDialog } from "./share-view-dialog";
import { surfaceKeyOf, viewLink } from "./view-actions";

export function shareableView(views: readonly DataViewChipDto[], activeViewKey: string): DataViewChipDto | null {
  const view = views.find((candidate) => candidate.id === activeViewKey);
  return view && !view.sharedBy ? view : null;
}

export type PublicFormSummary = { status: "loading" } | { status: "none" } | { status: "ready"; form: PublicFormDto };

function MenuRow({ title, description }: { title: string; description: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span>{title}</span>

      <span className="text-xs text-muted-foreground">{description}</span>
    </span>
  );
}

const PublicFormItems = observer(function PublicFormItems({ typeId, onOpen }: { typeId: string; onOpen: () => void }) {
  const t = useTranslations();
  const [summary, setSummary] = useState<PublicFormSummary>({ status: "loading" });

  useEffect(() => {
    let active = true;
    publicFormTabActions
      .loadEditor(typeId)
      .then((result) => {
        if (!active) return;
        setSummary(result.ok && result.data.form ? { status: "ready", form: result.data.form } : { status: "none" });
      })
      .catch((error: unknown) => {
        if (active) setSummary({ status: "none" });
        reportApplicationError(error);
      });
    return () => {
      active = false;
    };
  }, [typeId]);

  const form = summary.status === "ready" ? summary.form : null;
  const description =
    summary.status === "loading"
      ? t("PublicForm.dialog.loading")
      : form
        ? t("PublicForm.dialog.status", {
            state: form.enabled ? "on" : "off",
            count: form.submissionCount,
          })
        : t("PublicForm.dialog.none");

  return (
    <>
      <DropdownMenuItem data-share-public-form="" onSelect={onOpen}>
        <ClipboardList className="size-4" />

        <MenuRow description={description} title={t("PublicForm.dialog.menu")} />
      </DropdownMenuItem>

      {form ? (
        <DropdownMenuItem
          data-share-public-form-link=""
          onSelect={() => {
            copyToClipboard(form.url)
              .then((copied) => {
                if (copied) toast.success(t("PublicForm.dialog.linkCopied"));
              })
              .catch(reportApplicationError);
          }}
        >
          <Link2 className="size-4" />

          <MenuRow description={form.url} title={t("PublicForm.dialog.copyLink")} />
        </DropdownMenuItem>
      ) : null}
    </>
  );
});

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  typeId: string;
  listLabel: string;
};

export const ListShareMenu = observer(function ListShareMenu<E extends HasId>({ store, typeId, listLabel }: Props<E>) {
  const t = useTranslations();
  const pathname = usePathname();
  const { appMode } = useRootStore();
  const [formOpen, setFormOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ viewId: string; link: string } | null>(null);
  const pendingOverlay = useRef<(() => void) | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const publishable = appMode !== "demo";
  const view = shareableView(store.views, store.activeViewKey);
  if (!store.isReady || (!publishable && !view)) return null;

  const openPendingOverlay = (event: Event) => {
    const open = pendingOverlay.current;
    if (!open) return;
    event.preventDefault();
    pendingOverlay.current = null;
    open();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            aria-label={t("DataView.share.menu")}
            className="h-8"
            data-slot="top-bar-action"
            id="records-share"
            size="sm"
            type="button"
            variant="secondary"
          >
            <Share2 aria-hidden className="size-3.5" />

            <span className="hidden sm:inline">{t("DataView.share.menu")}</span>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" aria-labelledby="records-share" onCloseAutoFocus={openPendingOverlay}>
          {publishable ? (
            <PublicFormItems
              typeId={typeId}
              onOpen={() => {
                pendingOverlay.current = () => setFormOpen(true);
              }}
            />
          ) : null}

          <DropdownMenuItem
            data-share-view=""
            disabled={!view}
            onSelect={() => {
              if (!view) return;
              const link = viewLink(
                store.viewPathname ?? pathname,
                view.id,
                store.viewPathname ? surfaceKeyOf(store) : undefined,
              );
              pendingOverlay.current = () => setShareTarget({ viewId: view.id, link });
            }}
          >
            <Users className="size-4" />

            <MenuRow
              description={view ? view.name : t("DataView.share.saveViewFirst")}
              title={t("DataView.share.thisView")}
            />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {formOpen ? (
        <PublicFormDialog
          focusReturnTarget={triggerRef.current}
          listLabel={listLabel}
          typeId={typeId}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      {shareTarget ? (
        <ShareViewDialog
          kind="list"
          link={shareTarget.link}
          view={store.views.find((candidate) => candidate.id === shareTarget.viewId) ?? null}
          onOpenChange={(next) => {
            if (!next) setShareTarget(null);
          }}
          onShared={() => store.refresh()}
        />
      ) : null}
    </>
  );
});
