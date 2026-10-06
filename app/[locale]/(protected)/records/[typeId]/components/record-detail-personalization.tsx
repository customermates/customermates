"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { Check, RotateCcw, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RecordEditorStore } from "./record-editor.store";
import type { RecordDetailLayoutStore } from "@/core/stores/record-detail-layout.store";
import type {
  EntityDetailPersonalizationValue,
  EntityDetailPreviewItem,
} from "@/components/entity-detail/entity-detail-personalization";
import {
  EntityDetailPersonalizationContext,
  useEntityDetailPersonalization,
} from "@/components/entity-detail/entity-detail-personalization";
import { Button } from "@/components/ui/button";
import { AppModalAction } from "@/components/modal/app-modal-action";
import { cn } from "@/core/utils/cn";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

const LayoutContext = createContext<{
  layout: RecordDetailLayoutStore;
  editor: RecordEditorStore;
} | null>(null);

export const RecordDetailPersonalization = observer(function RecordDetailPersonalization({
  store,
  children,
}: {
  store: RecordEditorStore;
  children?: ReactNode;
}) {
  const initial = store.presentation.detailLayout;
  const [layout] = useState(() => (initial ? store.rootStore.recordWorkspaceStore.getDetailLayout(initial) : null));
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [previewFieldValues, setPreviewFieldValues] = useState<Record<string, EntityDetailPreviewItem[]>>({});
  const hasRelatedDraft = store.hasRelatedDraft;
  useEffect(() => {
    if (initial) layout?.hydrate(initial);
  }, [initial, layout]);
  useEffect(
    () => () => {
      if (layout) void layout.flush().catch(reportApplicationError);
    },
    [layout],
  );
  const setPreviewFieldValue = useCallback((id: string, items: EntityDetailPreviewItem[]) => {
    setPreviewFieldValues((current) =>
      JSON.stringify(current[id]) === JSON.stringify(items) ? current : { ...current, [id]: items },
    );
  }, []);
  const value = useMemo<EntityDetailPersonalizationValue | null>(
    () =>
      layout
        ? {
            enabled: true,
            applyFieldVisibility: store.record !== null,
            isPersonalizing,
            starredFieldIds: layout.layout.pinnedFields,
            hiddenFieldIds: hasRelatedDraft
              ? layout.layout.hiddenFields.filter((id) => id !== "system:channels")
              : layout.layout.hiddenFields,
            availableFieldIds: [
              ...layout.state.fields.map((field) => field.id),
              ...(hasRelatedDraft ? ["system:channels"] : []),
            ],
            fieldOrder: layout.layout.fieldOrder,
            columnOrder: layout.layout.fieldOrder,
            previewFieldValues,
            setIsPersonalizing: (next) => store.runAfterChannelDraft(() => setIsPersonalizing(next)),
            toggleStarredField: (id) => store.runAfterChannelDraft(() => layout.togglePinned(id)),
            toggleFieldVisibility: (id) => store.runAfterChannelDraft(() => layout.toggleHidden(id)),
            reorderFields: (ids) => store.runAfterChannelDraft(() => layout.reorder(ids)),
            reorderColumns: (ids) => store.runAfterChannelDraft(() => layout.reorder(ids)),
            setPreviewFieldValue,
          }
        : null,
    [
      layout,
      layout?.layout,
      layout?.state,
      store,
      store.record,
      hasRelatedDraft,
      isPersonalizing,
      previewFieldValues,
      setPreviewFieldValue,
    ],
  );
  const layoutContext = useMemo(() => (layout ? { layout, editor: store } : null), [layout, store]);
  if (!value) return children;
  return (
    <LayoutContext.Provider value={layoutContext}>
      <EntityDetailPersonalizationContext.Provider value={value}>
        {children}
      </EntityDetailPersonalizationContext.Provider>
    </LayoutContext.Provider>
  );
});

const LayoutControls = observer(function LayoutControls({
  layout,
  editor,
  isPersonalizing,
  setIsPersonalizing,
  compact,
  statusOnly = false,
  className,
}: {
  layout: RecordDetailLayoutStore;
  editor: RecordEditorStore;
  isPersonalizing: boolean;
  setIsPersonalizing: (value: boolean) => void;
  compact: boolean;
  statusOnly?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  if (statusOnly && !isPersonalizing && !layout.isSaving && !layout.failed) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {!statusOnly && (
        <Button
          aria-label={isPersonalizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize")}
          aria-pressed={isPersonalizing}
          size="sm"
          type="button"
          variant={isPersonalizing ? "default" : "secondary"}
          onClick={() => setIsPersonalizing(!isPersonalizing)}
        >
          {isPersonalizing ? <Check className="size-4" /> : <Settings2 className="size-4" />}

          <span className={cn(compact && "hidden sm:inline")}>
            {isPersonalizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize")}
          </span>
        </Button>
      )}

      {isPersonalizing && (
        <Button
          aria-label={t("RecordModel.resetDetailLayout")}
          disabled={layout.isSaving || (!layout.state.hasPersonalization && !layout.dirty)}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => editor.runAfterChannelDraft(() => runUserAction(layout.reset))}
        >
          <RotateCcw className="size-4" />

          <span className={cn(compact && "hidden sm:inline")}>{t("RecordModel.resetDetailLayout")}</span>
        </Button>
      )}

      {layout.isSaving && (
        <span className="text-xs text-muted-foreground" role="status">
          {t("RecordModel.savingDetailLayout")}
        </span>
      )}

      {layout.failed && !layout.isSaving && (
        <span className="flex items-center gap-2 text-xs text-destructive" role="alert">
          {layout.saveFailed ? t("RecordModel.detailLayoutSaveFailed") : t("RecordModel.detailLayoutReadFailed")}

          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => editor.runAfterChannelDraft(() => runUserAction(layout.retry))}
          >
            {t("ErrorCard.retry")}
          </Button>

          {layout.saveFailed && (
            <Button size="sm" type="button" variant="ghost" onClick={() => editor.runAfterChannelDraft(layout.discard)}>
              {t("Common.actions.discard")}
            </Button>
          )}
        </span>
      )}
    </div>
  );
});

export function useRecordDetailLayoutControls(compact = false) {
  const context = useContext(LayoutContext);
  const { enabled, isPersonalizing, setIsPersonalizing } = useEntityDetailPersonalization();
  return useMemo(
    () =>
      enabled && context ? (
        <LayoutControls
          compact={compact}
          editor={context.editor}
          isPersonalizing={isPersonalizing}
          layout={context.layout}
          setIsPersonalizing={setIsPersonalizing}
        />
      ) : null,
    [compact, enabled, isPersonalizing, context, setIsPersonalizing],
  );
}

/** Icon-only Customize toggle for an overlay header action rail. */
export function RecordDetailCustomizeAction() {
  const t = useTranslations();
  const context = useContext(LayoutContext);
  const { enabled, isPersonalizing, setIsPersonalizing } = useEntityDetailPersonalization();
  if (!enabled || !context) return null;
  const label = isPersonalizing ? t("EntityDetail.donePersonalizing") : t("EntityDetail.personalize");
  return (
    <AppModalAction
      anchorId="record-customize"
      icon={isPersonalizing ? Check : Settings2}
      id="record-customize"
      label={label}
      onClick={() => setIsPersonalizing(!isPersonalizing)}
    />
  );
}

/** Reset and save status for the layout while customizing; renders nothing otherwise. */
export function RecordDetailLayoutStatus({ className }: { className?: string }) {
  const context = useContext(LayoutContext);
  const { enabled, isPersonalizing, setIsPersonalizing } = useEntityDetailPersonalization();
  if (!enabled || !context) return null;
  return (
    <LayoutControls
      statusOnly
      className={className}
      compact={false}
      editor={context.editor}
      isPersonalizing={isPersonalizing}
      layout={context.layout}
      setIsPersonalizing={setIsPersonalizing}
    />
  );
}
