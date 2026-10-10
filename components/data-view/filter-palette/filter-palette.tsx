"use client";

import type { FilterPaletteSearch, FilterTarget } from "./filter-target";
import type { Filter } from "@/core/base/base-get.schema";
import type { KeyboardEvent } from "react";

import { ChevronLeftIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { AppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { Command, CommandInput } from "@/components/ui/command";
import { FilterOperatorKey as OperatorKey, isStandaloneOperator } from "@/core/base/base-query-builder";
import { PaletteOperatorMenu } from "@/components/data-view/filter-palette/palette-operator-menu";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { resolveFilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";
import { FilterOptionsProvider } from "@/components/data-view/filter-options-context";
import type { FilterPaletteStore } from "./filter-palette.store";

import { declaredOperatorsOf, palettePageKind } from "./palette-field-plan";
import { PaletteRootList } from "./palette-root-list";
import { PaletteValueDate } from "./palette-value-date";
import { PaletteValueDateInput } from "./palette-value-date-input";
import { PaletteValueNumber } from "./palette-value-number";
import { PaletteValueOperator } from "./palette-value-operator";
import { PaletteValueSelect } from "./palette-value-select";
import { PaletteValueText } from "./palette-value-text";
import { FilterInputValues } from "@/components/data-view/filter-modal/inputs/filter-input-values";
import { isShortcutPress } from "@/components/keyboard/shortcut-registry";

type Props = {
  store: FilterTarget;
  palette: FilterPaletteStore;
  search?: FilterPaletteSearch;
};

export const FilterPalette = observer(function FilterPalette({ store: host, palette, search }: Props) {
  const t = useTranslations();
  const store = palette.activeTarget ?? host;
  const paletteRef = useRef<HTMLDivElement>(null);
  const usedCommandRef = useRef(true);

  const page = palette.page;
  const draft = palette.form.draft;
  const isRoot = page.kind === "root";
  const field = isRoot ? "" : page.field;
  const operator = isRoot ? undefined : draft.operator;
  const declaredOperators = isRoot ? [] : declaredOperatorsOf(field, store.filterableFields);
  const pageKind = palettePageKind(resolveFilterValueClass(field, operator, store.filterColumns));
  const showDateRows = page.kind === "value" && pageKind === "date" && page.editIndex === undefined;
  const usesCommand = isRoot || pageKind === "select" || pageKind === "operatorOnly" || showDateRows;
  const draftFilter = { field, operator, value: draft.value } as Filter;
  const isValidFilter = !isRoot && hasValidFilterConfiguration(draftFilter);

  useEffect(() => {
    const cameFromValuePage = !usedCommandRef.current;
    usedCommandRef.current = usesCommand;
    if (usesCommand && !cameFromValuePage) return;

    const selector = usesCommand ? "[cmdk-input]" : '[id="draft.value"]';
    paletteRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  }, [page, usesCommand]);

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (event.key !== "Enter" || usesCommand || pageKind === "values" || target.tagName !== "INPUT") return;
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

    if (isShortcutPress(event.nativeEvent, "save")) {
      event.preventDefault();
      palette.pop();
    }
  }

  function renderPage() {
    if (isRoot) {
      return (
        <PaletteRootList
          disabled={palette.isDisabled}
          filters={palette.appliedFilters}
          isAtLimit={palette.isAtFilterLimit}
          query={palette.query}
          search={store === host ? search : undefined}
          store={store}
          onApplySearch={(term) => {
            search?.apply(term);
            palette.setQuery("");
            palette.close();
          }}
          onPickField={palette.pickField}
          onPickFilter={palette.editFilterAt}
          onPickGroup={palette.openGroup}
          onRemoveFilter={palette.removeFilterAt}
        />
      );
    }

    if (pageKind === "select") {
      return (
        <PaletteValueSelect
          customColumns={store.filterColumns}
          filter={draftFilter}
          query={palette.query}
          selected={palette.selectedValues}
          onToggle={palette.toggleValue}
        />
      );
    }

    if (pageKind === "values") {
      return (
        <div className="p-2">
          <FilterInputValues
            key={`${field}-${operator}`}
            customColumns={store.filterColumns}
            field={field}
            id="draft.value"
          />
        </div>
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
          customColumns={store.filterColumns}
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
    <FilterOptionsProvider fields={store.filterableFields}>
      <AppForm store={palette}>
        <div ref={paletteRef} className="flex min-h-0 flex-col" onKeyDownCapture={handleKeyDownCapture}>
          {(!isRoot || palette.pages.length > 1) && (
            <div className="flex shrink-0 items-center gap-1.5 px-2 pt-2 pb-1">
              <Button
                aria-label={t("Common.actions.back")}
                className="text-muted-foreground hover:text-foreground"
                id="filter-palette-back"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={palette.pop}
              >
                <ChevronLeftIcon />
              </Button>

              {!isRoot && (
                <PaletteOperatorMenu current={operator} operators={declaredOperators} onSelect={handleHeaderOperator} />
              )}
            </div>
          )}

          {usesCommand ? (
            <Command
              loop
              className="h-auto! min-h-0 overflow-visible bg-transparent"
              label={t("Common.filters.palette.title")}
              shouldFilter={isRoot || pageKind !== "select"}
            >
              <div className="shrink-0" id="filter-palette-search">
                <CommandInput
                  autoFocus={!isRoot || search !== undefined}
                  placeholder={
                    !isRoot
                      ? t("Common.table.search")
                      : search
                        ? t("Common.filters.palette.searchOrAddFilter")
                        : t("Common.filters.palette.addFilter")
                  }
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
    </FilterOptionsProvider>
  );
});
