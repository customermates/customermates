"use client";

import type { MouseEvent, ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { ViewMetaDraft } from "./use-view-commands";

import { ChevronDownIcon, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter, usePathname as useLocalePathname } from "@/i18n/navigation";

import { hideSharedDataViewAction } from "@/app/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormSaveMenuItem } from "@/components/forms/form-footer-actions";
import { OverflowRail } from "@/components/shared/overflow-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import type { FocusKind } from "@/components/focus/focus-href";
import { useFocusTarget } from "@/components/focus/focus-target";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useRootStore } from "@/core/stores/root-store.provider";

import { VIEW_TAB_CLASS, ViewChip } from "./view-chip";
import { allViewLabel } from "./all-view-label";
import { FilterSummary } from "./filter-summary";
import { ViewMenuItems } from "./view-menu-items";
import { ViewMetaOverlay } from "./view-meta-overlay";
import { allViewMenuItems, orderChips, sortViewsByPosition, suggestedViewName, viewMenuItems } from "./view-rail-model";
import { surfaceKeyOf, viewHref, viewLink } from "./view-actions";
import { ShareViewDialog } from "./share-view-dialog";
import { useRovingFocus } from "./use-roving-focus";
import { type ViewCommands, type ViewDeleteNotice, useViewCommands } from "./use-view-commands";
import { useViewAi } from "./use-view-ai";

type Props<E extends HasId> = {
  actions?: ReactNode;
  allLabel?: string;
  countLabel?: (count: number) => string;
  allowDuplicate?: boolean;
  deleteNotice?: (view: DataViewChipDto) => Promise<ViewDeleteNotice>;
  joinsTopBar?: boolean;
  detailParam?: string;
  store: BaseDataViewStore<E>;
};

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

const VIEW_FOCUS_KINDS: FocusKind[] = ["view"];

export const DataViewViewsRail = observer(function DataViewViewsRail<E extends HasId>({
  actions,
  allLabel,
  allowDuplicate = true,
  countLabel,
  deleteNotice,
  joinsTopBar = false,
  detailParam,
  store,
}: Props<E>) {
  const t = useTranslations();
  const pathname = usePathname();
  const localePathname = useLocalePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [meta, setMeta] = useState<ViewMetaDraft | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<{ view: DataViewChipDto; link: string } | null>(null);
  const pendingOverlay = useRef<(() => void) | null>(null);
  const owningRail = useRef<{ element: HTMLElement; store: BaseDataViewStore<E> } | null>(null);
  const summaryParts = useRef(new Map<number, string>());
  const ai = useViewAi(store);
  const offersViews = Boolean(store.p13nId);
  useFocusTarget(VIEW_FOCUS_KINDS, () => true, store.isReady);

  const commands = useViewCommands({
    closeMeta: () => setMeta(null),
    deleteNotice,
    openMeta: setMeta,
    pathname,
    store,
    owningRail: () => (owningRail.current?.store === store ? owningRail.current.element : null),
  });

  const { viewPickerStore } = useRootStore();
  const proposedName = store.proposal?.isNew ? (store.proposal.name ?? null) : null;
  const allName = allLabel ?? allViewLabel(t, { p13nId: store.p13nId, recordPlural: store.recordLabels?.plural });
  const selectView = (viewKey: string) => {
    if (detailParam && searchParams.get(detailParam)) {
      router.push(viewHref(localePathname, viewKey));
      return;
    }
    if (viewKey === store.activeViewKey && !proposedName) return;

    commands.select(viewKey);
  };
  const latestSelect = useRef(selectView);
  latestSelect.current = selectView;
  const latestAllName = useRef(allName);
  latestAllName.current = allName;
  const hasViews = store.views.length > 0;

  useEffect(() => {
    if (!joinsTopBar || !offersViews || !hasViews) return;
    const surface = {
      options: () => [{ id: ALL_VIEW_KEY, name: latestAllName.current }, ...sortViewsByPosition(store.views)],
      activeViewKey: () => store.activeViewKey,
      select: (viewKey: string) => latestSelect.current(viewKey),
    };
    viewPickerStore.register(surface);
    return () => viewPickerStore.unregister(surface);
  }, [hasViews, joinsTopBar, offersViews, store, viewPickerStore]);

  const openSaveAsView = useCallback(() => {
    const parts = (store.filters ?? []).flatMap((_, index) => summaryParts.current.get(index) ?? []);
    const search = store.searchTerm?.trim();
    setMeta({
      mode: "create",
      name: suggestedViewName(search ? [...parts, `"${search}"`] : parts, t("DataView.views.myFilters")),
    });
  }, [store, t]);

  useEffect(() => store.registerSaveAsView(openSaveAsView), [openSaveAsView, store]);

  const onSummaryText = useCallback((index: number, text: string | null) => {
    if (text) summaryParts.current.set(index, text);
    else summaryParts.current.delete(index);
  }, []);

  const chips = orderChips(store.views, store.activeViewKey);
  const ownChips = chips.filter((chip) => !chip.view.sharedBy);
  const surfaceKind = store.p13nId === SURFACE.dashboard ? "dashboard" : "list";
  const activeView = store.views.find((view) => view.id === store.activeViewKey);
  const isAllActive = store.activeViewKey === ALL_VIEW_KEY && !proposedName;
  const tabbableIndex = isAllActive ? 0 : chips.findIndex((chip) => chip.isActive) + 1;
  const { onKeyDownAt, tabIndexAt } = useRovingFocus(chips.length + 1, tabbableIndex);

  if (!offersViews) return null;

  const activeName = activeView?.name ?? allName;
  const allView: DataViewChipDto = { id: ALL_VIEW_KEY, name: allName, position: -1, state: store.allViewState };
  const isDrafting = meta !== null && meta.mode !== "edit";
  const previewFor = (name: string, isActive: boolean): ReactNode => (
    <>
      <span className="block font-medium">{name}</span>

      {isActive && store.pagination && (
        <span className="block text-[11px] text-muted-foreground">
          {(countLabel ?? ((count: number) => t("DataView.views.recordCount", { count })))(store.pagination.total ?? 0)}
        </span>
      )}
    </>
  );

  const openPendingOverlay = (event: Event) => {
    const open = pendingOverlay.current;
    if (!open) return;
    event.preventDefault();
    pendingOverlay.current = null;
    open();
  };
  const linkFor = (view: DataViewChipDto) =>
    viewLink(store.viewPathname ?? pathname, view.id, store.viewPathname ? surfaceKeyOf(store) : undefined);
  const menuCommands: ViewCommands = {
    ...commands,
    share: (view) => {
      pendingOverlay.current = () => setShareTarget({ view, link: linkFor(view) });
    },
    duplicate: (view) => {
      pendingOverlay.current = () => commands.duplicate(view);
    },
    edit: (view) => {
      pendingOverlay.current = () => commands.edit(view);
    },
  };
  const ownerAvatar = (view: DataViewChipDto, className: string) => (
    <Avatar aria-hidden className={className}>
      {view.sharedBy?.avatarUrl && <AvatarImage alt="" src={view.sharedBy.avatarUrl} />}

      <AvatarFallback className="text-[8px]">{view.sharedBy?.name.slice(0, 1)}</AvatarFallback>
    </Avatar>
  );
  const sharedScope = (view: DataViewChipDto) => {
    const name = view.sharedBy?.name.split(" ")[0] ?? "";
    return view.visibility === "roles"
      ? t("DataView.share.withRoles", { name })
      : t("DataView.share.withEveryone", { name });
  };
  const sharedMenu = (view: DataViewChipDto) => (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 font-normal" data-shared-owner="">
        {ownerAvatar(view, "size-5 shrink-0")}

        <span className="flex min-w-0 flex-col">
          <span className="text-xs">{t("DataView.share.sharedBy", { name: view.sharedBy?.name ?? "" })}</span>

          <span className="text-[11px] text-muted-foreground">{sharedScope(view)}</span>
        </span>
      </DropdownMenuLabel>

      <DropdownMenuSeparator />

      {allowDuplicate && (
        <DropdownMenuItem
          onSelect={() => {
            pendingOverlay.current = () => commands.duplicate(view);
          }}
        >
          {t("DataView.views.duplicate")}
        </DropdownMenuItem>
      )}

      <DropdownMenuItem onSelect={() => commands.copyLink(view)}>{t("DataView.views.copyLink")}</DropdownMenuItem>

      <DropdownMenuItem
        id="global-data-views-hide-shared"
        onSelect={() =>
          runUserAction(async () => {
            const result = await hideSharedDataViewAction({ id: view.id, hidden: true });
            if (!result.ok) {
              toastZodErrorTree(result.error);
              return;
            }
            if (store.activeViewKey === view.id) store.applyView(ALL_VIEW_KEY);
            await store.refresh();
            toast.success(t("DataView.share.hidden"));
          })
        }
      >
        {t("DataView.share.hide")}
      </DropdownMenuItem>
    </>
  );
  const chipMenu = (view: DataViewChipDto) => {
    if (view.id === ALL_VIEW_KEY)
      return <ViewMenuItems commands={menuCommands} items={allViewMenuItems()} view={view} />;
    if (view.sharedBy) return sharedMenu(view);
    const items = viewMenuItems({
      index: ownChips.findIndex((chip) => chip.view.id === view.id),
      total: ownChips.length,
    }).filter((item) => allowDuplicate || item.id !== "duplicate");
    return <ViewMenuItems commands={menuCommands} items={items} view={view} />;
  };

  const onChipClick = (viewKey: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;

    event.preventDefault();
    selectView(viewKey);
  };
  const keepProposal = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isPlainClick(event)) event.preventDefault();
  };

  return (
    <nav
      ref={(element) => {
        owningRail.current = element ? { element, store } : null;
      }}
      aria-label={t("DataView.views.railLabel")}
      className={cn(
        "flex shrink-0 gap-1.5 pt-1",
        joinsTopBar
          ? "items-start border-b border-border bg-background px-4 ps-[calc(1rem+var(--safe-left,0px))] pe-[calc(1rem+var(--safe-right,0px))]"
          : "items-center",
        store.hasSelection && store.supportsSelection && "hidden md:flex",
      )}
      data-data-view-rail=""
      data-joins-top-bar={joinsTopBar ? "" : undefined}
      id="global-data-views"
    >
      <OverflowRail
        ariaLabel={t("DataView.views.railLabel")}
        bleed={false}
        className="-mt-1 min-w-0 flex-1"
        focusable={false}
        observedKey={chips.length}
        railClassName={cn("items-center gap-1 pe-1 pt-1", joinsTopBar && "pb-4")}
        railProps={{
          "aria-label": t("DataView.views.railLabel"),
          "aria-orientation": "horizontal",
          "data-data-view-rail-items": "",
          role: "toolbar",
        }}
      >
        {!store.isReady &&
          [0, 1, 2].map((index) => <Skeleton key={index} className="h-7 w-20 shrink-0 rounded-full" />)}

        {store.isReady && (
          <ViewChip
            focusKey={`view:${ALL_VIEW_KEY}`}
            href={viewHref(
              store.viewPathname ?? pathname,
              ALL_VIEW_KEY,
              store.viewPathname ? surfaceKeyOf(store) : undefined,
            )}
            id="global-data-views-all"
            isActive={isAllActive}
            isModified={isAllActive && store.isViewModified}
            label={allName}
            menu={chipMenu(allView)}
            modifiedLabel={t("DataView.views.modified")}
            preview={previewFor(allName, isAllActive)}
            tabIndex={tabIndexAt(0)}
            onKeyDown={onKeyDownAt(0)}
            onMenuCloseAutoFocus={openPendingOverlay}
            onSelect={onChipClick(ALL_VIEW_KEY)}
          />
        )}

        {store.isReady &&
          chips.map((chip, index) => (
            <ViewChip
              key={chip.view.id}
              focusKey={`view:${chip.view.id}`}
              href={viewHref(
                store.viewPathname ?? pathname,
                chip.view.id,
                store.viewPathname ? surfaceKeyOf(store) : undefined,
              )}
              icon={
                chip.view.sharedBy ? (
                  ownerAvatar(chip.view, "-ms-1 size-4 shrink-0")
                ) : chip.view.visibility && chip.view.visibility !== "private" ? (
                  <Users aria-hidden className="size-3 shrink-0" />
                ) : undefined
              }
              isActive={chip.isActive && !proposedName}
              isModified={chip.isActive && !proposedName && store.isViewModified}
              label={chip.view.name}
              menu={chipMenu(chip.view)}
              modifiedLabel={t("DataView.views.modified")}
              preview={
                chip.view.sharedBy ? (
                  <>
                    {previewFor(chip.view.name, chip.isActive)}

                    <span className="block text-[11px] text-muted-foreground">
                      {t("DataView.share.sharedBy", { name: chip.view.sharedBy.name })}
                    </span>

                    <span className="block text-[11px] text-muted-foreground">{sharedScope(chip.view)}</span>
                  </>
                ) : chip.view.visibility && chip.view.visibility !== "private" ? (
                  <>
                    {previewFor(chip.view.name, chip.isActive)}

                    <span className="block text-[11px] text-muted-foreground">{t("DataView.share.ownShared")}</span>
                  </>
                ) : (
                  previewFor(chip.view.name, chip.isActive)
                )
              }
              shared={
                chip.view.sharedBy
                  ? "others"
                  : chip.view.visibility && chip.view.visibility !== "private"
                    ? "mine"
                    : undefined
              }
              tabIndex={tabIndexAt(index + 1)}
              onKeyDown={onKeyDownAt(index + 1)}
              onMenuCloseAutoFocus={openPendingOverlay}
              onSelect={onChipClick(chip.view.id)}
            />
          ))}

        {store.isReady && proposedName && (
          <ViewChip
            isActive
            isModified
            href={store.viewPathname ?? pathname}
            id="global-data-views-proposed"
            label={proposedName}
            modifiedLabel={t("DataView.views.modified")}
            preview={previewFor(proposedName, true)}
            tabIndex={-1}
            onSelect={keepProposal}
          />
        )}

        {store.isReady && (
          <ViewMetaOverlay
            mode={meta?.mode ?? "create"}
            name={meta?.name ?? ""}
            open={meta !== null}
            trigger={
              <Button
                className={cn(
                  VIEW_TAB_CLASS,
                  "border-dashed border-input bg-transparent text-muted-foreground shadow-none hover:bg-transparent",
                )}
                data-view-draft={isDrafting ? "" : undefined}
                id="global-data-views-new"
                size="sm"
                variant="ghost"
              >
                <span className="truncate">{t("DataView.views.createTitle")}</span>
              </Button>
            }
            onAskAi={ai.available ? ai.openCurrent : undefined}
            onChange={(draft) => setMeta((current) => (current ? { ...current, ...draft } : current))}
            onCreateWithAi={ai.available ? ai.openCreate : undefined}
            onOpenChange={(next) => setMeta(next ? { mode: "create", name: "" } : null)}
            onSubmit={(values) => (meta ? commands.submitMeta(meta, values) : Promise.resolve())}
          />
        )}
      </OverflowRail>

      {actions}

      {store.isReady && store.canSaveAsView && (
        <FilterSummary customColumns={store.filterColumns} filters={store.filters ?? []} onText={onSummaryText} />
      )}

      {store.isReady && (
        <DropdownMenu modal={false} open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("DataView.views.menu")}
              className={cn("relative", joinsTopBar && "size-7")}
              id="global-data-views-menu"
              size="icon-sm"
              variant="ghost"
            >
              <ChevronDownIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            aria-labelledby="global-data-views-menu"
            onCloseAutoFocus={openPendingOverlay}
          >
            {ai.available && (
              <DropdownMenuItem
                aria-label={t("DataView.views.aiLabel", { name: activeName })}
                id="global-data-views-ai"
                onSelect={() => {
                  pendingOverlay.current = ai.openCurrent;
                }}
              >
                <Sparkles aria-hidden />

                {t("DataView.views.askAi")}
              </DropdownMenuItem>
            )}

            {store.canSaveAsView && (
              <DropdownMenuItem
                id="global-data-views-save-as"
                onSelect={() => {
                  pendingOverlay.current = openSaveAsView;
                }}
              >
                {t("DataView.views.saveAsView")}
              </DropdownMenuItem>
            )}

            {store.canSaveViewChanges && (
              <FormSaveMenuItem id="global-data-views-save" onSave={store.saveViewChanges} />
            )}

            {store.isViewModified && (
              <DropdownMenuItem id="global-data-views-reset" onSelect={() => runUserAction(store.resetViewChanges)}>
                {t("DataView.views.resetChanges")}
              </DropdownMenuItem>
            )}

            {(store.canSaveAsView || store.isViewModified) && !proposedName && <DropdownMenuSeparator />}

            {!proposedName && chipMenu(activeView ?? allView)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <span aria-live="polite" className="sr-only">
        {t("DataView.views.applied", { name: activeName })}
      </span>

      {shareTarget && (
        <ShareViewDialog
          kind={surfaceKind}
          link={shareTarget.link}
          view={shareTarget.view}
          onOpenChange={(next) => {
            if (!next) setShareTarget(null);
          }}
          onShared={() => store.refresh()}
        />
      )}
    </nav>
  );
});
