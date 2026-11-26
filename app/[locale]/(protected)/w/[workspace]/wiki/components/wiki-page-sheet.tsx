"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { WikiGraphRecordType, WikiPageLinks } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";
import type { WikiPageStore } from "./wiki-page.store";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { BadgeCheck, Link, Maximize2, Pin, PinOff, Settings2, Trash2, Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { Editor } from "@/components/editor/editor";
import { EditorLinkPickerContext } from "@/components/editor/editor-link-picker";
import { headingAnchorId } from "@/components/editor/heading-anchor-extension";
import { AppForm } from "@/components/forms/form-context";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { SkeletonShape } from "@/components/page-state/skeleton-shape";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ItemActionsTrigger } from "@/components/ui/item-actions";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { actionData } from "@/core/utils/action-data";
import { cn } from "@/core/utils/cn";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import { Action } from "@/generated/prisma";
import { IntlLink, useWorkspaceSlug } from "@/i18n/navigation";

import { getWikiPageLinksAction } from "../actions";
import { WIKI_GRAPH_KIND_DOT } from "./wiki-graph-model";
import { WikiLinkPicker } from "./wiki-link-picker";
import { WIKI_HEADING_ID_PREFIX, wikiDocumentHeadings } from "./wiki-page-outline";
import { WikiPageSettings } from "./wiki-page-settings";
import { WikiPageTitle } from "./wiki-page-title";

export type WikiPageSheetState = "loading" | "error" | "page";

type Props = {
  open: boolean;
  state: WikiPageSheetState;
  store: WikiPageStore;
  pinned: boolean | null;
  canPin: boolean;
  otherGuide: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onTogglePin: () => void;
  onReload: () => void;
  onSwitchView?: () => void;
};

type Surface = "sheet" | "page";

type LinkedPage = WikiPageLinks["linkedFrom"][number];

const OUTLINE_MINIMUM = 3;
const PAGE_COLUMN_CLASS = "mx-auto w-full max-w-5xl";
const PAGE_BODY_COLUMN_CLASS = "*:mx-auto *:w-full *:max-w-[61rem]";
const VISIBLE_MENU_TRIGGER_CLASS = "opacity-100 touch-input:not-focus-visible:not-data-[state=open]:not-sr-only";

function SheetSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div
      aria-label={label}
      className={cn("flex flex-col gap-5 p-6", className)}
      data-wiki-page-sheet-skeleton=""
      role="status"
    >
      <SkeletonShape animated className="h-7 w-2/3" />

      <SkeletonShape animated className="h-4 w-1/2" motionPhase={1} />

      <div className="space-y-3">
        <SkeletonShape animated className="h-4 w-full" motionPhase={2} />

        <SkeletonShape animated className="h-4 w-11/12" motionPhase={2} />

        <SkeletonShape animated className="h-4 w-4/5" motionPhase={3} />
      </div>
    </div>
  );
}

export function linkedPagesOf(links: Pick<WikiPageLinks, "linkedFrom" | "linksTo">): LinkedPage[] {
  const seen = new Set<string>();
  return [...links.linkedFrom, ...links.linksTo].filter((page) => {
    if (seen.has(page.id)) return false;
    seen.add(page.id);
    return true;
  });
}

function LinkedPages({ items, onSelect }: { items: LinkedPage[]; onSelect: (id: string) => void }) {
  const t = useTranslations();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2" data-wiki-linked-pages="">
      <h3 className="text-xs font-medium text-muted-foreground">{t("Wiki.graph.linkedPages")}</h3>

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Button
            key={item.id}
            className="h-7 max-w-full gap-1.5 rounded-full px-2.5 font-normal"
            size="sm"
            type="button"
            variant="secondary"
            onClick={() => onSelect(item.id)}
          >
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", WIKI_GRAPH_KIND_DOT[item.kind])} />

            <span className="truncate">{item.title}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}

function RecordLinks({ items }: { items: Array<WikiGraphRecordType & { count: number; list: boolean }> }) {
  const t = useTranslations();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2" data-wiki-linked-lists="">
      <h3 className="text-xs font-medium text-muted-foreground">{t("Wiki.graph.listsUsed")}</h3>

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const Icon = recordTypeIcon(item.icon);
          return (
            <IntlLink
              key={item.id}
              className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={`/records/${item.id}`}
            >
              <AppChip interactive startContent={<Icon aria-hidden="true" />} variant={item.color ?? "secondary"}>
                {item.count > 0 ? `${item.pluralLabel} · ${item.count}` : item.pluralLabel}
              </AppChip>
            </IntlLink>
          );
        })}
      </div>
    </section>
  );
}

function OutlineLinks({
  headings,
  onSelect,
}: {
  headings: ReturnType<typeof wikiDocumentHeadings>;
  onSelect: (index: number) => void;
}) {
  return (
    <ul className="-mx-1">
      {headings.map((heading) => (
        <li key={heading.index}>
          <Button
            className={cn(
              "h-auto min-h-7 w-full justify-start px-2 py-1 text-left font-normal",
              heading.level === 2 && "pl-5",
              heading.level === 3 && "pl-8 text-muted-foreground",
            )}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => onSelect(heading.index)}
          >
            <span className="truncate">{heading.text}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function WikiPageControls({
  switchView,
  menu,
  onMenuCloseAutoFocus,
}: {
  switchView: { label: string; icon: LucideIcon; onClick: () => void } | null;
  menu: ReactNode;
  onMenuCloseAutoFocus: (event: Event) => void;
}) {
  const t = useTranslations();
  const SwitchIcon = switchView?.icon;
  return (
    <div className="flex shrink-0 items-center gap-2" data-wiki-page-controls="">
      {switchView && SwitchIcon && (
        <Button size="sm" type="button" variant="secondary" onClick={switchView.onClick}>
          <SwitchIcon aria-hidden />

          {switchView.label}
        </Button>
      )}

      {menu && (
        <ItemActionsTrigger
          className={VISIBLE_MENU_TRIGGER_CLASS}
          label={t("DataView.moreActions")}
          menu={menu}
          trigger={<Button className="text-muted-foreground" size="icon-sm" type="button" variant="ghost" />}
          onCloseAutoFocus={onMenuCloseAutoFocus}
        />
      )}
    </div>
  );
}

const WikiPageSurface = observer(function WikiPageSurface({
  surface,
  open,
  state,
  store,
  pinned,
  canPin,
  otherGuide,
  onClose,
  onSelect,
  onTogglePin,
  onReload,
  onSwitchView,
}: Props & { surface: Surface }) {
  const t = useTranslations();
  const intl = useHydratedIntlStore();
  const formId = useId();
  const copyToClipboard = useCopyToClipboard();
  const workspaceSlug = useWorkspaceSlug();
  const { showTrashConfirmation } = useDeleteConfirmation();
  const scroller = useRef<HTMLDivElement | null>(null);
  const linksSection = useRef<HTMLDivElement | null>(null);
  const settingsOpening = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsReturn, setSettingsReturn] = useState<HTMLElement | null>(null);
  const [links, setLinks] = useState<{ key: string; data: WikiPageLinks | null } | null>(null);
  const pageId = store.creating ? null : store.form.id;
  const canManage = store.canManage;
  const showsPage = state === "page";
  const linksKey = pageId ? `${pageId}:${store.form.updatedAt?.getTime() ?? 0}` : null;

  useEffect(() => {
    if (!open || !showsPage || !pageId || !linksKey) return;
    let current = true;
    actionData(getWikiPageLinksAction({ id: pageId })).then(
      (data) => {
        if (current) setLinks({ key: linksKey, data });
      },
      (error: unknown) => {
        if (!current) return;
        setLinks({ key: linksKey, data: null });
        reportApplicationError(error);
      },
    );
    return () => {
      current = false;
    };
  }, [linksKey, open, pageId, showsPage]);

  const [shownPage, setShownPage] = useState<string | null>(null);
  const shownKey = store.creating ? "new" : pageId;
  if (shownPage !== shownKey) {
    setShownPage(shownKey);
    setSettingsOpen(false);
  }

  const pageLinks = links && links.key === linksKey ? links.data : undefined;
  const linkedPages = pageLinks ? linkedPagesOf(pageLinks) : [];
  const headings = useMemo(() => wikiDocumentHeadings(store.editorDocument), [store.editorDocument]);
  const kindLabels: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guide"),
    procedure: t("Wiki.kind.procedure"),
    knowledge: t("Wiki.kind.knowledge"),
  };
  const title =
    state === "error"
      ? t("Wiki.unavailableTitle")
      : state === "loading"
        ? t("PageState.loading")
        : store.creating
          ? t("Wiki.newPage")
          : store.form.title || t("Wiki.untitled");

  const fullPage = surface === "page";
  const column = fullPage ? PAGE_COLUMN_CLASS : undefined;
  const bodyColumn = fullPage ? PAGE_BODY_COLUMN_CLASS : undefined;
  const hasOutline = fullPage && headings.length >= OUTLINE_MINIMUM;
  const settingsInvalid = ["kind", "whenToUse", "owner"].some((field) => {
    const errors = store.getError(field);
    return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
  });

  const openSettings = () => {
    settingsOpening.current = true;
    setSettingsReturn(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSettingsOpen(true);
  };

  const menu = showsPage ? (
    <>
      {pageId && canPin && pinned !== null && (
        <DropdownMenuItem data-wiki-page-menu="pin" onSelect={onTogglePin}>
          {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}

          {pinned ? t("Wiki.graph.unpin") : t("Wiki.graph.pin")}
        </DropdownMenuItem>
      )}

      {pageId && (
        <DropdownMenuItem
          data-wiki-page-menu="copy-link"
          onSelect={() =>
            runUserAction(async () => {
              if (!workspaceSlug) return;
              await copyToClipboard(wikiPageUrl(window.location.origin, workspaceSlug, pageId));
            })
          }
        >
          <Link aria-hidden />

          {t("Wiki.copyLink")}
        </DropdownMenuItem>
      )}

      <DropdownMenuItem data-wiki-page-menu="settings" onSelect={openSettings}>
        <Settings2 aria-hidden />

        {t("Wiki.settings.title")}
      </DropdownMenuItem>

      {pageId && canManage && (
        <DropdownMenuItem
          data-wiki-page-menu="verify"
          disabled={store.isLoading || store.hasUnsavedChanges}
          onSelect={() => runUserAction(() => store.markVerified())}
        >
          <BadgeCheck aria-hidden />

          {store.hasUnsavedChanges ? t("Wiki.verified.saveFirst") : t("Wiki.verified.mark")}
        </DropdownMenuItem>
      )}

      {pageId && store.allows(Action.delete) && (
        <>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            data-wiki-page-menu="delete"
            disabled={store.isLoading}
            variant="destructive"
            onSelect={() =>
              showTrashConfirmation(
                () => store.delete(),
                store.form.title,
                undefined,
                () => store.showRestored(pageId),
              )
            }
          >
            <Trash2 aria-hidden />

            {t("Wiki.delete")}
          </DropdownMenuItem>
        </>
      )}
    </>
  ) : null;

  const switchView =
    showsPage && pageId && onSwitchView
      ? {
          label: fullPage ? t("Wiki.view.showOnMap") : t("Wiki.view.fullPage"),
          icon: fullPage ? Waypoints : Maximize2,
          onClick: onSwitchView,
        }
      : null;

  const controls = (
    <WikiPageControls
      menu={menu}
      switchView={switchView}
      onMenuCloseAutoFocus={(event) => {
        if (!settingsOpening.current) return;
        settingsOpening.current = false;
        event.preventDefault();
      }}
    />
  );

  const scrollToHeading = (index: number) => {
    const heading = scroller.current?.querySelector(`#${headingAnchorId(WIKI_HEADING_ID_PREFIX, index)}`);
    heading?.scrollIntoView({ block: "start" });
  };

  const linkedHere = pageLinks?.linkedFrom.length ?? 0;
  const owner = store.form.owner.trim();
  const meta: ReactNode[] = [
    <span key="kind" className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-2 rounded-full", WIKI_GRAPH_KIND_DOT[store.form.kind])} />

      {kindLabels[store.form.kind]}
    </span>,
    ...(owner ? [<span key="owner">{owner}</span>] : []),
    ...(store.form.verifiedAt
      ? [
          <span key="verified" className="inline-flex items-center gap-1 text-success-soft-foreground">
            <BadgeCheck aria-hidden className="size-3.5" />

            {t("Wiki.verified.on", { date: intl.formatDescriptiveShortDate(store.form.verifiedAt) })}
          </span>,
        ]
      : []),
    ...(linkedHere > 0
      ? [
          <button
            key="links"
            className="underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-wiki-links-here=""
            type="button"
            onClick={() => linksSection.current?.scrollIntoView({ block: "start", behavior: "smooth" })}
          >
            {t("Wiki.linksHere", { count: linkedHere })}
          </button>,
        ]
      : []),
  ];

  let content: ReactNode;
  if (state === "loading")
    content = <SheetSkeleton className={fullPage ? PAGE_COLUMN_CLASS : undefined} label={t("PageState.loading")} />;
  else if (state === "error") {
    content = (
      <div className={cn("p-6", fullPage && PAGE_COLUMN_CLASS)}>
        {fullPage ? (
          <h2 className="pb-3 text-lg font-semibold">{title}</h2>
        ) : (
          <AppModalTitle className="pb-3 text-lg font-semibold">{title}</AppModalTitle>
        )}

        <Alert description={t("Wiki.unavailableBody")} variant="destructive" />
      </div>
    );
  } else {
    content = (
      <AppForm id={formId} store={store}>
        <AppCard className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-transparent shadow-none">
          <AppCardBody
            ref={scroller}
            className={cn(
              "gap-0 overflow-y-auto overscroll-contain px-0 pt-0 pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]",
            )}
            data-wiki-page-scroller=""
          >
            <AppCardHeader className={cn("pb-1", column)}>
              <WikiPageTitle large={fullPage} store={store} />

              {fullPage && controls}
            </AppCardHeader>

            <div
              className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1 px-6 text-sm text-muted-foreground [&>*+*]:before:me-2 [&>*+*]:before:content-['·']",
                column,
              )}
              data-wiki-page-meta=""
            >
              {meta}
            </div>

            {settingsInvalid && (
              <div className={cn("px-6 pt-2", column)}>
                <Button
                  className="h-auto p-0 text-destructive"
                  data-wiki-settings-invalid=""
                  type="button"
                  variant="link"
                  onClick={openSettings}
                >
                  {t("Wiki.settings.invalid")}
                </Button>
              </div>
            )}

            {store.conflict && (
              <div className={cn("px-6 pt-3", column)}>
                <Alert variant="warning">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p>{t("Wiki.conflict")}</p>

                    <Button disabled={store.isLoading} size="sm" type="button" variant="secondary" onClick={onReload}>
                      {t("Wiki.reload")}
                    </Button>
                  </div>
                </Alert>
              </div>
            )}

            <div className={cn("px-6 pt-4", bodyColumn)}>
              <div className={fullPage ? "flex min-w-0 items-start gap-8" : "contents"}>
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  {store.form.kind === "procedure" && store.form.whenToUse.trim() && (
                    <p
                      className="rounded-md border-l-4 border-success bg-success/10 px-3 py-2 text-sm"
                      data-wiki-when-to-use=""
                    >
                      <span className="font-semibold">{t("Wiki.whenToUse.label")}</span>

                      {` ${store.form.whenToUse}`}
                    </p>
                  )}

                  <EditorLinkPickerContext.Provider value={WikiLinkPicker}>
                    <Editor
                      data={store.editorDocument}
                      headingIdPrefix={WIKI_HEADING_ID_PREFIX}
                      label={title}
                      readOnly={!canManage || store.isLoading}
                      onChange={store.onEditorChange}
                    />
                  </EditorLinkPickerContext.Provider>

                  {pageId && (
                    <div
                      ref={linksSection}
                      className="flex scroll-mt-4 flex-col gap-4 border-t border-border pt-4"
                      data-wiki-page-links=""
                    >
                      {pageLinks === undefined ? (
                        <div className="space-y-3">
                          <SkeletonShape animated className="h-4 w-1/3" />

                          <SkeletonShape animated className="h-6 w-2/3" motionPhase={1} />
                        </div>
                      ) : pageLinks === null ? (
                        <Alert description={t("Wiki.graph.linksFailed")} variant="destructive" />
                      ) : (
                        <>
                          {pageLinks.syncing && (
                            <p className="text-xs text-muted-foreground">{t("Wiki.graph.syncing")}</p>
                          )}

                          <LinkedPages items={linkedPages} onSelect={onSelect} />

                          {pageLinks.missing > 0 && (
                            <p className="text-sm text-destructive-soft-foreground">
                              {t("Wiki.graph.missingLinks", { count: pageLinks.missing })}
                            </p>
                          )}

                          <RecordLinks items={pageLinks.records} />
                        </>
                      )}
                    </div>
                  )}
                </div>

                {hasOutline && (
                  <nav
                    aria-label={t("Wiki.onThisPage")}
                    className="sticky top-0 hidden w-52 shrink-0 @min-[52rem]/wiki:block"
                    data-wiki-page-outline=""
                  >
                    <h3 className="px-1 pb-1 text-xs font-medium text-muted-foreground">{t("Wiki.onThisPage")}</h3>

                    <OutlineLinks headings={headings} onSelect={scrollToHeading} />
                  </nav>
                )}
              </div>
            </div>
          </AppCardBody>

          <UnsavedChangesBar
            anchorScope="wiki-page"
            creating={store.creating}
            formId={formId}
            store={store}
            onCancel={store.creating ? onClose : store.resetDocument}
          />

          <WikiPageSettings
            focusReturnTarget={settingsReturn}
            kindLabels={kindLabels}
            open={settingsOpen}
            otherGuide={otherGuide}
            store={store}
            onClose={() => setSettingsOpen(false)}
          />
        </AppCard>
      </AppForm>
    );
  }

  if (fullPage) {
    return (
      <section
        aria-label={t("Wiki.document")}
        className="@container/wiki relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        data-wiki-document={state}
      >
        {content}
      </section>
    );
  }

  return (
    <AppModal
      focusContentOnOpen
      guardsUnsavedChanges
      sheet
      bodyClassName="flex flex-col overflow-hidden px-0"
      controls={showsPage ? { node: controls, slots: switchView ? 3 : 1 } : undefined}
      open={open}
      title={title}
      titleInContent={state === "error"}
      onClose={onClose}
    >
      {content}
    </AppModal>
  );
});

export function WikiPageSheet(props: Props) {
  return <WikiPageSurface {...props} surface="sheet" />;
}

export function WikiPageDocument(props: Omit<Props, "open" | "canPin" | "pinned" | "onTogglePin">) {
  return <WikiPageSurface {...props} open canPin={false} pinned={null} surface="page" onTogglePin={() => {}} />;
}
