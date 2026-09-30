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
import { cn } from "@/core/utils/cn";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";

const LayoutContext = createContext<RecordDetailLayoutStore | null>(null);

export const RecordDetailPersonalization = observer(function RecordDetailPersonalization({
  store,
  children,
}: {
  store: RecordEditorStore;
  children: ReactNode;
}) {
  const initial = store.presentation.detailLayout;
  const [layout] = useState(() => (initial ? store.rootStore.recordWorkspaceStore.getDetailLayout(initial) : null));
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [previewFieldValues, setPreviewFieldValues] = useState<Record<string, EntityDetailPreviewItem[]>>({});
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
            hiddenFieldIds: layout.layout.hiddenFields,
            availableFieldIds: layout.state.fields.map((field) => field.id),
            fieldOrder: layout.layout.fieldOrder,
            columnOrder: layout.layout.fieldOrder,
            previewFieldValues,
            setIsPersonalizing,
            toggleStarredField: layout.togglePinned,
            toggleFieldVisibility: layout.toggleHidden,
            reorderFields: layout.reorder,
            reorderColumns: layout.reorder,
            setPreviewFieldValue,
          }
        : null,
    [layout, layout?.layout, layout?.state, store.record, isPersonalizing, previewFieldValues, setPreviewFieldValue],
  );
  if (!value) return children;
  return (
    <LayoutContext.Provider value={layout}>
      <EntityDetailPersonalizationContext.Provider value={value}>
        {children}
      </EntityDetailPersonalizationContext.Provider>
    </LayoutContext.Provider>
  );
});

const LayoutControls = observer(function LayoutControls({
  layout,
  isPersonalizing,
  setIsPersonalizing,
  compact,
}: {
  layout: RecordDetailLayoutStore;
  isPersonalizing: boolean;
  setIsPersonalizing: (value: boolean) => void;
  compact: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center gap-2">
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

      {isPersonalizing && (
        <Button
          aria-label={t("RecordModel.resetDetailLayout")}
          disabled={layout.isSaving || (!layout.state.hasPersonalization && !layout.dirty)}
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => runUserAction(layout.reset)}
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

      {layout.failed && (
        <span className="flex items-center gap-2 text-xs text-destructive" role="alert">
          {t("RecordModel.detailLayoutSaveFailed")}

          <Button size="sm" type="button" variant="ghost" onClick={() => runUserAction(layout.retry)}>
            {t("ErrorCard.retry")}
          </Button>
        </span>
      )}
    </div>
  );
});

export function useRecordDetailLayoutControls(compact = false) {
  const layout = useContext(LayoutContext);
  const { enabled, isPersonalizing, setIsPersonalizing } = useEntityDetailPersonalization();
  return useMemo(
    () =>
      enabled && layout ? (
        <LayoutControls
          compact={compact}
          isPersonalizing={isPersonalizing}
          layout={layout}
          setIsPersonalizing={setIsPersonalizing}
        />
      ) : null,
    [compact, enabled, isPersonalizing, layout, setIsPersonalizing],
  );
}

export function RecordDetailLayoutControls() {
  return useRecordDetailLayoutControls();
}
