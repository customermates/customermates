"use client";

import type { PlannerSource } from "@/features/planner/planner.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { AppModal, AppModalTitle } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppCardBody } from "@/components/card/app-card-body";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { FormSelect } from "@/components/forms/form-select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataViewToolbar } from "@/components/data-view/data-view-toolbar";
import { useRootStore } from "@/core/stores/root-store.provider";
import { actionData } from "@/core/utils/action-data";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { CHIP_COLORS } from "@/constants/chip-colors";
import {
  isCalendarDateField,
  isCalendarEndField,
  isCalendarColorField,
  isCalendarRangeField,
} from "@/features/record-calendar/record-calendar-query";
import { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";
import { getRecordPresentationAction } from "../../records/actions";

const NONE = "none";
const SourceFilters = observer(function SourceFilters({
  presentation,
  onReady,
}: {
  presentation: RecordPresentationResult;
  onReady: (store: RecordExplorationStore) => void;
}) {
  const root = useRootStore();
  const t = useTranslations();
  const [store] = useState(() => new RecordExplorationStore(root, presentation));
  useEffect(() => onReady(store), [store, onReady]);
  return (
    <DataViewToolbar
      anchorScope="planner-source"
      searchLabel={t("Common.filters.searchFields.records")}
      showDisplayOptions={false}
      store={store}
    />
  );
});

export function PlannerSourceModal({
  source,
  model,
  onClose,
  onSave,
}: {
  source: PlannerSource;
  model: RecordModelView;
  onClose: () => void;
  onSave: (source: PlannerSource) => void;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState(source);
  const [presentation, setPresentation] = useState<{ typeId: string; data: RecordPresentationResult } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const filterStore = useRef<RecordExplorationStore | null>(null);
  const colorLabels = {
    default: t("Common.colors.default"),
    secondary: t("Common.colors.secondary"),
    destructive: t("Common.colors.destructive"),
    success: t("Common.colors.success"),
    warning: t("Common.colors.warning"),
    info: t("Common.colors.info"),
  };
  const fields = model.fields.filter((field) => field.typeId === draft.typeId && !field.archived);
  const start = fields.find((field) => field.id === draft.calendar.dateFieldId);
  const types = model.types.filter(
    (type) => !type.archived && model.fields.some((field) => field.typeId === type.id && isCalendarDateField(field)),
  );
  useEffect(() => {
    let active = true;
    filterStore.current = null;
    setFailed(false);
    actionData(
      getRecordPresentationAction(draft.typeId, {
        viewId: ALL_VIEW_KEY,
        filters: draft.filters,
        searchTerm: draft.search,
        viewMode: ViewMode.table,
        grouping: null,
        page: 1,
        pageSize: 5,
      }),
    )
      .then((data) => {
        if (active) setPresentation({ typeId: draft.typeId, data });
      })
      .catch((error: unknown) => {
        if (active) {
          setFailed(true);
          reportApplicationError(error);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.typeId, attempt]);
  const choice = (field: { id: string; label: string }) => ({ value: field.id, label: field.label });
  return (
    <AppModal open titleInContent size="xl" title={t("Planner.sourceSettings")} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <AppModalTitle>{t("Planner.sourceSettings")}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody className="space-y-5 overflow-y-auto">
          <FormSelect
            id="planner-list"
            items={types.map((type) => ({ value: type.id, label: type.pluralLabel }))}
            label={t("Planner.list")}
            value={draft.typeId}
            onValueChange={(typeId) => {
              const field = model.fields.find((field) => field.typeId === typeId && isCalendarDateField(field));
              if (field) setDraft({ ...draft, typeId, calendar: { dateFieldId: field.id }, filters: [], search: "" });
            }}
          />

          <FormSelect
            id="planner-start"
            items={fields.filter(isCalendarDateField).map(choice)}
            label={t("Planner.startDate")}
            value={draft.calendar.dateFieldId}
            onValueChange={(dateFieldId) =>
              setDraft({ ...draft, calendar: { ...draft.calendar, dateFieldId, endDateFieldId: null } })
            }
          />

          {start && !isCalendarRangeField(start) && (
            <FormSelect
              id="planner-end"
              items={[
                { value: NONE, label: t("Planner.noEndDate") },
                ...fields.filter((field) => field.id !== start.id && isCalendarEndField(field, start)).map(choice),
              ]}
              label={t("Planner.endDate")}
              value={draft.calendar.endDateFieldId ?? NONE}
              onValueChange={(value) =>
                setDraft({ ...draft, calendar: { ...draft.calendar, endDateFieldId: value === NONE ? null : value } })
              }
            />
          )}

          <FormSelect
            id="planner-color-field"
            items={[
              { value: NONE, label: t("Planner.sourceColor") },
              ...fields.filter(isCalendarColorField).map(choice),
            ]}
            label={t("Planner.colorField")}
            value={draft.calendar.colorFieldId ?? NONE}
            onValueChange={(value) =>
              setDraft({ ...draft, calendar: { ...draft.calendar, colorFieldId: value === NONE ? null : value } })
            }
          />

          <FormSelect
            id="planner-color"
            items={CHIP_COLORS.map((value) => ({ value, label: colorLabels[value], color: value }))}
            label={t("Planner.sourceColor")}
            value={draft.color}
            onValueChange={(color) => {
              if ((CHIP_COLORS as readonly string[]).includes(color))
                setDraft({ ...draft, color: color as PlannerSource["color"] });
            }}
          />

          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("Planner.filters")}</h3>

            {failed ? (
              <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                {t("ErrorCard.retry")}
              </Button>
            ) : presentation?.typeId === draft.typeId ? (
              <SourceFilters
                key={draft.typeId}
                presentation={presentation.data}
                onReady={(store) => {
                  filterStore.current = store;
                }}
              />
            ) : (
              <Skeleton className="h-9" />
            )}
          </div>
        </AppCardBody>

        <FormFooterActions
          creating
          dirty
          anchorScope="planner-source"
          saving={!start || failed || !presentation || presentation.typeId !== draft.typeId}
          onCancel={onClose}
          onSave={() =>
            onSave({
              ...draft,
              filters: toJS(filterStore.current?.filters ?? draft.filters),
              search: filterStore.current?.searchTerm ?? draft.search,
            })
          }
        />
      </AppCard>
    </AppModal>
  );
}
