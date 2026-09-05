"use client";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { KeyboardEvent } from "react";

import { ChevronLeftIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Command, CommandInput } from "@/components/ui/command";
import { FilterOperatorKey as OperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
import { PaletteOperatorMenu } from "@/components/data-view/filter-palette/palette-operator-menu";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { resolveFilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";
import { useRootStore } from "@/core/stores/root-store.provider";

import { declaredOperatorsOf, palettePageKind } from "./palette-field-plan";
import { PaletteRootList } from "./palette-root-list";
import { PaletteValueDate } from "./palette-value-date";
import { PaletteValueDateInput } from "./palette-value-date-input";
import { PaletteValueNumber } from "./palette-value-number";
import { PaletteValueOperator } from "./palette-value-operator";
import { PaletteValueSelect } from "./palette-value-select";
import { PaletteValueText } from "./palette-value-text";

type Props = {
  store: BaseDataViewStore<any>;
};

export const FilterPalette = observer(function FilterPalette({ store }: Props) {
  const t = useTranslations();
  const { filterPaletteStore: palette } = useRootStore();

  const page = palette.page;
  const draft = palette.form.draft;
  const isRoot = page.kind === "root";
  const field = isRoot ? "" : page.field;
  const operator = isRoot ? undefined : draft.operator;
  const declaredOperators = isRoot ? [] : declaredOperatorsOf(field, store.filterableFields);
  const pageKind = palettePageKind(resolveFilterValueClass(field, operator, store.customColumns));
  const showDateRows = page.kind === "value" && pageKind === "date" && page.editIndex === undefined;
  const usesCommand = isRoot || pageKind === "select" || pageKind === "operatorOnly" || showDateRows;
  const draftFilter = { field, operator, value: draft.value } as Filter;
  const isValidFilter = !isRoot && hasValidFilterConfiguration(draftFilter);

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || usesCommand || target.tagName !== "INPUT") return;
    if (!event.currentTarget.contains(target)) return;

    event.preventDefault();
    palette.pop();
  }

  function handleHeaderOperator(next: OperatorKey) {
    if (showDateRows && !isStandaloneOperator(next)) {
      palette.pushDateInput(next);
      return;
    }

    palette.setDraftOperator(next);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && palette.query === "" && !isRoot) {
      event.preventDefault();
      palette.pop();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      palette.pop();
    }
  }

  function renderPage() {
    if (isRoot) {
      return (
        <PaletteRootList
          filters={palette.appliedFilters}
          isAtLimit={palette.isAtFilterLimit}
          store={store}
          onPickField={palette.pickField}
          onPickFilter={palette.editFilterAt}
        />
      );
    }

    if (pageKind === "select") {
      return (
        <PaletteValueSelect
          customColumns={store.customColumns}
          filter={draftFilter}
          query={palette.query}
          selected={palette.selectedValues}
          onToggle={palette.toggleValue}
        />
      );
    }

    if (pageKind === "text") return <PaletteValueText isValidFilter={isValidFilter} />;

    if (pageKind === "number") return <PaletteValueNumber isValidFilter={isValidFilter} />;

    if (pageKind === "date") {
      return showDateRows ? (
        <PaletteValueDate
          declaredOperators={declaredOperators}
          operator={operator}
          value={draft.value}
          onCommitPreset={(days) => palette.commitNow({ operator: OperatorKey.inLastDays, value: days })}
          onPushInput={palette.pushDateInput}
        />
      ) : (
        <PaletteValueDateInput
          customColumns={store.customColumns}
          field={field}
          isValidFilter={isValidFilter}
          operator={operator}
        />
      );
    }

    return (
      <PaletteValueOperator current={operator} operators={declaredOperators} onSelect={palette.setDraftOperator} />
    );
  }

  return (
    <AppForm store={palette}>
      <div className="flex min-h-0 flex-col" onKeyDownCapture={handleKeyDownCapture}>
        {!isRoot && (
          <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
            <Button
              aria-label={t("Common.actions.back")}
              id="filter-palette-back"
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={palette.pop}
            >
              <ChevronLeftIcon />
            </Button>

            <PaletteOperatorMenu current={operator} operators={declaredOperators} onSelect={handleHeaderOperator} />
          </div>
        )}

        {usesCommand ? (
          <Command
            loop
            className="h-auto! min-h-0 overflow-visible"
            label={t("Common.filters.palette.title")}
            shouldFilter={isRoot || pageKind !== "select"}
          >
            <div className="shrink-0" id="filter-palette-search">
              <CommandInput
                autoFocus={!isRoot}
                placeholder={isRoot ? t("Common.filters.palette.addFilter") : t("Common.table.search")}
                value={palette.query}
                onKeyDown={handleInputKeyDown}
                onValueChange={palette.setQuery}
              />
            </div>

            {renderPage()}
          </Command>
        ) : (
          renderPage()
        )}
      </div>
    </AppForm>
  );
});
