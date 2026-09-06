"use client";

import { observer } from "mobx-react-lite";

import { FilterInputNumber } from "@/components/data-view/filter-modal/inputs/filter-input-number";

type Props = {
  isValidFilter: boolean;
};

export const PaletteValueNumber = observer(function PaletteValueNumber({ isValidFilter }: Props) {
  return (
    <div className="p-2">
      <FilterInputNumber id="draft.value" isValidFilter={isValidFilter} />
    </div>
  );
});
