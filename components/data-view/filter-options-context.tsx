"use client";

import type { ReactNode } from "react";
import type { FilterableField } from "@/core/base/base-get.schema";

import { createContext, useContext } from "react";

const FilterOptionsContext = createContext<FilterableField[] | undefined>(undefined);

export function FilterOptionsProvider({ fields, children }: { fields: FilterableField[]; children: ReactNode }) {
  return <FilterOptionsContext.Provider value={fields}>{children}</FilterOptionsContext.Provider>;
}

export function useFilterOptions(field: string) {
  return useContext(FilterOptionsContext)?.find((candidate) => candidate.field === field)?.options;
}
