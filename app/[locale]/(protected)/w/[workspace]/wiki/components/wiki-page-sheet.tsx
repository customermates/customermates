"use client";

import type { ReactNode } from "react";
import type { AppModalActionProps } from "@/components/modal/app-modal-action";
import type { WikiGraphRecordType, WikiPageLinks } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";
import type { WikiPageStore } from "./wiki-page.store";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { BadgeCheck, Link, Maximize2, Pin, PinOff, Trash2, Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { Editor } from "@/components/editor/editor";
import { EditorLinkPickerContext } from "@/components/editor/editor-link-picker";
import { headingAnchorId } from "@/components/editor/heading-anchor-extension";
import { AppForm } from "@/components/forms/form-context";
import { FormFieldHelp } from "@/components/forms/form-field-help";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormTextarea } from "@/components/forms/form-textarea";
import { UnsavedChangesBar } from "@/components/forms/unsaved-changes-bar";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { AppModalActionRail } from "@/components/modal/app-modal-action";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import { SkeletonShape } from "@/components/page-state/skeleton-shape";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";
import { actionData } from "@/core/utils/action-data";
import { cn } from "@/core/utils/cn";
import { useCopyToClipboard } from "@/core/utils/use-copy-to-clipboard";
import { wikiPageUrl } from "@/features/wiki/wiki-links";
import {
  WIKI_OWNER_MAX_LENGTH,
  WIKI_PAGE_KINDS,
  WIKI_WHEN_TO_USE_MAX_LENGTH,
  WikiPageKindSchema,
} from "@/features/wiki/wiki.schema";
import { Action } from "@/generated/prisma";
import { IntlLink, useWorkspaceSlug } from "@/i18n/navigation";

import { getWikiPageLinksAction } from "../actions";
import { WIKI_GRAPH_KIND_DOT, WIKI_KIND_CHIP } from "./wiki-graph-model";
import { WikiLinkPicker } from "./wiki-link-picker";
import { WIKI_HEADING_ID_PREFIX, wikiDocumentHeadings } from "./wiki-page-outline";
import { WikiPageTitle } from "./wiki-page-title";

type Segment = "page" | "links" | "details";

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

const OUTLINE_MINIMUM = 3;
const PAGE_COLUMN_CLASS = "mx-auto w-full max-w-5xl";
const PAGE_BODY_COLUMN_CLASS = "*:mx-auto *:w-full *:max-w-[61rem]";
const PAGE_SEGMENTS_CLASS = "ms-[max(1.5rem,calc((100%-64rem)/2+1.5rem))] me-auto w-fit min-w-72";

function SheetSkeleton({ label, className }: { label: string; className?: string }) {
  return (
    <div
      aria-label={label}
      className={cn("flex flex-col gap-5 p-6", className)}
      data-wiki-page-sheet-skeleton=""
      role="status"
    >
      <SkeletonShape animated className="h-7 w-2/3" />

      <div className="flex gap-2">
        <SkeletonShape animated className="h-5 w-20 rounded-md" motionPhase={1} />

        <SkeletonShape animated className="h-5 w-28 rounded-md" motionPhase={1} />
      </div>

      <SkeletonShape animated className="h-8 w-full rounded-md" motionPhase={2} />

      <div className="space-y-3">
        <SkeletonShape animated className="h-4 w-full" motionPhase={3} />

        <SkeletonShape animated className="h-4 w-11/12" motionPhase={3} />

        <SkeletonShape animated className="h-4 w-4/5" motionPhase={3} />
      </div>
    </div>
  );
}

function LinkedPages({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: WikiPageLinks["linkedFrom"];
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-medium text-muted-foreground">{`${title} · ${items.length}`}</h3>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Wiki.graph.noLinks")}</p>
      ) : (
        <ul className="-mx-2">
          {items.map((item) => (
            <li key={item.id}>
              <Button
                className="h-auto min-h-8 w-full justify-start gap-2 px-2 py-1 text-left font-normal"
                type="button"
                variant="ghost"
                onClick={() => onSelect(item.id)}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2.5 shrink-0 rounded-full", WIKI_GRAPH_KIND_DOT[item.kind])}
                />

                <span className="truncate">{item.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordLinks({ items }: { items: Array<WikiGraphRecordType & { count: number; list: boolean }> }) {
  const t = useTranslations();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground">{t("Wiki.graph.records")}</h3>

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
  const [segment, setSegment] = useState<Segment>("page");
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
    setSegment(store.creating ? "page" : segment === "details" ? "page" : segment);
  }

  const pageLinks = links && links.key === linksKey ? links.data : undefined;
  const headings = useMemo(() => wikiDocumentHeadings(store.editorDocument), [store.editorDocument]);
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
  const title =
    state === "error"
      ? t("Wiki.unavailableTitle")
      : state === "loading"
        ? t("PageState.loading")
        : store.creating
          ? t("Wiki.newPage")
          : store.form.title || t("Wiki.untitled");

  const actions: AppModalActionProps[] =
    !showsPage || !pageId
      ? []
      : [
          ...(canManage
            ? [
                {
                  id: "verify",
                  icon: BadgeCheck,
                  label: t("Wiki.verified.mark"),
                  tooltip: store.hasUnsavedChanges ? t("Wiki.verified.saveFirst") : t("Wiki.verified.help"),
                  disabled: store.isLoading || store.hasUnsavedChanges,
                  onClick: () => store.markVerified(),
                },
              ]
            : []),
          ...(canPin && pinned !== null
            ? [
                {
                  id: "pin",
                  icon: pinned ? PinOff : Pin,
                  label: pinned ? t("Wiki.graph.unpin") : t("Wiki.graph.pin"),
                  tooltip: pinned ? t("Wiki.graph.unpinHelp") : t("Wiki.graph.pinHelp"),
                  pressed: pinned,
                  onClick: onTogglePin,
                },
              ]
            : []),
          {
            id: "copy-link",
            icon: Link,
            label: t("Wiki.copyLink"),
            onClick: async () => {
              if (!workspaceSlug) return;
              await copyToClipboard(wikiPageUrl(window.location.origin, workspaceSlug, pageId));
            },
          },
          ...(store.allows(Action.delete)
            ? [
                {
                  id: "delete",
                  icon: Trash2,
                  label: t("Wiki.delete"),
                  variant: "destructive" as const,
                  disabled: store.isLoading,
                  onClick: () =>
                    showTrashConfirmation(
                      () => store.delete(),
                      store.form.title,
                      undefined,
                      () => store.showRestored(pageId),
                    ),
                },
              ]
            : []),
          ...(onSwitchView
            ? [
                {
                  id: "switch-view",
                  kind: "navigate" as const,
                  icon: surface === "sheet" ? Maximize2 : Waypoints,
                  label: surface === "sheet" ? t("Wiki.view.openFullPage") : t("Wiki.view.showOnMap"),
                  onClick: onSwitchView,
                },
              ]
            : []),
        ];

  const scrollToHeading = (index: number) => {
    setSegment("page");
    window.requestAnimationFrame(() => {
      const heading = scroller.current?.querySelector(`#${headingAnchorId(WIKI_HEADING_ID_PREFIX, index)}`);
      heading?.scrollIntoView({ block: "start" });
    });
  };

  const fieldError = (field: string) => {
    const errors = store.getError(field);
    return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
  };

  const fullPage = surface === "page";
  const column = fullPage ? PAGE_COLUMN_CLASS : undefined;
  const bodyColumn = fullPage ? PAGE_BODY_COLUMN_CLASS : undefined;
  const hasOutline = headings.length >= OUTLINE_MINIMUM;

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
          <AppCardHeader className={cn("pb-3", column)}>
            <WikiPageTitle large={fullPage} store={store} />

            {fullPage && <AppModalActionRail actions={actions} />}
          </AppCardHeader>

          <div className={cn("flex shrink-0 flex-wrap items-center gap-1.5 px-6 pb-1", column)} data-wiki-page-chips="">
            <AppChip variant={WIKI_KIND_CHIP[store.form.kind]}>{kindLabels[store.form.kind]}</AppChip>

            {pageLinks && pageLinks.linkedFrom.length > 0 && (
              <AppChip>{t("Wiki.graph.linkedFromCount", { count: pageLinks.linkedFrom.length })}</AppChip>
            )}

            {store.form.owner.trim() && <AppChip>{store.form.owner.trim()}</AppChip>}

            {store.form.verifiedAt && (
              <AppChip startContent={<BadgeCheck aria-hidden="true" />} variant="success">
                {t("Wiki.verified.on", { date: intl.formatDescriptiveShortDate(store.form.verifiedAt) })}
              </AppChip>
            )}

            {pinned && (
              <AppChip startContent={<Pin aria-hidden="true" />} tooltip={t("Wiki.graph.pinnedHelp")}>
                {t("Wiki.graph.pinned")}
              </AppChip>
            )}
          </div>

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

          <SegmentedControl
            className="min-h-0 flex-1 gap-0"
            idPrefix="wiki-page-sheet"
            items={[
              {
                value: "page",
                label: t("Wiki.graph.segments.page"),
                invalid: fieldError("markdown"),
                invalidLabel: t("EditorTabs.invalid"),
              },
              ...(store.creating ? [] : [{ value: "links" as const, label: t("Wiki.graph.segments.links") }]),
              {
                value: "details",
                label: t("Wiki.graph.segments.details"),
                invalid: fieldError("kind") || fieldError("whenToUse") || fieldError("owner"),
                invalidLabel: t("EditorTabs.invalid"),
              },
            ]}
            label={t("Wiki.graph.sheetSegments")}
            listClassName={cn("mt-4 mb-2", fullPage ? PAGE_SEGMENTS_CLASS : "mx-6 w-auto")}
            value={segment}
            onValueChange={setSegment}
          >
            <SegmentedControlPanel className="m-0 flex min-h-0 flex-1 flex-col" value="page">
              <AppCardBody
                ref={scroller}
                className={cn(
                  "overflow-y-auto overscroll-contain pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]",
                  bodyColumn,
                )}
                data-wiki-page-scroller=""
              >
                <div className={fullPage ? "flex min-w-0 flex-1 items-start gap-8" : "contents"}>
                  <div className="flex min-w-0 flex-1 flex-col gap-4">
                    {hasOutline && (
                      <CollapsibleSection
                        className={fullPage ? "@min-[52rem]/wiki:hidden" : undefined}
                        summary={headings.length}
                        title={t("Wiki.onThisPage")}
                      >
                        <OutlineLinks headings={headings} onSelect={scrollToHeading} />
                      </CollapsibleSection>
                    )}

                    {store.form.kind === "procedure" && store.form.whenToUse.trim() && (
                      <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{t("Wiki.whenToUse.label")}: </span>

                        {store.form.whenToUse}
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
                  </div>

                  {fullPage && hasOutline && (
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
              </AppCardBody>
            </SegmentedControlPanel>

            {!store.creating && (
              <SegmentedControlPanel className="m-0 flex min-h-0 flex-1 flex-col" value="links">
                <AppCardBody className={cn("gap-5 overflow-y-auto overscroll-contain", bodyColumn)}>
                  {pageLinks === undefined ? (
                    <div className="space-y-3 pt-1">
                      <SkeletonShape animated className="h-4 w-2/3" />

                      <SkeletonShape animated className="h-4 w-1/2" motionPhase={1} />
                    </div>
                  ) : pageLinks === null ? (
                    <Alert description={t("Wiki.graph.linksFailed")} variant="destructive" />
                  ) : (
                    <>
                      {pageLinks.syncing && <p className="text-xs text-muted-foreground">{t("Wiki.graph.syncing")}</p>}

                      <LinkedPages
                        items={pageLinks.linkedFrom}
                        title={t("Wiki.graph.linkedFrom")}
                        onSelect={onSelect}
                      />

                      <LinkedPages items={pageLinks.linksTo} title={t("Wiki.graph.linksTo")} onSelect={onSelect} />

                      {pageLinks.missing > 0 && (
                        <p className="text-sm text-destructive-soft-foreground">
                          {t("Wiki.graph.missingLinks", { count: pageLinks.missing })}
                        </p>
                      )}

                      <RecordLinks items={pageLinks.records} />
                    </>
                  )}
                </AppCardBody>
              </SegmentedControlPanel>
            )}

            <SegmentedControlPanel className="m-0 flex min-h-0 flex-1 flex-col" value="details">
              <AppCardBody
                className={cn(
                  "overflow-y-auto overscroll-contain pb-[calc(1.5rem+var(--unsaved-changes-bar-space,var(--safe-bottom)))]",
                  bodyColumn,
                )}
              >
                <FormSelect
                  disabled={!canManage}
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
                    disabled={!canManage}
                    id="whenToUse"
                    label={t("Wiki.whenToUse.label")}
                    maxLength={WIKI_WHEN_TO_USE_MAX_LENGTH}
                    placeholder={t("Wiki.whenToUse.placeholder")}
                    rows={2}
                  />
                )}

                <FormInput
                  disabled={!canManage}
                  id="owner"
                  label={t("Wiki.owner.label")}
                  labelEndAddon={
                    <FormFieldHelp label={t("Common.ariaLabels.explainField", { field: t("Wiki.owner.label") })}>
                      {t("Wiki.owner.help")}
                    </FormFieldHelp>
                  }
                  maxLength={WIKI_OWNER_MAX_LENGTH}
                  placeholder={t("Wiki.owner.placeholder")}
                />

                {pageId && (
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 pt-1 text-sm">
                    <dt className="text-muted-foreground">{t("Wiki.verified.label")}</dt>

                    <dd>
                      {store.form.verifiedAt
                        ? intl.formatDescriptiveShortDate(store.form.verifiedAt)
                        : t("Wiki.verified.never")}
                    </dd>

                    <dt className="text-muted-foreground">{t("Wiki.changed")}</dt>

                    <dd>{store.form.updatedAt ? intl.formatDescriptiveShortDate(store.form.updatedAt) : ""}</dd>
                  </dl>
                )}
              </AppCardBody>
            </SegmentedControlPanel>
          </SegmentedControl>

          <UnsavedChangesBar
            anchorScope="wiki-page"
            creating={store.creating}
            formId={formId}
            store={store}
            onCancel={store.creating ? onClose : store.resetDocument}
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
      actions={actions}
      bodyClassName="flex flex-col overflow-hidden px-0"
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
