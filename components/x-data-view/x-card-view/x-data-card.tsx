"use client";

import type { HasId } from "@/core/base/base-data-view.store";

import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";
import { cn } from "@heroui/theme";

import { XCard } from "../../x-card/x-card";
import { XCardBody } from "../../x-card/x-card-body";
import { useXDataView } from "../x-data-view-container";

type Props<E extends HasId> = {
  className?: string;
  item: E;
  renderCell: (item: E, columnKey: React.Key) => string | number | React.JSX.Element;
  onPress?: (item: E) => void;
};

export const XDataCard = observer(<E extends HasId>({ item, renderCell, className, onPress }: Props<E>) => {
  const store = useXDataView<E>();
  const t = useTranslations("Common");
  const visibleColumns = store.headerColumns;

  return (
    <XCard
      disableRipple
      className={cn("min-w-[300px]", className)}
      isPressable={Boolean(onPress)}
      tabIndex={-1}
      onPress={onPress ? () => onPress(item) : undefined}
    >
      <XCardBody className="overflow-hidden">
        {visibleColumns.map((column) => {
          const cellContent = renderCell(item, column.uid);
          const hasContent = cellContent !== "" && cellContent !== null && cellContent !== undefined;

          if (!hasContent) return null;

          if (column.uid === "name") {
            return (
              <div
                key={column.uid}
                className="flex w-full items-center justify-between gap-3 mb-1 [&_.truncate]:line-clamp-3 [&_.truncate]:whitespace-normal [&_.truncate]:text-ellipsis"
              >
                {cellContent}
              </div>
            );
          }

          return (
            <div key={column.uid} className="flex w-full items-center justify-between gap-3">
              <span className="text-x-xs font-semibold text-subdued uppercase tracking-wide">
                {(column.label || t(`table.columns.${column.uid}`)).toUpperCase()}
              </span>

              {cellContent}
            </div>
          );
        })}
      </XCardBody>
    </XCard>
  );
});
