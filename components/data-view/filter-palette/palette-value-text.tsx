"use client";

import { observer } from "mobx-react-lite";

import { FilterInputText } from "@/components/data-view/filter-modal/inputs/filter-input-text";

type Props = {
  isValidFilter: boolean;
};

export const PaletteValueText = observer(function PaletteValueText({ isValidFilter }: Props) {
  return (
    <div className="p-2">
      <FilterInputText id="draft.value" isValidFilter={isValidFilter} />
    </div>
  );
});
