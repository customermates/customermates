"use client";

import type { PlannerSource } from "@/features/planner/planner.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";

import { useEffect, useState } from "react";
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
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterPaletteInline } from "@/components/data-view/filter-palette/filter-palette-inline";
import { useRootStore } from "@/core/stores/root-store.provider";
import { actionData } from "@/core/utils/action-data";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { canonicalRecordJson } from "@/features/records/record-json";
import {
  isCalendarDateField,
  isCalendarEndField,
  isCalendarColorField,
  isCalendarRangeField,
} from "@/features/record-calendar/record-calendar-query";
import { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";
import { getRecordPresentationAction } from "../../records/actions";

const NONE = "none";

export const PlannerSourceModal = observer(function PlannerSourceModal({
  source,
  creating,
  model,
  onClose,
  onSave,
}: {
  source: PlannerSource;
  creating: boolean;
  model: RecordModelView;
  onClose: () => void;
  onSave: (source: PlannerSource) => void;
}) {
  const t = useTranslations();
  const root = useRootStore();
  const [draft, setDraft] = useState(source);
  const [filters, setFilters] = useState<{ typeId: string; store: RecordExplorationStore } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
  const filterStore = filters?.typeId === draft.typeId ? filters.store : null;
  useEffect(() => {
    let active = true;
    setFailed(false);
    actionData(
      getRecordPresentationAction(draft.typeId, {
        viewId: ALL_VIEW_KEY,
        filters: draft.typeId === source.typeId ? source.filters : [],
        viewMode: ViewMode.table,
        grouping: null,
        page: 1,
        pageSize: 5,
      }),
    )
      .then((data) => {
        if (active) setFilters({ typeId: draft.typeId, store: new RecordExplorationStore(root, data) });
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
  }, [root, draft.typeId, source.typeId, source.filters, attempt]);
  const result = () => ({ ...draft, filters: filterStore ? (toJS(filterStore.filters) ?? []) : draft.filters });
  const changed = canonicalRecordJson(result()) !== canonicalRecordJson(source);
  const save = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("[data-filter-inline]")) active.blur();
    onSave(result());
  };
  const choice = (field: { id: string; label: string }) => ({ value: field.id, label: field.label });
  const title = creating ? t("Planner.addSource") : t("Planner.sourceSettings");
  return (
    <AppModal open titleInContent size="lg" title={title} onClose={onClose}>
      <AppCard>
        <AppCardHeader>
          <AppModalTitle>{title}</AppModalTitle>
        </AppCardHeader>

        <AppCardBody>
          <FormSelect
            id="planner-list"
            items={types.map((type) => ({ value: type.id, label: type.pluralLabel }))}
            label={t("Planner.list")}
            value={draft.typeId}
            onValueChange={(typeId) => {
              const field = model.fields.find((field) => field.typeId === typeId && isCalendarDateField(field));
              if (field) setDraft({ ...draft, typeId, calendar: { dateFieldId: field.id }, filters: [] });
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
            label={t("DataView.calendar.colorField")}
            value={draft.calendar.colorFieldId ?? NONE}
            onValueChange={(value) =>
              setDraft({ ...draft, calendar: { ...draft.calendar, colorFieldId: value === NONE ? null : value } })
            }
          />

          {!draft.calendar.colorFieldId && (
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
          )}

          <CollapsibleSection
            defaultOpen={source.filters.length > 0}
            id="planner-source-filters"
            summary={t("Planner.filterCount", { count: result().filters.length })}
            title={t("Planner.filters")}
          >
            {failed ? (
              <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                {t("ErrorCard.retry")}
              </Button>
            ) : filterStore ? (
              <FilterPaletteInline id="planner-source-filter-palette" store={filterStore} />
            ) : (
              <Skeleton className="h-9" />
            )}
          </CollapsibleSection>
        </AppCardBody>

        <FormFooterActions
          anchorScope="planner-source"
          creating={creating && Boolean(start)}
          dirty={Boolean(start) && changed}
          store={null}
          onCancel={onClose}
          onSave={save}
        />
      </AppCard>
    </AppModal>
  );
});
