"use client";

import { createContext, useContext } from "react";

export const DataViewItemLayout = createContext<"row" | "card" | "table">("row");

export function useDataViewItemLayout() {
  return useContext(DataViewItemLayout);
}
